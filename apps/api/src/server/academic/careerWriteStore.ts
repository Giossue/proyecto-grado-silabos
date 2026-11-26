import { Prisma } from "../../generated/prisma/client"
import { type Db, inTransactionAfterCommit } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, hasRows } from "../../prisma/sql"
import { careerDataLocked } from "../configuration/subjectProfileWriteStore"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { notificationScope, type WriteOptions } from "../notifications/queries"
import type { AfterCommit } from "../queue/afterCommit"
import { FinalizedChangeNotice, keepContent } from "../syllabus/finalizedChangeNotice"
import { InProgressWork, SYLLABUS_ALIVE } from "../syllabus/inProgressWork"
import { IN_CAREER } from "./academicSql"
import { SUBJECT_COLUMNS, type CareerWriteDeps, type CareerWriteTx, type SubjectColumn, type SubjectValue } from "./careerWrites"
import { insertColumns, SUBJECTS_TABLE, updateColumns } from "./columnSql"
import type { CurriculumDeps, CurriculumTx } from "./curriculumWrites"
import { deletionTx } from "./deletions"

type SubjectLock = { id: string; careerId: string; totalHours: number | null } & Record<SubjectColumn, SubjectValue>

const ACTIVE_ASSIGNMENT = (parallelId: string) => Prisma.sql`asignaciones_paralelo.paralelo_id = ${parallelId}::uuid and asignaciones_paralelo.asignacion_paralelo_activa = true`
const ELIGIBLE_USER = Prisma.sql`usuarios.usuario_activo = true and usuarios.correo_verificado_en is not null`
const SUBJECT_IN_CAREER = (subject: Prisma.Sql, careerId: string) =>
  Prisma.sql`exists (select asignaturas.asignatura_id from asignaturas where asignaturas.asignatura_id = ${subject} and asignaturas.carrera_id = ${careerId}::uuid)`
const SUBJECT_SELECTION = Prisma.sql`asignaturas.codigo_asignatura, asignaturas.nombre_asignatura, asignaturas.ciclo_asignatura,
  asignaturas.creditos_asignatura::text as creditos_asignatura, asignaturas.horas_docencia::text as horas_docencia,
  asignaturas.horas_practicas::text as horas_practicas, asignaturas.horas_autonomas::text as horas_autonomas,
  asignaturas.orden_asignatura_en_ciclo, asignaturas.unidad_curricular_asignatura, asignaturas.modalidad_asignatura::text as modalidad_asignatura,
  asignaturas.genera_silabo_asignatura`

async function first<T>(db: Db, query: Prisma.Sql): Promise<T | null> {
  return (await db.$queryRaw<T[]>(query))[0] ?? null
}

function found(db: Db, query: Prisma.Sql): Promise<boolean> {
  return hasRows(db.$queryRaw<unknown[]>(query))
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function work(db: Db, afterCommit: AfterCommit, now: number, options: WriteOptions): { work: InProgressWork; notice: FinalizedChangeNotice } {
  const progress = new InProgressWork(db, afterCommit, notificationScope(db, afterCommit, now, options.mail))
  return { work: progress, notice: new FinalizedChangeNotice(progress, now) }
}

async function lockCareer(db: Db, careerId: string, curriculumId: string = careerId): Promise<{ id: string; cycleCount: number } | null> {
  const row = await first<{ id: string; cycle_count: number }>(
    db,
    Prisma.sql`select carreras.carrera_id::text as id, carreras.numero_ciclos as cycle_count from carreras
      where carreras.carrera_id = ${careerId}::uuid and carreras.carrera_id = ${curriculumId}::uuid limit 1 for update`,
  )
  return row ? { id: row.id, cycleCount: Number(row.cycle_count) } : null
}

export function careerWriteTx(db: Db, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): CareerWriteTx {
  const { work: progress, notice } = work(db, afterCommit, now, options)
  const deletions = deletionTx(db)
  return {
    careerLocked: (careerId) => careerDataLocked(db, careerId),
    lockCareer: (careerId) => lockCareer(db, careerId),
    async lastPosition(careerId, cycle) {
      const row = await first<{ position: number | null }>(
        db,
        Prisma.sql`select max(asignaturas.orden_asignatura_en_ciclo) as position from asignaturas
          where asignaturas.carrera_id = ${careerId}::uuid and asignaturas.ciclo_asignatura = ${cycle}`,
      )
      return nullableNumber(row?.position)
    },
    async insertSubject(careerId, columns) {
      const id = uuid7()
      await db.$executeRaw(insertColumns(SUBJECTS_TABLE, { ...columns, asignatura_id: Prisma.sql`${id}::uuid`, carrera_id: Prisma.sql`${careerId}::uuid`, asignatura_activa: true }))
      return id
    },
    async subjectGeneratesSyllabus(subjectId) {
      const row = await first<{ value: boolean }>(
        db,
        Prisma.sql`select asignaturas.genera_silabo_asignatura as value from asignaturas where asignaturas.asignatura_id = ${subjectId}::uuid limit 1`,
      )
      return row ? row.value : null
    },
    async lockSubject(subjectId, careerId) {
      const row = await first<SubjectLock & { career_id: string; total_hours: number | null }>(
        db,
        Prisma.sql`select asignaturas.asignatura_id::text as id, asignaturas.carrera_id::text as career_id, asignaturas.total_horas_asignatura as total_hours,
            ${SUBJECT_SELECTION}
          from asignaturas where asignaturas.asignatura_id = ${subjectId}::uuid and asignaturas.carrera_id = ${careerId}::uuid limit 1 for update`,
      )
      if (!row) return null
      const columns = Object.fromEntries(SUBJECT_COLUMNS.map((name) => [name, row[name]])) as Record<SubjectColumn, SubjectValue>
      return { id: row.id, careerId: row.career_id, totalHours: nullableNumber(row.total_hours), columns }
    },
    async updateSubject(subjectId, columns) {
      await db.$executeRaw(updateColumns(SUBJECTS_TABLE, columns, Prisma.sql`"asignaturas"."asignatura_id" = ${subjectId}::uuid`))
    },
    async subjectsOfParallel(parallelId) {
      const rows = await db.$queryRaw<{ id: string }[]>`select paralelos.asignatura_id::text as id from paralelos where paralelos.paralelo_id = ${parallelId}::uuid`
      return rows.map((row) => row.id)
    },
    parallelsWithStartedSyllabus: (parallelIds) => progress.parallelsWithStartedSyllabus(parallelIds),
    lockParallel: (parallelId, careerId) =>
      first(
        db,
        Prisma.sql`select paralelos.paralelo_id::text as id, paralelos.asignatura_id::text as "subjectId", paralelos.codigo_paralelo as code, paralelos.jornada_paralelo as shift
          from paralelos where paralelos.paralelo_id = ${parallelId}::uuid and ${IN_CAREER(careerId)} limit 1 for update`,
      ),
    hasCoordinatorRole: (userId, careerId) =>
      found(
        db,
        Prisma.sql`select asignaciones_rol.asignacion_rol_id from asignaciones_rol
          where asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.usuario_id = ${userId}::uuid
            and asignaciones_rol.carrera_id = ${careerId}::uuid and asignaciones_rol.rol = ${"coordinador"} limit 1`,
      ),
    async effectiveRoles(userId) {
      const rows = await db.$queryRaw<{ role: string }[]>`select asignaciones_rol.rol as role from asignaciones_rol
        where asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.usuario_id = ${userId}::uuid`
      return rows.map((row) => row.role)
    },
    teacherGrant: (userId, careerId) =>
      first(
        db,
        Prisma.sql`select asignaciones_rol.asignacion_rol_id::text as id, asignaciones_rol.asignacion_rol_activa as active from asignaciones_rol
          where asignaciones_rol.usuario_id = ${userId}::uuid and asignaciones_rol.carrera_id = ${careerId}::uuid and asignaciones_rol.rol = ${"docente"}
          order by asignaciones_rol.asignacion_rol_activa desc limit 1`,
      ),
    async insertTeacherGrant(userId, careerId) {
      await db.$executeRaw`insert into asignaciones_rol (asignacion_rol_id, usuario_id, carrera_id, rol, asignacion_rol_activa, asignado_en)
        values (${uuid7()}::uuid, ${userId}::uuid, ${careerId}::uuid, ${"docente"}, true, ${fromEpoch(now)})`
    },
    async activateGrant(grantId) {
      await db.$executeRaw`update asignaciones_rol set asignacion_rol_activa = true where asignaciones_rol.asignacion_rol_id = ${grantId}::uuid`
    },
    async eligibleTeacherRole(userId, careerId) {
      const row = await first<{ id: string }>(
        db,
        Prisma.sql`select asignaciones_rol.asignacion_rol_id::text as id from asignaciones_rol
          where asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.usuario_id = ${userId}::uuid
            and asignaciones_rol.carrera_id = ${careerId}::uuid and asignaciones_rol.rol = ${"docente"}
            and exists (select usuarios.usuario_id from usuarios where usuarios.usuario_id = asignaciones_rol.usuario_id and ${ELIGIBLE_USER})
          limit 1`,
      )
      return row?.id ?? null
    },
    parallelHasActiveTeacher: (parallelId) =>
      found(db, Prisma.sql`select asignaciones_paralelo.asignacion_paralelo_id from asignaciones_paralelo where ${ACTIVE_ASSIGNMENT(parallelId)} limit 1`),
    async insertTeacherAssignment(roleId, parallelId) {
      const id = uuid7()
      await db.$executeRaw`insert into asignaciones_paralelo (asignacion_paralelo_id, asignacion_rol_id, paralelo_id, asignacion_paralelo_activa, asignado_en)
        values (${id}::uuid, ${roleId}::uuid, ${parallelId}::uuid, true, ${fromEpoch(now)})`
      return id
    },
    async restartForParallel(parallelId) {
      await progress.restartForParallel(parallelId)
    },
    lockCurrentConvocation: (careerId) =>
      first(
        db,
        Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id, convocatorias_carreras.estado_convocatoria_carrera as state,
            convocatorias_universidad.estado_convocatoria_universidad as "processState"
          from convocatorias_carreras
          inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
          where convocatorias_carreras.carrera_id = ${careerId}::uuid and convocatorias_universidad.estado_convocatoria_universidad in (${"abierto"}, ${"pausado"})
          order by convocatorias_carreras.convocatoria_carrera_id asc limit ${1} for share of convocatorias_carreras`,
      ),
    async generateParallelSyllabus(convocationId, parallelId) {
      await progress.generateConvocation(convocationId, { parallelId, allowEmpty: true, skipIncomplete: true, notifyTeacher: true })
    },
    async activeTeacherAssignment(parallelId) {
      const row = await first<{ id: string }>(
        db,
        Prisma.sql`select asignaciones_paralelo.asignacion_paralelo_id::text as id from asignaciones_paralelo where ${ACTIVE_ASSIGNMENT(parallelId)} limit 1`,
      )
      return row?.id ?? null
    },
    async lockTeacherAssignment(assignmentId, careerId) {
      return (await deletions.lockTeacherAssignment(assignmentId, careerId))?.id ?? null
    },
    deleteTeacherAssignment: (assignmentId) => deletions.deleteTeacherAssignment(assignmentId),
    async lockActiveSubject(subjectId, careerId) {
      const row = await first<{ id: string }>(
        db,
        Prisma.sql`select asignaturas.asignatura_id::text as id from asignaturas
          where asignaturas.asignatura_id = ${subjectId}::uuid and asignaturas.asignatura_activa = true and asignaturas.carrera_id = ${careerId}::uuid
          limit 1 for update`,
      )
      return row?.id ?? null
    },
    async existingParallelCodes(subjectId, upperCodes) {
      if (upperCodes.length === 0) return []
      const rows = await db.$queryRaw<{ code: string }[]>`select paralelos.codigo_paralelo as code from paralelos
        where paralelos.asignatura_id = ${subjectId}::uuid and upper(paralelos.codigo_paralelo) in (${Prisma.join(upperCodes)})`
      return rows.map((row) => row.code)
    },
    async insertParallel(subjectId, code, shift) {
      const id = uuid7()
      await db.$executeRaw`insert into paralelos (paralelo_id, asignatura_id, codigo_paralelo, jornada_paralelo) values (${id}::uuid, ${subjectId}::uuid, ${code}, ${shift as string})`
      return id
    },
    parallelCodeTaken: (subjectId, exceptId, upperCode) =>
      found(
        db,
        Prisma.sql`select paralelos.paralelo_id from paralelos
          where paralelos.asignatura_id = ${subjectId}::uuid and paralelos.paralelo_id <> ${exceptId}::uuid and upper(paralelos.codigo_paralelo) = ${upperCode} limit 1`,
      ),
    async updateParallel(parallelId, code, shift) {
      await db.$executeRaw`update paralelos set codigo_paralelo = ${code}, jornada_paralelo = ${shift as string} where paralelos.paralelo_id = ${parallelId}::uuid`
    },
    parallelHasSentSyllabus: (parallelId) => progress.parallelHasSentSyllabus(parallelId),
    async restartSentForParallel(parallelId, reason) {
      await progress.restartSentForParallel(parallelId, reason)
    },
    async refreshParallel(parallelId) {
      await progress.refreshParallel(parallelId)
    },
    guard: (confirmed, careerId, change, subjectIds) => notice.guard(confirmed, careerId, change, subjectIds),
    keepContent: (confirmed, careerId, change) => keepContent(progress, confirmed, careerId, change),
    replace: (confirmed, change, scope) => progress.replace(confirmed, change, scope),
  }
}

const REQUIREMENT = Prisma.sql`requisitos_asignatura.requisito_asignatura_id::text as id, requisitos_asignatura.tipo_requisito_asignatura as type`

export function curriculumTx(db: Db, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): CurriculumTx {
  const { work: progress, notice } = work(db, afterCommit, now, options)
  return {
    careerLocked: (careerId) => careerDataLocked(db, careerId),
    lockCareer: (careerId, curriculumId) => lockCareer(db, careerId, curriculumId),
    async maxCycle(careerId) {
      const row = await first<{ cycle: number | null }>(db, Prisma.sql`select max(asignaturas.ciclo_asignatura) as cycle from asignaturas where asignaturas.carrera_id = ${careerId}::uuid`)
      return nullableNumber(row?.cycle)
    },
    async updateCycleCount(careerId, cycleCount) {
      await db.$executeRaw`update carreras set numero_ciclos = ${cycleCount} where carreras.carrera_id = ${careerId}::uuid`
    },
    async lockSubjects(careerId, subjectIds) {
      if (subjectIds.length === 0) return []
      const rows = await db.$queryRaw<{ id: string; cycle: number | null }[]>`select asignaturas.asignatura_id::text as id, asignaturas.ciclo_asignatura as cycle from asignaturas
        where asignaturas.carrera_id = ${careerId}::uuid and asignaturas.asignatura_id in (${Prisma.join(subjectIds.map((id) => Prisma.sql`${id}::uuid`))}) for update`
      return rows.map((row) => ({ id: row.id, cycle: nullableNumber(row.cycle) }))
    },
    prerequisites: (careerId) =>
      db.$queryRaw<{ subjectId: string; requirementId: string }[]>`select requisitos_asignatura.asignatura_id::text as "subjectId", requisitos_asignatura.requisito_id::text as "requirementId"
        from requisitos_asignatura
        where requisitos_asignatura.tipo_requisito_asignatura = ${"prerrequisito"} and ${SUBJECT_IN_CAREER(Prisma.sql`requisitos_asignatura.asignatura_id`, careerId)}`,
    findRequirement: (subjectId, requirementId) =>
      first(
        db,
        Prisma.sql`select ${REQUIREMENT} from requisitos_asignatura
          where requisitos_asignatura.asignatura_id = ${subjectId}::uuid and requisitos_asignatura.requisito_id = ${requirementId}::uuid limit 1`,
      ),
    async insertRequirement(subjectId, requirementId, type) {
      const id = uuid7()
      await db.$executeRaw`insert into requisitos_asignatura (requisito_asignatura_id, asignatura_id, requisito_id, tipo_requisito_asignatura)
        values (${id}::uuid, ${subjectId}::uuid, ${requirementId}::uuid, ${type})`
      return id
    },
    lockRequirement: (requirementId, careerId) =>
      first(
        db,
        Prisma.sql`select ${REQUIREMENT} from requisitos_asignatura
          where ${SUBJECT_IN_CAREER(Prisma.sql`requisitos_asignatura.asignatura_id`, careerId)} and ${SUBJECT_IN_CAREER(Prisma.sql`requisitos_asignatura.requisito_id`, careerId)}
            and requisitos_asignatura.requisito_asignatura_id = ${requirementId}::uuid
          limit 1 for update`,
      ),
    async deleteRequirement(requirementId) {
      await db.$executeRaw`delete from requisitos_asignatura where requisitos_asignatura.requisito_asignatura_id = ${requirementId}::uuid`
    },
    async lockSubject(subjectId, careerId) {
      const row = await first<{ id: string; code: string; name: string; cycle: number | null; position: number }>(
        db,
        Prisma.sql`select asignaturas.asignatura_id::text as id, asignaturas.codigo_asignatura as code, asignaturas.nombre_asignatura as name,
            asignaturas.ciclo_asignatura as cycle, asignaturas.orden_asignatura_en_ciclo as position
          from asignaturas where asignaturas.carrera_id = ${careerId}::uuid and asignaturas.asignatura_id = ${subjectId}::uuid limit 1 for update`,
      )
      return row ? { ...row, cycle: nullableNumber(row.cycle), position: Number(row.position) } : null
    },
    async subjectUsage(subjectId) {
      const [parallels] = await db.$queryRaw<{ total: number }[]>`select count(*)::int as total from paralelos where paralelos.asignatura_id = ${subjectId}::uuid`
      const [syllabi] = await db.$queryRaw<{ total: number }[]>`select count(*)::int as total from silabos
        where exists (select paralelos.paralelo_id from paralelos where paralelos.paralelo_id = silabos.paralelo_id and paralelos.asignatura_id = ${subjectId}::uuid)
          and ${SYLLABUS_ALIVE}`
      return { parallels: Number(parallels?.total ?? 0), syllabi: Number(syllabi?.total ?? 0) }
    },
    async deleteSubject(subjectId) {
      await db.$executeRaw`delete from requisitos_asignatura where requisitos_asignatura.asignatura_id = ${subjectId}::uuid or requisitos_asignatura.requisito_id = ${subjectId}::uuid`
      await db.$executeRaw`delete from asignaturas where asignaturas.asignatura_id = ${subjectId}::uuid`
    },
    async lockCycleSubjects(careerId, cycle) {
      const rows = await db.$queryRaw<{ id: string; position: number }[]>`select asignaturas.asignatura_id::text as id, asignaturas.orden_asignatura_en_ciclo as position from asignaturas
        where asignaturas.carrera_id = ${careerId}::uuid and asignaturas.ciclo_asignatura = ${cycle}
        order by asignaturas.orden_asignatura_en_ciclo asc, asignaturas.nombre_asignatura asc for update`
      return rows.map((row) => ({ id: row.id, position: Number(row.position) }))
    },
    async setPosition(subjectId, position) {
      await db.$executeRaw`update asignaturas set orden_asignatura_en_ciclo = ${position} where asignaturas.asignatura_id = ${subjectId}::uuid`
    },
    async sync(confirmed, careerId) {
      await progress.sync(confirmed, careerId)
    },
    guard: (confirmed, careerId, change) => notice.guard(confirmed, careerId, change),
  }
}

function careerActive(db: Db) {
  return (careerId: string) =>
    found(db, Prisma.sql`select carreras.carrera_id from carreras where carreras.carrera_id = ${careerId}::uuid and carreras.carrera_activa = true limit 1`)
}

function subjectExists(db: Db, ...conditions: Prisma.Sql[]): Promise<boolean> {
  return found(db, Prisma.sql`select asignaturas.asignatura_id from asignaturas where ${Prisma.join(conditions, " and ")} limit 1`)
}

export function createCareerWriteDeps(prisma: PrismaService, options: WriteOptions = {}): Omit<CareerWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    careerActive: careerActive(prisma),
    subjectInCareer: (subjectId, careerId) => subjectExists(prisma, Prisma.sql`asignaturas.asignatura_id = ${subjectId}::uuid`, Prisma.sql`asignaturas.carrera_id = ${careerId}::uuid`),
    activeSubjectInCareer: (subjectId, careerId) =>
      subjectExists(
        prisma,
        Prisma.sql`asignaturas.asignatura_id = ${subjectId}::uuid`,
        Prisma.sql`asignaturas.asignatura_activa = true`,
        Prisma.sql`asignaturas.carrera_id = ${careerId}::uuid`,
      ),
    subjectCodeTaken: (careerId, code, except) =>
      subjectExists(
        prisma,
        ...[
          Prisma.sql`asignaturas.codigo_asignatura = ${code}`,
          Prisma.sql`asignaturas.carrera_id = ${careerId}::uuid`,
          ...(except === null ? [] : [Prisma.sql`asignaturas.asignatura_id <> ${except}::uuid`]),
        ],
      ),
    eligibleUserExists: (userId) => found(prisma, Prisma.sql`select usuarios.usuario_id from usuarios where usuarios.usuario_id = ${userId}::uuid and ${ELIGIBLE_USER} limit 1`),
    parallelInCareer: (parallelId, careerId) =>
      found(
        prisma,
        Prisma.sql`select paralelos.paralelo_id from paralelos where paralelos.paralelo_id = ${parallelId}::uuid
          and paralelos.asignatura_id in (select asignaturas.asignatura_id from asignaturas where asignaturas.asignatura_activa = true and asignaturas.carrera_id = ${careerId}::uuid)
          limit 1`,
      ),
    transaction: (run) => inTransactionAfterCommit(prisma, (tx, afterCommit) => run(careerWriteTx(tx, afterCommit, now(), options))),
  }
}

export function createCurriculumDeps(prisma: PrismaService, options: WriteOptions = {}): Omit<CurriculumDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    careerActive: careerActive(prisma),
    transaction: (run) => inTransactionAfterCommit(prisma, (tx, afterCommit) => run(curriculumTx(tx, afterCommit, now(), options))),
  }
}
