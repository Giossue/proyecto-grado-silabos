import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { careerDataLocked } from "../configuration/subjectProfileWriteStore"
import { uuid7 } from "../laravel/uuid7"
import { notificationScope, systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { FinalizedChangeNotice, keepContent } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import { SUBJECT_COLUMNS, type CareerWriteDeps, type CareerWriteTx, type SubjectColumn, type SubjectValue } from "./careerWrites"
import type { CurriculumDeps, CurriculumTx } from "./curriculumWrites"
import { deletionTx } from "./deletions"

const IN_CAREER = (careerId: string) => sql`exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id and asignaturas.carrera_id = ${careerId}::uuid)`
const TEXT_COLUMNS = new Set<SubjectColumn>(["creditos_asignatura", "horas_docencia", "horas_practicas", "horas_autonomas", "modalidad_asignatura"])

async function exists(executor: Executor, query: SQL): Promise<boolean> {
  const [row] = await rowsOf<{ found: boolean }>(executor, sql`select exists (${query}) as found`)
  return row?.found === true
}

function subjectSelect(): SQL {
  return sql.join(
    SUBJECT_COLUMNS.map((column) => (TEXT_COLUMNS.has(column) ? sql`${sql.identifier(column)}::text as ${sql.identifier(column)}` : sql.identifier(column))),
    sql`, `,
  )
}

function work(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions): { work: InProgressWork; notice: FinalizedChangeNotice } {
  const progress = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now, options.mail))
  return { work: progress, notice: new FinalizedChangeNotice(progress, now) }
}

async function lockCareer(executor: Executor, careerId: string, curriculumId: string = careerId): Promise<{ id: string; cycleCount: number } | null> {
  const [row] = await rowsOf<{ id: string; cycle_count: number }>(
    executor,
    sql`select carrera_id::text as id, numero_ciclos as cycle_count from carreras where carrera_id = ${careerId}::uuid and carrera_id = ${curriculumId}::uuid limit 1 for update`,
  )
  return row ? { id: row.id, cycleCount: Number(row.cycle_count) } : null
}

export function careerWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): CareerWriteTx {
  const { work: progress, notice } = work(executor, afterCommit, now, options)
  const deletions = deletionTx(executor)
  return {
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    lockCareer: (careerId) => lockCareer(executor, careerId),
    async lastPosition(careerId, cycle) {
      const [row] = await rowsOf<{ position: number | null }>(
        executor,
        sql`select max(orden_asignatura_en_ciclo) as position from asignaturas where carrera_id = ${careerId}::uuid and ciclo_asignatura = ${cycle}`,
      )
      return row?.position === null || row?.position === undefined ? null : Number(row.position)
    },
    async insertSubject(careerId, columns) {
      const id = uuid7()
      await executor.execute(sql`insert into asignaturas (asignatura_id, carrera_id, ${sql.join(
        SUBJECT_COLUMNS.map((column) => sql.identifier(column)),
        sql`, `,
      )}, asignatura_activa)
        values (${id}::uuid, ${careerId}::uuid, ${sql.join(
          SUBJECT_COLUMNS.map((column) => sql`${columns[column]}`),
          sql`, `,
        )}, true)`)
      return id
    },
    async subjectGeneratesSyllabus(subjectId) {
      const [row] = await rowsOf<{ value: boolean }>(executor, sql`select genera_silabo_asignatura as value from asignaturas where asignatura_id = ${subjectId}::uuid limit 1`)
      return row ? row.value : null
    },
    async lockSubject(subjectId, careerId) {
      const [row] = await rowsOf<Record<SubjectColumn, SubjectValue> & { id: string; career_id: string; total_hours: number | null }>(
        executor,
        sql`select asignatura_id::text as id, carrera_id::text as career_id, total_horas_asignatura as total_hours, ${subjectSelect()}
          from asignaturas where asignatura_id = ${subjectId}::uuid and carrera_id = ${careerId}::uuid limit 1 for update`,
      )
      if (!row) return null
      const columns = Object.fromEntries(SUBJECT_COLUMNS.map((column) => [column, row[column]])) as Record<SubjectColumn, SubjectValue>
      return { id: row.id, careerId: row.career_id, totalHours: row.total_hours === null ? null : Number(row.total_hours), columns }
    },
    async updateSubject(subjectId, columns) {
      const assignments = Object.entries(columns).map(([column, value]) => sql`${sql.identifier(column)} = ${value}`)
      await executor.execute(sql`update asignaturas set ${sql.join(assignments, sql`, `)} where asignatura_id = ${subjectId}::uuid`)
    },
    async subjectsOfParallel(parallelId) {
      const rows = await rowsOf<{ id: string }>(executor, sql`select asignatura_id::text as id from paralelos where paralelo_id = ${parallelId}::uuid`)
      return rows.map((row) => row.id)
    },
    parallelsWithStartedSyllabus: (parallelIds) => progress.parallelsWithStartedSyllabus(parallelIds),
    async lockParallel(parallelId, careerId) {
      const [row] = await rowsOf<{ id: string; subject_id: string; code: string; shift: string }>(
        executor,
        sql`select paralelos.paralelo_id::text as id, paralelos.asignatura_id::text as subject_id, paralelos.codigo_paralelo as code, paralelos.jornada_paralelo as shift
          from paralelos where paralelos.paralelo_id = ${parallelId}::uuid and ${IN_CAREER(careerId)} limit 1 for update`,
      )
      return row ? { id: row.id, subjectId: row.subject_id, code: row.code, shift: row.shift } : null
    },
    hasCoordinatorRole: (userId, careerId) =>
      exists(
        executor,
        sql`select * from asignaciones_rol where asignacion_rol_activa = true and usuario_id = ${userId}::uuid and carrera_id = ${careerId}::uuid and rol = 'coordinador'`,
      ),
    async effectiveRoles(userId) {
      const rows = await rowsOf<{ role: string }>(executor, sql`select rol as role from asignaciones_rol where asignacion_rol_activa = true and usuario_id = ${userId}::uuid`)
      return rows.map((row) => row.role)
    },
    async teacherGrant(userId, careerId) {
      const [row] = await rowsOf<{ id: string; active: boolean }>(
        executor,
        sql`select asignacion_rol_id::text as id, asignacion_rol_activa as active from asignaciones_rol
          where usuario_id = ${userId}::uuid and carrera_id = ${careerId}::uuid and rol = 'docente' order by asignacion_rol_activa desc limit 1`,
      )
      return row ?? null
    },
    async insertTeacherGrant(userId, careerId) {
      await executor.execute(sql`insert into asignaciones_rol (asignacion_rol_id, usuario_id, carrera_id, rol, asignacion_rol_activa, asignado_en)
        values (${uuid7()}::uuid, ${userId}::uuid, ${careerId}::uuid, 'docente', true, to_timestamp(${now}))`)
    },
    async activateGrant(grantId) {
      await executor.execute(sql`update asignaciones_rol set asignacion_rol_activa = true where asignacion_rol_id = ${grantId}::uuid`)
    },
    async eligibleTeacherRole(userId, careerId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select asignaciones_rol.asignacion_rol_id::text as id from asignaciones_rol
          where asignacion_rol_activa = true and usuario_id = ${userId}::uuid and carrera_id = ${careerId}::uuid and rol = 'docente'
            and exists (select * from usuarios where asignaciones_rol.usuario_id = usuarios.usuario_id and usuario_activo = true and correo_verificado_en is not null)
          limit 1`,
      )
      return row?.id ?? null
    },
    parallelHasActiveTeacher: (parallelId) =>
      exists(executor, sql`select * from asignaciones_paralelo where paralelo_id = ${parallelId}::uuid and asignacion_paralelo_activa = true`),
    async insertTeacherAssignment(roleId, parallelId) {
      const id = uuid7()
      await executor.execute(sql`insert into asignaciones_paralelo (asignacion_paralelo_id, asignacion_rol_id, paralelo_id, asignacion_paralelo_activa, asignado_en)
        values (${id}::uuid, ${roleId}::uuid, ${parallelId}::uuid, true, to_timestamp(${now}))`)
      return id
    },
    async restartForParallel(parallelId) {
      await progress.restartForParallel(parallelId)
    },
    async activeTeacherAssignment(parallelId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select asignacion_paralelo_id::text as id from asignaciones_paralelo where paralelo_id = ${parallelId}::uuid and asignacion_paralelo_activa = true limit 1`,
      )
      return row?.id ?? null
    },
    async lockTeacherAssignment(assignmentId, careerId) {
      return (await deletions.lockTeacherAssignment(assignmentId, careerId))?.id ?? null
    },
    deleteTeacherAssignment: (assignmentId) => deletions.deleteTeacherAssignment(assignmentId),
    async lockActiveSubject(subjectId, careerId) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        sql`select asignatura_id::text as id from asignaturas where asignatura_id = ${subjectId}::uuid and asignatura_activa = true and carrera_id = ${careerId}::uuid
          limit 1 for update`,
      )
      return row?.id ?? null
    },
    async existingParallelCodes(subjectId, upperCodes) {
      const rows = await rowsOf<{ code: string }>(
        executor,
        sql`select codigo_paralelo as code from paralelos where asignatura_id = ${subjectId}::uuid and upper(codigo_paralelo) in (${sql.join(
          upperCodes.map((code) => sql`${code}`),
          sql`, `,
        )})`,
      )
      return rows.map((row) => row.code)
    },
    async insertParallel(subjectId, code, shift) {
      const id = uuid7()
      await executor.execute(sql`insert into paralelos (paralelo_id, asignatura_id, codigo_paralelo, jornada_paralelo) values (${id}::uuid, ${subjectId}::uuid, ${code}, ${shift})`)
      return id
    },
    parallelCodeTaken: (subjectId, exceptId, upperCode) =>
      exists(
        executor,
        sql`select * from paralelos where asignatura_id = ${subjectId}::uuid and paralelo_id != ${exceptId}::uuid and upper(codigo_paralelo) = ${upperCode}`,
      ),
    async updateParallel(parallelId, code, shift) {
      await executor.execute(sql`update paralelos set codigo_paralelo = ${code}, jornada_paralelo = ${shift} where paralelo_id = ${parallelId}::uuid`)
    },
    parallelHasSentSyllabus: (parallelId) => progress.parallelHasSentSyllabus(parallelId),
    async restartSentForParallel(parallelId) {
      await progress.restartSentForParallel(parallelId)
    },
    async refreshParallel(parallelId) {
      await progress.refreshParallel(parallelId)
    },
    guard: (confirmed, careerId, change, subjectIds) => notice.guard(confirmed, careerId, change, subjectIds),
    keepContent: (confirmed, careerId, change) => keepContent(progress, confirmed, careerId, change),
    replace: (confirmed, change, scope) => progress.replace(confirmed, change, scope),
  }
}

export function curriculumTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): CurriculumTx {
  const { work: progress, notice } = work(executor, afterCommit, now, options)
  return {
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    lockCareer: (careerId, curriculumId) => lockCareer(executor, careerId, curriculumId),
    async maxCycle(careerId) {
      const [row] = await rowsOf<{ cycle: number | null }>(executor, sql`select max(ciclo_asignatura) as cycle from asignaturas where carrera_id = ${careerId}::uuid`)
      return row?.cycle === null || row?.cycle === undefined ? null : Number(row.cycle)
    },
    async updateCycleCount(careerId, cycleCount) {
      await executor.execute(sql`update carreras set numero_ciclos = ${cycleCount} where carrera_id = ${careerId}::uuid`)
    },
    async lockSubjects(careerId, subjectIds) {
      const rows = await rowsOf<{ id: string; cycle: number | null }>(
        executor,
        sql`select asignatura_id::text as id, ciclo_asignatura as cycle from asignaturas
          where carrera_id = ${careerId}::uuid and asignatura_id in (${sql.join(
            subjectIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) for update`,
      )
      return rows.map((row) => ({ id: row.id, cycle: row.cycle === null ? null : Number(row.cycle) }))
    },
    async prerequisites(careerId) {
      return rowsOf<{ subjectId: string; requirementId: string }>(
        executor,
        sql`select requisitos_asignatura.asignatura_id::text as "subjectId", requisitos_asignatura.requisito_id::text as "requirementId" from requisitos_asignatura
          where tipo_requisito_asignatura = 'prerrequisito'
            and exists (select * from asignaturas where requisitos_asignatura.asignatura_id = asignaturas.asignatura_id and carrera_id = ${careerId}::uuid)`,
      )
    },
    async findRequirement(subjectId, requirementId) {
      const [row] = await rowsOf<{ id: string; type: string }>(
        executor,
        sql`select requisito_asignatura_id::text as id, tipo_requisito_asignatura as type from requisitos_asignatura
          where asignatura_id = ${subjectId}::uuid and requisito_id = ${requirementId}::uuid limit 1`,
      )
      return row ?? null
    },
    async insertRequirement(subjectId, requirementId, type) {
      const id = uuid7()
      await executor.execute(sql`insert into requisitos_asignatura (requisito_asignatura_id, asignatura_id, requisito_id, tipo_requisito_asignatura)
        values (${id}::uuid, ${subjectId}::uuid, ${requirementId}::uuid, ${type})`)
      return id
    },
    async lockRequirement(requirementId, careerId) {
      const [row] = await rowsOf<{ id: string; type: string }>(
        executor,
        sql`select requisito_asignatura_id::text as id, tipo_requisito_asignatura as type from requisitos_asignatura
          where exists (select * from asignaturas where requisitos_asignatura.asignatura_id = asignaturas.asignatura_id and carrera_id = ${careerId}::uuid)
            and exists (select * from asignaturas where requisitos_asignatura.requisito_id = asignaturas.asignatura_id and carrera_id = ${careerId}::uuid)
            and requisito_asignatura_id = ${requirementId}::uuid limit 1 for update`,
      )
      return row ?? null
    },
    async deleteRequirement(requirementId) {
      await executor.execute(sql`delete from requisitos_asignatura where requisito_asignatura_id = ${requirementId}::uuid`)
    },
    async lockSubject(subjectId, careerId) {
      const [row] = await rowsOf<{ id: string; code: string; name: string; cycle: number | null; position: number }>(
        executor,
        sql`select asignatura_id::text as id, codigo_asignatura as code, nombre_asignatura as name, ciclo_asignatura as cycle, orden_asignatura_en_ciclo as position
          from asignaturas where carrera_id = ${careerId}::uuid and asignatura_id = ${subjectId}::uuid limit 1 for update`,
      )
      return row ? { ...row, cycle: row.cycle === null ? null : Number(row.cycle), position: Number(row.position) } : null
    },
    async subjectUsage(subjectId) {
      const [row] = await rowsOf<{ parallels: number; syllabi: number }>(
        executor,
        sql`select (select count(*)::int from paralelos where asignatura_id = ${subjectId}::uuid) as parallels,
          (select count(*)::int from silabos where exists (select * from paralelos where silabos.paralelo_id = paralelos.paralelo_id and asignatura_id = ${subjectId}::uuid)
            and exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
              and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))) as syllabi`,
      )
      return { parallels: Number(row.parallels), syllabi: Number(row.syllabi) }
    },
    async deleteSubject(subjectId) {
      await executor.execute(sql`delete from requisitos_asignatura where asignatura_id = ${subjectId}::uuid or requisito_id = ${subjectId}::uuid`)
      await executor.execute(sql`delete from asignaturas where asignatura_id = ${subjectId}::uuid`)
    },
    async lockCycleSubjects(careerId, cycle) {
      const rows = await rowsOf<{ id: string; position: number }>(
        executor,
        sql`select asignatura_id::text as id, orden_asignatura_en_ciclo as position from asignaturas where carrera_id = ${careerId}::uuid and ciclo_asignatura = ${cycle}
          order by orden_asignatura_en_ciclo asc, nombre_asignatura asc for update`,
      )
      return rows.map((row) => ({ id: row.id, position: Number(row.position) }))
    },
    async setPosition(subjectId, position) {
      await executor.execute(sql`update asignaturas set orden_asignatura_en_ciclo = ${position} where asignatura_id = ${subjectId}::uuid`)
    },
    async sync(confirmed, careerId) {
      await progress.sync(confirmed, careerId)
    },
    guard: (confirmed, careerId, change) => notice.guard(confirmed, careerId, change),
  }
}

function sharedDeps(executor: Executor) {
  return {
    careerActive: (careerId: string) => exists(executor, sql`select 1 from carreras where carrera_id = ${careerId}::uuid and carrera_activa = true`),
  }
}

export function careerWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<CareerWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    ...sharedDeps(executor),
    subjectInCareer: (subjectId, careerId) => exists(executor, sql`select * from asignaturas where asignatura_id = ${subjectId}::uuid and carrera_id = ${careerId}::uuid`),
    activeSubjectInCareer: (subjectId, careerId) =>
      exists(executor, sql`select * from asignaturas where asignatura_id = ${subjectId}::uuid and asignatura_activa = true and carrera_id = ${careerId}::uuid`),
    subjectCodeTaken: (careerId, code, except) =>
      exists(
        executor,
        sql`select * from asignaturas where codigo_asignatura = ${code} and carrera_id = ${careerId}::uuid ${except === null ? sql`` : sql`and asignatura_id <> ${except}::uuid`}`,
      ),
    eligibleUserExists: (userId) =>
      exists(executor, sql`select * from usuarios where usuario_id = ${userId}::uuid and usuario_activo = true and correo_verificado_en is not null`),
    parallelInCareer: (parallelId, careerId) =>
      exists(
        executor,
        sql`select * from paralelos where paralelo_id = ${parallelId}::uuid
          and asignatura_id in (select asignatura_id from asignaturas where asignatura_activa = true and carrera_id = ${careerId}::uuid)`,
      ),
    transaction: (run) => withAfterCommit((afterCommit) => transaction((inner) => run(careerWriteTx(inner, afterCommit, now(), options)))),
  }
}

export function curriculumDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<CurriculumDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    ...sharedDeps(executor),
    transaction: (run) => withAfterCommit((afterCommit) => transaction((inner) => run(curriculumTx(inner, afterCommit, now(), options)))),
  }
}

export function createCareerWriteDeps(): Omit<CareerWriteDeps, "bridge"> {
  return careerWriteDepsOn(db as unknown as Executor, dbTransaction)
}

export function createCurriculumDeps(): Omit<CurriculumDeps, "bridge"> {
  return curriculumDepsOn(db as unknown as Executor, dbTransaction)
}
