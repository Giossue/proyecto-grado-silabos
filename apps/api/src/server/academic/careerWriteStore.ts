import { and, asc, desc, eq, exists, getTableColumns, inArray, isNotNull, max, ne, or, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { byColumnName, fromEpoch, hasRows } from "@/db/expressions"
import { asignacionesParalelo, asignacionesRol, asignaturas, carreras, convocatoriasCarreras, convocatoriasUniversidad, paralelos, requisitosAsignatura, silabos, usuarios } from "@/db/schema"
import { careerDataLocked } from "../configuration/subjectProfileWriteStore"
import { uuid7 } from "../http/uuid7"
import { notificationScope, systemNow, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { FinalizedChangeNotice, keepContent } from "../syllabus/finalizedChangeNotice"
import { InProgressWork, SYLLABUS_ALIVE } from "../syllabus/inProgressWork"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import { SUBJECT_COLUMNS, type CareerWriteDeps, type CareerWriteTx, type SubjectColumn, type SubjectValue } from "./careerWrites"
import type { CurriculumDeps, CurriculumTx } from "./curriculumWrites"
import { deletionTx } from "./deletions"

const IN_CAREER = (careerId: string) => sql`exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id and asignaturas.carrera_id = ${careerId}::uuid)`
const ACTIVE_ROLE = eq(asignacionesRol.asignacionRolActiva, true)
const ELIGIBLE_USER = and(eq(usuarios.usuarioActivo, true), isNotNull(usuarios.correoVerificadoEn))
const ACTIVE_ASSIGNMENT = (parallelId: string) => and(eq(asignacionesParalelo.paraleloId, parallelId), eq(asignacionesParalelo.asignacionParaleloActiva, true))
const REQUIREMENT = { id: requisitosAsignatura.requisitoAsignaturaId, type: requisitosAsignatura.tipoRequisitoAsignatura }
function subjectFields(): Record<SubjectColumn, AnyPgColumn> {
  const columns = Object.values(getTableColumns(asignaturas))
  return Object.fromEntries(SUBJECT_COLUMNS.map((name) => [name, columns.find((column) => column.name === name) as AnyPgColumn])) as Record<SubjectColumn, AnyPgColumn>
}

function subjectInCareer(executor: Executor, subject: AnyPgColumn, careerId: string): SQL {
  return exists(executor.select({ id: asignaturas.asignaturaId }).from(asignaturas).where(and(eq(asignaturas.asignaturaId, subject), eq(asignaturas.carreraId, careerId))))
}

function subjectExists(executor: Executor, ...conditions: (SQL | undefined)[]): Promise<boolean> {
  return hasRows(executor.select({ id: asignaturas.asignaturaId }).from(asignaturas).where(and(...conditions)).limit(1))
}

function work(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions): { work: InProgressWork; notice: FinalizedChangeNotice } {
  const progress = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now, options.mail))
  return { work: progress, notice: new FinalizedChangeNotice(progress, now) }
}

async function lockCareer(executor: Executor, careerId: string, curriculumId: string = careerId): Promise<{ id: string; cycleCount: number } | null> {
  const [row] = await executor
    .select({ id: carreras.carreraId, cycleCount: carreras.numeroCiclos })
    .from(carreras)
    .where(and(eq(carreras.carreraId, careerId), eq(carreras.carreraId, curriculumId)))
    .limit(1)
    .for("update")
  return row ? { id: row.id, cycleCount: Number(row.cycleCount) } : null
}

export function careerWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): CareerWriteTx {
  const { work: progress, notice } = work(executor, afterCommit, now, options)
  const deletions = deletionTx(executor)
  return {
    careerLocked: (careerId) => careerDataLocked(executor, careerId),
    lockCareer: (careerId) => lockCareer(executor, careerId),
    async lastPosition(careerId, cycle) {
      const [row] = await executor
        .select({ position: max(asignaturas.ordenAsignaturaEnCiclo) })
        .from(asignaturas)
        .where(and(eq(asignaturas.carreraId, careerId), sql`${asignaturas.cicloAsignatura} = ${cycle}`))
      return row?.position === null || row?.position === undefined ? null : Number(row.position)
    },
    async insertSubject(careerId, columns) {
      const id = uuid7()
      await executor.insert(asignaturas).values({ ...byColumnName(asignaturas, columns), asignaturaId: id, carreraId: careerId, asignaturaActiva: true } as typeof asignaturas.$inferInsert)
      return id
    },
    async subjectGeneratesSyllabus(subjectId) {
      const [row] = await executor.select({ value: asignaturas.generaSilaboAsignatura }).from(asignaturas).where(eq(asignaturas.asignaturaId, subjectId)).limit(1)
      return row ? row.value : null
    },
    async lockSubject(subjectId, careerId) {
      const [row] = await executor
        .select({ id: asignaturas.asignaturaId, careerId: asignaturas.carreraId, totalHours: asignaturas.totalHorasAsignatura, columns: subjectFields() })
        .from(asignaturas)
        .where(and(eq(asignaturas.asignaturaId, subjectId), eq(asignaturas.carreraId, careerId)))
        .limit(1)
        .for("update")
      if (!row) return null
      return { id: row.id, careerId: row.careerId, totalHours: row.totalHours === null ? null : Number(row.totalHours), columns: row.columns as Record<SubjectColumn, SubjectValue> }
    },
    async updateSubject(subjectId, columns) {
      await executor.update(asignaturas).set(byColumnName(asignaturas, columns)).where(eq(asignaturas.asignaturaId, subjectId))
    },
    async subjectsOfParallel(parallelId) {
      const rows = await executor.select({ id: paralelos.asignaturaId }).from(paralelos).where(eq(paralelos.paraleloId, parallelId))
      return rows.map((row) => row.id)
    },
    parallelsWithStartedSyllabus: (parallelIds) => progress.parallelsWithStartedSyllabus(parallelIds),
    async lockParallel(parallelId, careerId) {
      const [row] = await executor
        .select({ id: paralelos.paraleloId, subjectId: paralelos.asignaturaId, code: paralelos.codigoParalelo, shift: paralelos.jornadaParalelo })
        .from(paralelos)
        .where(and(eq(paralelos.paraleloId, parallelId), IN_CAREER(careerId)))
        .limit(1)
        .for("update")
      return row ?? null
    },
    hasCoordinatorRole: (userId, careerId) =>
      hasRows(
        executor
          .select({ id: asignacionesRol.asignacionRolId })
          .from(asignacionesRol)
          .where(and(ACTIVE_ROLE, eq(asignacionesRol.usuarioId, userId), eq(asignacionesRol.carreraId, careerId), eq(asignacionesRol.rol, "coordinador")))
          .limit(1),
      ),
    async effectiveRoles(userId) {
      const rows = await executor.select({ role: asignacionesRol.rol }).from(asignacionesRol).where(and(ACTIVE_ROLE, eq(asignacionesRol.usuarioId, userId)))
      return rows.map((row) => row.role)
    },
    async teacherGrant(userId, careerId) {
      const [row] = await executor
        .select({ id: asignacionesRol.asignacionRolId, active: asignacionesRol.asignacionRolActiva })
        .from(asignacionesRol)
        .where(and(eq(asignacionesRol.usuarioId, userId), eq(asignacionesRol.carreraId, careerId), eq(asignacionesRol.rol, "docente")))
        .orderBy(desc(asignacionesRol.asignacionRolActiva))
        .limit(1)
      return row ?? null
    },
    async insertTeacherGrant(userId, careerId) {
      await executor
        .insert(asignacionesRol)
        .values({ asignacionRolId: uuid7(), usuarioId: userId, carreraId: careerId, rol: "docente", asignacionRolActiva: true, asignadoEn: fromEpoch(now) })
    },
    async activateGrant(grantId) {
      await executor.update(asignacionesRol).set({ asignacionRolActiva: true }).where(eq(asignacionesRol.asignacionRolId, grantId))
    },
    async eligibleTeacherRole(userId, careerId) {
      const [row] = await executor
        .select({ id: asignacionesRol.asignacionRolId })
        .from(asignacionesRol)
        .where(
          and(
            ACTIVE_ROLE,
            eq(asignacionesRol.usuarioId, userId),
            eq(asignacionesRol.carreraId, careerId),
            eq(asignacionesRol.rol, "docente"),
            exists(executor.select({ id: usuarios.usuarioId }).from(usuarios).where(and(eq(usuarios.usuarioId, asignacionesRol.usuarioId), ELIGIBLE_USER))),
          ),
        )
        .limit(1)
      return row?.id ?? null
    },
    parallelHasActiveTeacher: (parallelId) =>
      hasRows(executor.select({ id: asignacionesParalelo.asignacionParaleloId }).from(asignacionesParalelo).where(ACTIVE_ASSIGNMENT(parallelId)).limit(1)),
    async insertTeacherAssignment(roleId, parallelId) {
      const id = uuid7()
      await executor
        .insert(asignacionesParalelo)
        .values({ asignacionParaleloId: id, asignacionRolId: roleId, paraleloId: parallelId, asignacionParaleloActiva: true, asignadoEn: fromEpoch(now) })
      return id
    },
    async restartForParallel(parallelId) {
      await progress.restartForParallel(parallelId)
    },
    async lockCurrentConvocation(careerId) {
      const [row] = await executor
        .select({ id: convocatoriasCarreras.convocatoriaCarreraId, state: convocatoriasCarreras.estadoConvocatoriaCarrera, processState: convocatoriasUniversidad.estadoConvocatoriaUniversidad })
        .from(convocatoriasCarreras)
        .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
        .where(and(eq(convocatoriasCarreras.carreraId, careerId), inArray(convocatoriasUniversidad.estadoConvocatoriaUniversidad, ["abierto", "pausado"])))
        .orderBy(asc(convocatoriasCarreras.convocatoriaCarreraId))
        .limit(1)
        .for("share", { of: convocatoriasCarreras })
      return row ?? null
    },
    async generateParallelSyllabus(convocationId, parallelId) {
      await progress.generateConvocation(convocationId, { parallelId, allowEmpty: true, skipIncomplete: true, notifyTeacher: true })
    },
    async activeTeacherAssignment(parallelId) {
      const [row] = await executor.select({ id: asignacionesParalelo.asignacionParaleloId }).from(asignacionesParalelo).where(ACTIVE_ASSIGNMENT(parallelId)).limit(1)
      return row?.id ?? null
    },
    async lockTeacherAssignment(assignmentId, careerId) {
      return (await deletions.lockTeacherAssignment(assignmentId, careerId))?.id ?? null
    },
    deleteTeacherAssignment: (assignmentId) => deletions.deleteTeacherAssignment(assignmentId),
    async lockActiveSubject(subjectId, careerId) {
      const [row] = await executor
        .select({ id: asignaturas.asignaturaId })
        .from(asignaturas)
        .where(and(eq(asignaturas.asignaturaId, subjectId), eq(asignaturas.asignaturaActiva, true), eq(asignaturas.carreraId, careerId)))
        .limit(1)
        .for("update")
      return row?.id ?? null
    },
    async existingParallelCodes(subjectId, upperCodes) {
      const rows = await executor
        .select({ code: paralelos.codigoParalelo })
        .from(paralelos)
        .where(and(eq(paralelos.asignaturaId, subjectId), inArray(sql`upper(${paralelos.codigoParalelo})`, upperCodes)))
      return rows.map((row) => row.code)
    },
    async insertParallel(subjectId, code, shift) {
      const id = uuid7()
      await executor.insert(paralelos).values({ paraleloId: id, asignaturaId: subjectId, codigoParalelo: code, jornadaParalelo: shift as string })
      return id
    },
    parallelCodeTaken: (subjectId, exceptId, upperCode) =>
      hasRows(
        executor
          .select({ id: paralelos.paraleloId })
          .from(paralelos)
          .where(and(eq(paralelos.asignaturaId, subjectId), ne(paralelos.paraleloId, exceptId), sql`upper(${paralelos.codigoParalelo}) = ${upperCode}`))
          .limit(1),
      ),
    async updateParallel(parallelId, code, shift) {
      await executor.update(paralelos).set({ codigoParalelo: code, jornadaParalelo: shift as string }).where(eq(paralelos.paraleloId, parallelId))
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
      const [row] = await executor.select({ cycle: max(asignaturas.cicloAsignatura) }).from(asignaturas).where(eq(asignaturas.carreraId, careerId))
      return row?.cycle === null || row?.cycle === undefined ? null : Number(row.cycle)
    },
    async updateCycleCount(careerId, cycleCount) {
      await executor.update(carreras).set({ numeroCiclos: cycleCount }).where(eq(carreras.carreraId, careerId))
    },
    async lockSubjects(careerId, subjectIds) {
      const rows = await executor
        .select({ id: asignaturas.asignaturaId, cycle: asignaturas.cicloAsignatura })
        .from(asignaturas)
        .where(and(eq(asignaturas.carreraId, careerId), inArray(asignaturas.asignaturaId, subjectIds)))
        .for("update")
      return rows.map((row) => ({ id: row.id, cycle: row.cycle === null ? null : Number(row.cycle) }))
    },
    async prerequisites(careerId) {
      return executor
        .select({ subjectId: requisitosAsignatura.asignaturaId, requirementId: requisitosAsignatura.requisitoId })
        .from(requisitosAsignatura)
        .where(and(eq(requisitosAsignatura.tipoRequisitoAsignatura, "prerrequisito"), subjectInCareer(executor, requisitosAsignatura.asignaturaId, careerId)))
    },
    async findRequirement(subjectId, requirementId) {
      const [row] = await executor
        .select(REQUIREMENT)
        .from(requisitosAsignatura)
        .where(and(eq(requisitosAsignatura.asignaturaId, subjectId), eq(requisitosAsignatura.requisitoId, requirementId)))
        .limit(1)
      return row ?? null
    },
    async insertRequirement(subjectId, requirementId, type) {
      const id = uuid7()
      await executor.insert(requisitosAsignatura).values({ requisitoAsignaturaId: id, asignaturaId: subjectId, requisitoId: requirementId, tipoRequisitoAsignatura: type })
      return id
    },
    async lockRequirement(requirementId, careerId) {
      const [row] = await executor
        .select(REQUIREMENT)
        .from(requisitosAsignatura)
        .where(
          and(
            subjectInCareer(executor, requisitosAsignatura.asignaturaId, careerId),
            subjectInCareer(executor, requisitosAsignatura.requisitoId, careerId),
            eq(requisitosAsignatura.requisitoAsignaturaId, requirementId),
          ),
        )
        .limit(1)
        .for("update")
      return row ?? null
    },
    async deleteRequirement(requirementId) {
      await executor.delete(requisitosAsignatura).where(eq(requisitosAsignatura.requisitoAsignaturaId, requirementId))
    },
    async lockSubject(subjectId, careerId) {
      const [row] = await executor
        .select({
          id: asignaturas.asignaturaId,
          code: asignaturas.codigoAsignatura,
          name: asignaturas.nombreAsignatura,
          cycle: asignaturas.cicloAsignatura,
          position: asignaturas.ordenAsignaturaEnCiclo,
        })
        .from(asignaturas)
        .where(and(eq(asignaturas.carreraId, careerId), eq(asignaturas.asignaturaId, subjectId)))
        .limit(1)
        .for("update")
      return row ? { ...row, cycle: row.cycle === null ? null : Number(row.cycle), position: Number(row.position) } : null
    },
    async subjectUsage(subjectId) {
      const parallels = await executor.$count(paralelos, eq(paralelos.asignaturaId, subjectId))
      const syllabi = await executor.$count(
        silabos,
        and(
          exists(executor.select({ id: paralelos.paraleloId }).from(paralelos).where(and(eq(paralelos.paraleloId, silabos.paraleloId), eq(paralelos.asignaturaId, subjectId)))),
          SYLLABUS_ALIVE,
        ),
      )
      return { parallels, syllabi }
    },
    async deleteSubject(subjectId) {
      await executor.delete(requisitosAsignatura).where(or(eq(requisitosAsignatura.asignaturaId, subjectId), eq(requisitosAsignatura.requisitoId, subjectId)))
      await executor.delete(asignaturas).where(eq(asignaturas.asignaturaId, subjectId))
    },
    async lockCycleSubjects(careerId, cycle) {
      const rows = await executor
        .select({ id: asignaturas.asignaturaId, position: asignaturas.ordenAsignaturaEnCiclo })
        .from(asignaturas)
        .where(and(eq(asignaturas.carreraId, careerId), sql`${asignaturas.cicloAsignatura} = ${cycle}`))
        .orderBy(asc(asignaturas.ordenAsignaturaEnCiclo), asc(asignaturas.nombreAsignatura))
        .for("update")
      return rows.map((row) => ({ id: row.id, position: Number(row.position) }))
    },
    async setPosition(subjectId, position) {
      await executor.update(asignaturas).set({ ordenAsignaturaEnCiclo: position }).where(eq(asignaturas.asignaturaId, subjectId))
    },
    async sync(confirmed, careerId) {
      await progress.sync(confirmed, careerId)
    },
    guard: (confirmed, careerId, change) => notice.guard(confirmed, careerId, change),
  }
}

function sharedDeps(executor: Executor) {
  return {
    careerActive: (careerId: string) =>
      hasRows(executor.select({ id: carreras.carreraId }).from(carreras).where(and(eq(carreras.carreraId, careerId), eq(carreras.carreraActiva, true))).limit(1)),
  }
}

export function careerWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<CareerWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    ...sharedDeps(executor),
    subjectInCareer: (subjectId, careerId) => subjectExists(executor, eq(asignaturas.asignaturaId, subjectId), eq(asignaturas.carreraId, careerId)),
    activeSubjectInCareer: (subjectId, careerId) =>
      subjectExists(executor, eq(asignaturas.asignaturaId, subjectId), eq(asignaturas.asignaturaActiva, true), eq(asignaturas.carreraId, careerId)),
    subjectCodeTaken: (careerId, code, except) =>
      subjectExists(
        executor,
        eq(asignaturas.codigoAsignatura, code),
        eq(asignaturas.carreraId, careerId),
        except === null ? undefined : ne(asignaturas.asignaturaId, except),
      ),
    eligibleUserExists: (userId) =>
      hasRows(executor.select({ id: usuarios.usuarioId }).from(usuarios).where(and(eq(usuarios.usuarioId, userId), ELIGIBLE_USER)).limit(1)),
    parallelInCareer: (parallelId, careerId) =>
      hasRows(
        executor
          .select({ id: paralelos.paraleloId })
          .from(paralelos)
          .where(
            and(
              eq(paralelos.paraleloId, parallelId),
              inArray(
                paralelos.asignaturaId,
                executor
                  .select({ id: asignaturas.asignaturaId })
                  .from(asignaturas)
                  .where(and(eq(asignaturas.asignaturaActiva, true), eq(asignaturas.carreraId, careerId))),
              ),
            ),
          )
          .limit(1),
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
