import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { createTemplateStore } from "../configuration/templateStore"
import { createDashboardRepository } from "../dashboard/dashboardQueries"
import { coordinatorReadiness, SetupNeedsLaravel, type CoordinatorReadiness } from "../dashboard/setupChecklist"
import { setupRepositoryOn } from "../dashboard/setupQueries"
import { uuid7 } from "../laravel/uuid7"
import { notificationScope, recipientsOn, systemNow, type Mail, type WriteOptions } from "../notifications/queries"
import { insertAuditEvent } from "../operations/recordAuditEvent"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { convocationRepositoryOn } from "./convocationQueries"
import type { ConvocationWriteDeps, ConvocationWriteTx } from "./convocationWrites"
import { InProgressWork } from "./inProgressWork"
import { templateProblem } from "./processes"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { Missing } from "./reviewDecisions"
import { NeedsLaravel } from "./snapshotDocuments"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

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
  if (template === null) throw new Missing()
  if (template.definition === null) throw new NeedsLaravel()
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
      const [row] = await rowsOf<{ id: string; state: string; period_id: string }>(
        executor,
        sql`select convocatoria_universidad_id::text as id, estado_convocatoria_universidad as state, periodo_academico_id::text as period_id
          from convocatorias_universidad where convocatoria_universidad_id = ${id}::uuid limit 1 for update`,
      )
      return row ? { id: row.id, state: row.state, periodId: row.period_id } : null
    },
    async careerHasConvocation(careerId, processId) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from convocatorias_carreras convocatoria where convocatoria.carrera_id = ${careerId}::uuid
          and convocatoria.convocatoria_universidad_id = ${processId}::uuid
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)) as found`,
      )
      return row.found
    },
    async createConvocation(careerId, processId) {
      const id = uuid7()
      await executor.execute(sql`insert into convocatorias_carreras (convocatoria_carrera_id, carrera_id, convocatoria_universidad_id, estado_convocatoria_carrera)
        values (${id}::uuid, ${careerId}::uuid, ${processId}::uuid, 'preparacion')`)
      return id
    },
    async lockConvocation(id) {
      const [row] = await rowsOf<{ id: string; career_id: string; career_label: string; state: string; process_state: string; due_at: number }>(
        executor,
        sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.carrera_id::text as career_id, ${careerLabelSql("carrera")} as career_label,
            convocatoria.estado_convocatoria_carrera as state, proceso.estado_convocatoria_universidad as process_state,
            extract(epoch from proceso.fecha_entrega)::bigint as due_at
          from convocatorias_carreras convocatoria
            inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            inner join carreras carrera on carrera.carrera_id = convocatoria.carrera_id
          where convocatoria.convocatoria_carrera_id = ${id}::uuid limit 1 for update of convocatoria`,
      )
      return row
        ? { id: row.id, careerId: row.career_id, careerLabel: row.career_label, state: row.state, processState: row.process_state, dueAt: Number(row.due_at) }
        : null
    },
    async readinessBlockers(careerId) {
      const dashboard = createDashboardRepository(executor)
      try {
        const readiness = await coordinatorReadiness(
          careerId,
          await dashboard.inProgressProcess(),
          (career, processId) => dashboard.convocation(career, processId),
          setupRepositoryOn(executor),
          work.templates,
          institutionDay(now),
        )
        return convocationBlockers(readiness)
      } catch (error) {
        if (error instanceof SetupNeedsLaravel) throw new NeedsLaravel()
        throw error
      }
    },
    templateProblem: (errorKey) => institutionalTemplateProblem(executor, errorKey),
    async updateState(id, state) {
      await executor.execute(sql`update convocatorias_carreras set estado_convocatoria_carrera = ${state} where convocatoria_carrera_id = ${id}::uuid`)
    },
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
  }
}

export function convocationWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ConvocationWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  const repository = convocationRepositoryOn(executor, () => Promise.reject(new Error("read only")))
  return {
    convocation: (id) => repository.convocation(id),
    async openProcessExists(id) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from convocatorias_universidad where convocatoria_universidad_id = ${id}::uuid and estado_convocatoria_universidad = 'abierto') as found`,
      )
      return row.found
    },
    now,
    nowMs: options.now === undefined ? () => Date.now() : () => now() * 1000,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(convocationWriteTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createConvocationWriteDeps(): Omit<ConvocationWriteDeps, "bridge"> {
  return convocationWriteDepsOn(db as unknown as Executor, dbTransaction)
}
