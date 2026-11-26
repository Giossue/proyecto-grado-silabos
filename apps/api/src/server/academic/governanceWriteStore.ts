import { Prisma } from "../../generated/prisma/client"
import { type Db, inTransactionAfterCommit } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { hasRows, jsonbValue } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { notificationScope, type WriteOptions } from "../notifications/queries"
import type { AfterCommit } from "../queue/afterCommit"
import { FinalizedChangeNotice } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { CAREERS_TABLE, FACULTIES_TABLE, PERIODS_TABLE, updateColumns, type TableColumns } from "./columnSql"
import type { GovernanceWriteDeps, GovernanceWriteTx } from "./governanceWrites"
import { insertStoredObject } from "./supportDocumentWriteStore"

const TABLES: Record<"facultad" | "carrera" | "periodo", [TableColumns, Prisma.Sql]> = {
  facultad: [FACULTIES_TABLE, Prisma.raw('"facultades"."facultad_id"')],
  carrera: [CAREERS_TABLE, Prisma.raw('"carreras"."carrera_id"')],
  periodo: [PERIODS_TABLE, Prisma.raw('"periodos_academicos"."periodo_academico_id"')],
}

function processWhere(...conditions: Prisma.Sql[]): Prisma.Sql {
  return Prisma.sql`exists (select proceso.convocatoria_universidad_id from convocatorias_universidad proceso
    where ${Prisma.join([Prisma.sql`proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id`, ...conditions], " and ")})`
}

function convocationExists(db: Db, ...conditions: Prisma.Sql[]): Promise<boolean> {
  return found(
    db,
    Prisma.sql`select convocatoria.convocatoria_carrera_id from convocatorias_carreras convocatoria
      where ${Prisma.join([...conditions, processWhere()], " and ")} limit 1`,
  )
}

async function first<T>(db: Db, query: Prisma.Sql): Promise<T | null> {
  return (await db.$queryRaw<T[]>(query))[0] ?? null
}

function found(db: Db, query: Prisma.Sql): Promise<boolean> {
  return hasRows(db.$queryRaw<unknown[]>(query))
}

export function governanceWriteTx(db: Db, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): GovernanceWriteTx {
  const work = new InProgressWork(db, afterCommit, notificationScope(db, afterCommit, now, options.mail))
  const notice = new FinalizedChangeNotice(work, now)
  return {
    async createCareer(data) {
      const id = uuid7()
      await db.$executeRaw`insert into carreras (carrera_id, facultad_id, codigo_carrera, nombre_carrera, carrera_activa, modalidad_carrera, numero_ciclos)
        values (${id}::uuid, ${data.facultyId}::uuid, ${data.code}, ${data.name}, true, ${data.modality}, ${data.cycleCount})`
      return id
    },
    async createFaculty(data) {
      const id = uuid7()
      await db.$executeRaw`insert into facultades (facultad_id, nombre_facultad, bibliotecas_koha_facultad, facultad_activa)
        values (${id}::uuid, ${data.name}, ${jsonbValue(JSON.stringify(data.libraries))}, true)`
      return id
    },
    insertObject: (row) => insertStoredObject(db, row),
    async createPeriod(data) {
      const id = uuid7()
      await db.$executeRaw`insert into periodos_academicos (periodo_academico_id, codigo_periodo_academico, fecha_inicio_periodo, fecha_fin_periodo, cantidad_semanas_lectivas)
        values (${id}::uuid, ${data.code}, ${data.startsOn}, ${data.endsOn}, ${data.weeks})`
      return id
    },
    lockFaculty: (id) =>
      first(
        db,
        Prisma.sql`select facultades.facultad_id::text as id, facultades.nombre_facultad as name,
            facultades.bibliotecas_koha_facultad::text as libraries
          from facultades where facultades.facultad_id = ${id}::uuid limit 1 for update`,
      ),
    lockCareer: (id) =>
      first(
        db,
        Prisma.sql`select carreras.carrera_id::text as id, carreras.facultad_id::text as "facultyId", carreras.codigo_carrera as code,
            carreras.nombre_carrera as name, carreras.modalidad_carrera::text as modality
          from carreras where carreras.carrera_id = ${id}::uuid limit 1 for update`,
      ),
    async lockPeriod(id) {
      const row = await first<{ id: string; code: string; startsOn: string; endsOn: string; weeks: number | null }>(
        db,
        Prisma.sql`select periodos_academicos.periodo_academico_id::text as id, periodos_academicos.codigo_periodo_academico as code,
            to_char(periodos_academicos.fecha_inicio_periodo, 'YYYY-MM-DD') as "startsOn", to_char(periodos_academicos.fecha_fin_periodo, 'YYYY-MM-DD') as "endsOn",
            periodos_academicos.cantidad_semanas_lectivas as weeks
          from periodos_academicos where periodos_academicos.periodo_academico_id = ${id}::uuid limit 1 for update`,
      )
      return row ? { ...row, weeks: row.weeks === null ? null : Number(row.weeks) } : null
    },
    async lockActiveFaculty(id) {
      const row = await first<{ active: boolean }>(
        db,
        Prisma.sql`select facultades.facultad_activa as active from facultades where facultades.facultad_id = ${id}::uuid limit 1 for update`,
      )
      return row?.active === true
    },
    async careersOfFaculty(facultyId) {
      const rows = await db.$queryRaw<{ id: string }[]>`select carreras.carrera_id::text as id from carreras where carreras.facultad_id = ${facultyId}::uuid`
      return rows.map((row) => row.id)
    },
    periodRunning: (periodId) =>
      convocationExists(
        db,
        Prisma.sql`convocatoria.estado_convocatoria_carrera = ${"abierto"}`,
        processWhere(Prisma.sql`proceso.estado_convocatoria_universidad = ${"abierto"}`),
        processWhere(Prisma.sql`proceso.periodo_academico_id = ${periodId}::uuid`),
      ),
    async updateColumns(entity, id, columns) {
      const [table, key] = TABLES[entity]
      await db.$executeRaw(updateColumns(table, columns, Prisma.sql`${key} = ${id}::uuid`))
    },
    facultyHasActiveCareers: (id) =>
      found(db, Prisma.sql`select carreras.carrera_id from carreras where carreras.facultad_id = ${id}::uuid and carreras.carrera_activa = true limit 1`),
    careerInProgress: (id) =>
      convocationExists(
        db,
        Prisma.sql`convocatoria.carrera_id = ${id}::uuid`,
        Prisma.sql`convocatoria.estado_convocatoria_carrera <> ${"cerrado"}`,
        processWhere(Prisma.sql`proceso.estado_convocatoria_universidad <> ${"cerrado"}`),
      ),
    async retireCareerUsers(id) {
      const assignments = await db.$queryRaw<{ id: string; user_id: string }[]>`select asignaciones_rol.asignacion_rol_id::text as id, asignaciones_rol.usuario_id::text as user_id
        from asignaciones_rol where asignaciones_rol.carrera_id = ${id}::uuid and asignaciones_rol.asignacion_rol_activa = true for update`
      for (const assignment of assignments) {
        await db.$executeRaw`delete from asignaciones_paralelo
          where asignaciones_paralelo.asignacion_rol_id = ${assignment.id}::uuid and asignaciones_paralelo.asignacion_paralelo_activa = true`
        await db.$executeRaw`update asignaciones_rol set asignacion_rol_activa = false where asignaciones_rol.asignacion_rol_id = ${assignment.id}::uuid`
        await db.$executeRaw`delete from sesiones_usuario where sesiones_usuario.user_id = ${assignment.user_id}::uuid`
        const stillActive = await found(
          db,
          Prisma.sql`select asignaciones_rol.asignacion_rol_id from asignaciones_rol
            where asignaciones_rol.usuario_id = ${assignment.user_id}::uuid and asignaciones_rol.asignacion_rol_activa = true limit 1`,
        )
        if (!stillActive) {
          await db.$executeRaw`update invitaciones_activacion set invalidada_en = now()
            where invitaciones_activacion.usuario_id = ${assignment.user_id}::uuid and invitaciones_activacion.usada_en is null and invitaciones_activacion.invalidada_en is null`
        }
      }
      return assignments.length
    },
    async setActive(entity, id, active) {
      if (entity === "facultad") await db.$executeRaw`update facultades set facultad_activa = ${active} where facultades.facultad_id = ${id}::uuid`
      else await db.$executeRaw`update carreras set carrera_activa = ${active} where carreras.carrera_id = ${id}::uuid`
    },
    replace: (confirmed, change, periodId) => (periodId === null ? change() : work.replace(confirmed, change, { periodId })),
    guard: (confirmed, careerIds, change, periodId) => notice.guard(confirmed, careerIds, change, null, periodId),
    async sync(confirmed, careerIds) {
      await work.sync(confirmed, careerIds)
    },
  }
}

export function createGovernanceWriteDeps(prisma: PrismaService, options: WriteOptions = {}): Omit<GovernanceWriteDeps, "bridge" | "deletions"> {
  const now = options.now ?? systemNow
  return {
    now,
    activeFacultyExists: (id) =>
      found(prisma, Prisma.sql`select facultades.facultad_id from facultades where facultades.facultad_id = ${id}::uuid and facultades.facultad_activa = true limit 1`),
    facultyExists: (id) => found(prisma, Prisma.sql`select facultades.facultad_id from facultades where facultades.facultad_id = ${id}::uuid limit 1`),
    careerCodeTaken: (code, except) =>
      found(
        prisma,
        Prisma.sql`select carreras.carrera_id from carreras where carreras.codigo_carrera = ${code}
          ${except === null ? Prisma.empty : Prisma.sql`and carreras.carrera_id::text <> ${except}`} limit 1`,
      ),
    transaction: (work) => inTransactionAfterCommit(prisma, (tx, afterCommit) => work(governanceWriteTx(tx, afterCommit, now(), options))),
  }
}
