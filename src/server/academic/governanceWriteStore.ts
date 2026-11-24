import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { uuidList } from "../laravel/sql"
import { uuid7 } from "../laravel/uuid7"
import { notificationScope, systemNow, type WriteOptions } from "../notifications/queries"
import { insertAuditEvent } from "../operations/recordAuditEvent"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { FinalizedChangeNotice } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { GovernanceWriteDeps, GovernanceWriteTx } from "./governanceWrites"
import { insertStoredObject } from "./supportDocumentWriteStore"

const TABLES: Record<string, { table: SQL; key: SQL }> = {
  facultad: { table: sql`facultades`, key: sql`facultad_id` },
  carrera: { table: sql`carreras`, key: sql`carrera_id` },
  periodo: { table: sql`periodos_academicos`, key: sql`periodo_academico_id` },
}

const PROCESS_ALIVE = sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id`

async function exists(executor: Executor, query: SQL): Promise<boolean> {
  const [row] = await rowsOf<{ found: boolean }>(executor, sql`select exists (${query}) as found`)
  return row?.found === true
}

export function governanceWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): GovernanceWriteTx {
  const work = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now, options.mail))
  const notice = new FinalizedChangeNotice(work, now)
  return {
    async createCareer(data) {
      const id = uuid7()
      await executor.execute(sql`insert into carreras (carrera_id, facultad_id, codigo_carrera, nombre_carrera, carrera_activa, modalidad_carrera, numero_ciclos)
        values (${id}::uuid, ${data.facultyId}::uuid, ${data.code}, ${data.name}, true, ${data.modality}, ${data.cycleCount})`)
      return id
    },
    async createFaculty(data) {
      const id = uuid7()
      await executor.execute(sql`insert into facultades (facultad_id, nombre_facultad, campus_facultad, bibliotecas_koha_facultad, facultad_activa)
        values (${id}::uuid, ${data.name}, ${data.campus}, ${JSON.stringify(data.libraries)}::jsonb, true)`)
      return id
    },
    insertObject: (row) => insertStoredObject(executor, row),
    async createPeriod(data) {
      const id = uuid7()
      await executor.execute(sql`insert into periodos_academicos (periodo_academico_id, codigo_periodo_academico, fecha_inicio_periodo, fecha_fin_periodo, cantidad_semanas_lectivas)
        values (${id}::uuid, ${data.code}, ${data.startsOn}::date, ${data.endsOn}::date, ${data.weeks})`)
      return id
    },
    async lockFaculty(id) {
      const [row] = await rowsOf<{ id: string; name: string; campus: string; libraries: string | null }>(
        executor,
        sql`select facultad_id::text as id, nombre_facultad as name, campus_facultad as campus, bibliotecas_koha_facultad::text as libraries
          from facultades where facultad_id = ${id}::uuid limit 1 for update`,
      )
      return row ?? null
    },
    async lockCareer(id) {
      const [row] = await rowsOf<{ id: string; faculty_id: string; code: string; name: string; modality: string | null }>(
        executor,
        sql`select carrera_id::text as id, facultad_id::text as faculty_id, codigo_carrera as code, nombre_carrera as name, modalidad_carrera::text as modality
          from carreras where carrera_id = ${id}::uuid limit 1 for update`,
      )
      return row ? { id: row.id, facultyId: row.faculty_id, code: row.code, name: row.name, modality: row.modality } : null
    },
    async lockPeriod(id) {
      const [row] = await rowsOf<{ id: string; code: string; starts_on: string; ends_on: string; weeks: number | null }>(
        executor,
        sql`select periodo_academico_id::text as id, codigo_periodo_academico as code, to_char(fecha_inicio_periodo, 'YYYY-MM-DD') as starts_on,
            to_char(fecha_fin_periodo, 'YYYY-MM-DD') as ends_on, cantidad_semanas_lectivas as weeks
          from periodos_academicos where periodo_academico_id = ${id}::uuid limit 1 for update`,
      )
      return row ? { id: row.id, code: row.code, startsOn: row.starts_on, endsOn: row.ends_on, weeks: row.weeks === null ? null : Number(row.weeks) } : null
    },
    async lockActiveFaculty(id) {
      const [row] = await rowsOf<{ active: boolean }>(executor, sql`select facultad_activa as active from facultades where facultad_id = ${id}::uuid limit 1 for update`)
      return row?.active === true
    },
    async facultyNames(ids) {
      const rows = await rowsOf<{ id: string; name: string }>(
        executor,
        sql`select facultad_id::text as id, nombre_facultad as name from facultades where facultad_id in (${uuidList(ids)})`,
      )
      return new Map(rows.map((row) => [row.id, row.name]))
    },
    async careersOfFaculty(facultyId) {
      const rows = await rowsOf<{ id: string }>(executor, sql`select carrera_id::text as id from carreras where facultad_id = ${facultyId}::uuid`)
      return rows.map((row) => row.id)
    },
    periodRunning: (periodId) =>
      exists(
        executor,
        sql`select 1 from convocatorias_carreras convocatoria where convocatoria.estado_convocatoria_carrera = 'abierta'
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            and proceso.estado_convocatoria_universidad = 'abierto')
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            and proceso.periodo_academico_id = ${periodId}::uuid)
          and ${PROCESS_ALIVE})`,
      ),
    async updateColumns(entity, id, columns) {
      const { table, key } = TABLES[entity]
      const assignments = Object.entries(columns).map(([column, value]) => {
        if (column === "bibliotecas_koha_facultad") return sql`${sql.identifier(column)} = ${JSON.stringify(value)}::jsonb`
        if (column === "fecha_inicio_periodo" || column === "fecha_fin_periodo") return sql`${sql.identifier(column)} = ${value}::date`
        if (column === "facultad_id" || column === "logo_archivo_id") return sql`${sql.identifier(column)} = ${value}::uuid`
        return sql`${sql.identifier(column)} = ${value}`
      })
      await executor.execute(sql`update ${table} set ${sql.join(assignments, sql`, `)} where ${key} = ${id}::uuid`)
    },
    facultyHasActiveCareers: (id) => exists(executor, sql`select 1 from carreras where facultad_id = ${id}::uuid and carrera_activa = true`),
    careerInProgress: (id) =>
      exists(
        executor,
        sql`select 1 from convocatorias_carreras convocatoria where convocatoria.carrera_id = ${id}::uuid and convocatoria.estado_convocatoria_carrera != 'cerrada'
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            and proceso.estado_convocatoria_universidad != 'cerrado')
          and ${PROCESS_ALIVE})`,
      ),
    careerHasActiveRoles: (id) => exists(executor, sql`select 1 from asignaciones_rol where carrera_id = ${id}::uuid and asignacion_rol_activa = true`),
    async setActive(entity, id, active) {
      if (entity === "facultad") await executor.execute(sql`update facultades set facultad_activa = ${active} where facultad_id = ${id}::uuid`)
      else await executor.execute(sql`update carreras set carrera_activa = ${active} where carrera_id = ${id}::uuid`)
    },
    replace: (confirmed, change, periodId) => (periodId === null ? change() : work.replace(confirmed, change, { periodId })),
    guard: (confirmed, careerIds, change, periodId) => notice.guard(confirmed, careerIds, change, null, periodId),
    async sync(confirmed, careerIds) {
      await work.sync(confirmed, careerIds)
    },
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
  }
}

export function governanceWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<GovernanceWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    now,
    activeFacultyExists: (id) => exists(executor, sql`select 1 from facultades where facultad_id = ${id}::uuid and facultad_activa = true`),
    facultyExists: (id) => exists(executor, sql`select 1 from facultades where facultad_id = ${id}::uuid`),
    careerCodeTaken: (code, except) =>
      exists(executor, sql`select 1 from carreras where codigo_carrera = ${code} ${except === null ? sql`` : sql`and carrera_id::text <> ${except}`}`),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(governanceWriteTx(inner, afterCommit, now(), options)))),
  }
}

export function createGovernanceWriteDeps(): Omit<GovernanceWriteDeps, "bridge"> {
  return governanceWriteDepsOn(db as unknown as Executor, dbTransaction)
}
