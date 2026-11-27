import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { epochText, hasRows } from "../../prisma/sql"
import { createTemplateStore } from "../shared/templateStore"
import { createDashboardRepository } from "../dashboard/dashboardQueries"
import { coordinatorReadiness, type CoordinatorReadiness } from "../dashboard/setupChecklist"
import { setupRepositoryOn } from "../dashboard/setupQueries"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { notificationScope, recipientsOn, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { convocationRepositoryOn } from "./convocationQueries"
import type { ConvocationWriteDeps, ConvocationWriteTx } from "./convocationWrites"
import { InProgressWork } from "./inProgressWork"
import { templateProblem } from "./processes"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { failModelNotFound } from "../http/failures"
import { MODELS } from "../http/models"
import { careerLabelSql } from "./syllabusSql"
import { rowsOf } from "./teacherSyllabusQueries"

export function institutionDay(seconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(seconds * 1000),
  )
}

export function convocationBlockers(readiness: CoordinatorReadiness): string[] {
  const blockers: string[] = []
  if (readiness.process !== null && !readiness.deadlineOpen) blockers.push("El plazo de entrega del proceso de sílabos ya venció. Administración debe prorrogarlo.")
  if (!readiness.facultyLogoReady) blockers.push("Administración debe cargar el logo de la facultad antes de que Coordinación abra el proceso de sílabos.")
  if (!readiness.curriculumReady) blockers.push("La carrera no tiene materias en la malla vigente. Registre la malla con sus materias.")
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

export async function institutionalTemplateProblem(executor: Db, errorKey: string): Promise<string | null> {
  const template = await createTemplateStore(executor).template()
  if (template === null) failModelNotFound(MODELS.template)
  return templateProblem(template, template.definition, errorKey)
}

export function convocationWriteTx(executor: Db, afterCommit: AfterCommit, now: number, mail?: Mail): ConvocationWriteTx {
  const work = new InProgressWork(executor, afterCommit)
  const recipients = recipientsOn(executor)
  return {
    notifications: notificationScope(executor, afterCommit, now, mail),
    generateConvocation: (id, options) => work.generateConvocation(id, options),
    teacherSyllabusCounts: (ids) => recipients.teacherSyllabusCounts(ids),
    async lockProcess(id) {
      const [row] = await rowsOf<{ id: string; state: string; periodId: string }>(
        executor,
        Prisma.sql`select convocatorias_universidad.convocatoria_universidad_id::text as id, convocatorias_universidad.estado_convocatoria_universidad as state,
            convocatorias_universidad.periodo_academico_id::text as "periodId"
          from convocatorias_universidad where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid limit 1 for update`,
      )
      return row ?? null
    },
    async careerHasConvocation(careerId, processId) {
      return hasRows(
        rowsOf(
          executor,
          Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id from convocatorias_carreras
            where (convocatorias_carreras.carrera_id = ${careerId}::uuid and convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid
              and exists (select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad
                where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id))
            limit 1`,
        ),
      )
    },
    async createConvocation(careerId, processId) {
      const id = uuid7()
      await executor.$executeRaw`insert into convocatorias_carreras (convocatoria_carrera_id, carrera_id, estado_convocatoria_carrera, convocatoria_universidad_id)
        values (${id}::uuid, ${careerId}::uuid, ${"preparacion"}, ${processId}::uuid)`
      return id
    },
    async lockConvocation(id) {
      const [row] = await rowsOf<{ id: string; careerId: string; careerLabel: string; state: string; processState: string; dueAt: string }>(
        executor,
        Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id, convocatorias_carreras.carrera_id::text as "careerId",
            ${careerLabelSql("carreras")} as "careerLabel", convocatorias_carreras.estado_convocatoria_carrera as state,
            convocatorias_universidad.estado_convocatoria_universidad as "processState", ${epochText(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueAt"
          from convocatorias_carreras
          inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
          inner join carreras on carreras.carrera_id = convocatorias_carreras.carrera_id
          where convocatorias_carreras.convocatoria_carrera_id = ${id}::uuid limit 1 for update of convocatorias_carreras`,
      )
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
      await executor.$executeRaw`update convocatorias_carreras set estado_convocatoria_carrera = ${state} where convocatorias_carreras.convocatoria_carrera_id = ${id}::uuid`
    },
  }
}

export function convocationWriteDepsOn(executor: Db, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ConvocationWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  const repository = convocationRepositoryOn(executor, () => Promise.reject(new Error("read only")))
  return {
    convocation: (id) => repository.convocation(id),
    openProcessExists: (id) =>
      hasRows(
        rowsOf(
          executor,
          Prisma.sql`select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad
            where (convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid and convocatorias_universidad.estado_convocatoria_universidad = ${"abierto"}) limit 1`,
        ),
      ),
    nowMs: options.now === undefined ? () => Date.now() : () => now() * 1000,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(convocationWriteTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createConvocationWriteDeps(prisma: PrismaService): Omit<ConvocationWriteDeps, "bridge"> {
  return convocationWriteDepsOn(prisma, dbTransaction(prisma))
}
