import { and, eq, exists, sql } from "drizzle-orm"
import { db } from "@/db"
import { epochText, hasRows } from "@/db/expressions"
import { carreras, convocatoriasCarreras, convocatoriasUniversidad } from "@/db/schema"
import { careerLabelSql } from "../academic/careerLabel"
import { createTemplateStore } from "../configuration/templateStore"
import { createDashboardRepository } from "../dashboard/dashboardQueries"
import { coordinatorReadiness, type CoordinatorReadiness } from "../dashboard/setupChecklist"
import { setupRepositoryOn } from "../dashboard/setupQueries"
import { uuid7 } from "../http/uuid7"
import { notificationScope, recipientsOn, systemNow, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { convocationRepositoryOn } from "./convocationQueries"
import type { ConvocationWriteDeps, ConvocationWriteTx } from "./convocationWrites"
import { InProgressWork } from "./inProgressWork"
import { templateProblem } from "./processes"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { failModelNotFound } from "../http/failures"
import { MODELS } from "../http/models"
import type { Executor } from "./teacherSyllabusQueries"

export function institutionDay(seconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(seconds * 1000),
  )
}

export function convocationBlockers(readiness: CoordinatorReadiness): string[] {
  const blockers: string[] = []
  if (readiness.process !== null && !readiness.deadlineOpen) blockers.push("El plazo de entrega de la convocatoria institucional ya venció. Administración debe prorrogarlo.")
  if (!readiness.facultyLogoReady) blockers.push("Administración debe cargar el logo de la facultad antes de que Coordinación abra la convocatoria.")
  if (!readiness.curriculumReady) blockers.push("Falta registrar la malla de la carrera con sus materias.")
  if (readiness.scheduledTotal === 0) blockers.push("Falta registrar paralelos de las materias de la carrera.")
  const withoutParallel = readiness.scheduledTotal - readiness.scheduledWithParallels
  if (withoutParallel > 0) blockers.push(withoutParallel === 1 ? "Falta 1 materia sin paralelo." : `Faltan ${withoutParallel} materias sin paralelo.`)
  const withoutTeacher = readiness.parallelTotal - readiness.parallelsWithTeacher
  if (withoutTeacher > 0) blockers.push(withoutTeacher === 1 ? "Falta 1 paralelo sin docente." : `Faltan ${withoutTeacher} paralelos sin docente.`)
  const withoutProfile = readiness.subjectsWithoutProfile
  if (withoutProfile > 0) {
    blockers.push(withoutProfile === 1 ? "Falta completar el proyecto de carrera de 1 materia." : `Falta completar el proyecto de carrera de ${withoutProfile} materias.`)
  }
  return blockers
}

export async function institutionalTemplateProblem(executor: Executor, errorKey: string): Promise<string | null> {
  const template = await createTemplateStore(executor).template()
  if (template === null) failModelNotFound(MODELS.template)
  return templateProblem(template, template.definition, errorKey)
}

export function convocationWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, mail?: Mail): ConvocationWriteTx {
  const work = new InProgressWork(executor, afterCommit)
  const recipients = recipientsOn(executor)
  return {
    notifications: notificationScope(executor, afterCommit, now, mail),
    generateConvocation: (id, options) => work.generateConvocation(id, options),
    teacherSyllabusCounts: (ids) => recipients.teacherSyllabusCounts(ids),
    async lockProcess(id) {
      const [row] = await executor
        .select({
          id: convocatoriasUniversidad.convocatoriaUniversidadId,
          state: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
          periodId: convocatoriasUniversidad.periodoAcademicoId,
        })
        .from(convocatoriasUniversidad)
        .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, id))
        .limit(1)
        .for("update")
      return row ?? null
    },
    async careerHasConvocation(careerId, processId) {
      return hasRows(
        executor
          .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
          .from(convocatoriasCarreras)
          .where(
            and(
              eq(convocatoriasCarreras.carreraId, careerId),
              eq(convocatoriasCarreras.convocatoriaUniversidadId, processId),
              exists(
                executor
                  .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
                  .from(convocatoriasUniversidad)
                  .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId)),
              ),
            ),
          )
          .limit(1),
      )
    },
    async createConvocation(careerId, processId) {
      const id = uuid7()
      await executor
        .insert(convocatoriasCarreras)
        .values({ convocatoriaCarreraId: id, carreraId: careerId, convocatoriaUniversidadId: processId, estadoConvocatoriaCarrera: "preparacion" })
      return id
    },
    async lockConvocation(id) {
      const [row] = await executor
        .select({
          id: convocatoriasCarreras.convocatoriaCarreraId,
          careerId: convocatoriasCarreras.carreraId,
          careerLabel: sql<string>`${careerLabelSql("carreras")}`,
          state: convocatoriasCarreras.estadoConvocatoriaCarrera,
          processState: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
          dueAt: epochText(convocatoriasUniversidad.fechaEntrega),
        })
        .from(convocatoriasCarreras)
        .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
        .innerJoin(carreras, eq(carreras.carreraId, convocatoriasCarreras.carreraId))
        .where(eq(convocatoriasCarreras.convocatoriaCarreraId, id))
        .limit(1)
        .for("update", { of: convocatoriasCarreras })
      return row ? { ...row, dueAt: Number(row.dueAt) } : null
    },
    async readinessBlockers(careerId) {
      const dashboard = createDashboardRepository(executor)
      const readiness = await coordinatorReadiness(
        careerId,
        await dashboard.inProgressProcess(),
        (career, processId) => dashboard.convocation(career, processId),
        setupRepositoryOn(executor),
        work.templates,
        institutionDay(now),
      )
      return convocationBlockers(readiness)
    },
    templateProblem: (errorKey) => institutionalTemplateProblem(executor, errorKey),
    async updateState(id, state) {
      await executor.update(convocatoriasCarreras).set({ estadoConvocatoriaCarrera: state }).where(eq(convocatoriasCarreras.convocatoriaCarreraId, id))
    },
  }
}

export function convocationWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ConvocationWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  const repository = convocationRepositoryOn(executor, () => Promise.reject(new Error("read only")))
  return {
    convocation: (id) => repository.convocation(id),
    openProcessExists: (id) =>
      hasRows(
        executor
          .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
          .from(convocatoriasUniversidad)
          .where(and(eq(convocatoriasUniversidad.convocatoriaUniversidadId, id), eq(convocatoriasUniversidad.estadoConvocatoriaUniversidad, "abierto")))
          .limit(1),
      ),
    nowMs: options.now === undefined ? () => Date.now() : () => now() * 1000,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(convocationWriteTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createConvocationWriteDeps(): Omit<ConvocationWriteDeps, "bridge"> {
  return convocationWriteDepsOn(db, dbTransaction)
}
