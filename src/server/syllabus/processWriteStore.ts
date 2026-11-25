import "server-only"
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { epochText } from "@/db/expressions"
import { carreras, convocatoriasCarreras, convocatoriasUniversidad, periodosAcademicos, silabos } from "@/db/schema"
import { careerLabelSql } from "../academic/careerLabel"
import { notificationScope, recipientsOn, systemNow, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { institutionalTemplateProblem } from "./convocationWriteStore"
import { anotherProcessInProgress } from "./finalizedChangeNotice"
import { InProgressWork, SYLLABUS_ALIVE } from "./inProgressWork"
import { adaptProcessToTemplate, convocationsToReopen, processSyllabusCounts, ReopenCatchUp, reopenProcess, templateChangedSince } from "./reopenCatchUp"
import { processRepositoryOn } from "./processQueries"
import type { ProcessWriteDeps, ProcessWriteTx } from "./processWrites"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import type { Executor } from "./teacherSyllabusQueries"

const PROCESS_ALIVE = sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

export function processWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, mail?: Mail): ProcessWriteTx {
  const notifications = notificationScope(executor, afterCommit, now, mail)
  const work = new InProgressWork(executor, afterCommit, notifications)
  const catchUp = new ReopenCatchUp(work, afterCommit)
  const recipients = recipientsOn(executor)
  return {
    notifications,
    async lockProcess(id) {
      const [row] = await executor
        .select({
          id: convocatoriasUniversidad.convocatoriaUniversidadId,
          state: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
          periodId: convocatoriasUniversidad.periodoAcademicoId,
          period: periodosAcademicos.codigoPeriodoAcademico,
          dueAt: epochText(convocatoriasUniversidad.fechaEntrega),
          extensions: convocatoriasUniversidad.cantidadProrrogas,
          periodEndsOn: periodosAcademicos.fechaFinPeriodo,
          finalized: isNotNull(convocatoriasUniversidad.finalizadaEn).mapWith(Boolean),
        })
        .from(convocatoriasUniversidad)
        .leftJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
        .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, id))
        .limit(1)
        .for("update", { of: convocatoriasUniversidad })
      return row
        ? {
            ...row,
            period: row.period ?? "Período",
            dueAt: Number(row.dueAt),
            extensions: Number(row.extensions),
            periodEndsOn: row.periodEndsOn as string,
          }
        : null
    },
    async lockConvocations(processId) {
      const rows = await executor
        .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
        .from(convocatoriasCarreras)
        .where(and(eq(convocatoriasCarreras.convocatoriaUniversidadId, processId), PROCESS_ALIVE))
        .for("update")
      return rows.map((row) => row.id)
    },
    async lockSyllabi(convocationIds) {
      if (convocationIds.length === 0) return []
      const rows = await executor
        .select({ id: silabos.silaboId })
        .from(silabos)
        .where(and(inArray(silabos.convocatoriaCarreraId, convocationIds), SYLLABUS_ALIVE))
        .for("update", { of: silabos })
      return rows.map((row) => row.id)
    },
    teachersForProcess: (id) => recipients.teachersForProcess(id),
    coordinatorsForProcess: (id) => recipients.coordinatorsForProcess(id),
    librarians: () => recipients.librarians(),
    teacherSyllabusCounts: (ids) => recipients.teacherSyllabusCounts(ids),
    async purge(syllabusIds) {
      if (syllabusIds.length > 0) await work.deleteAggregates(syllabusIds)
    },
    async deleteProcess(processId, convocationIds) {
      await executor.execute(sql`SET LOCAL app.reinicio_institucional = 'off'`)
      if (convocationIds.length > 0) {
        await executor.delete(convocatoriasCarreras).where(and(inArray(convocatoriasCarreras.convocatoriaCarreraId, convocationIds), PROCESS_ALIVE))
      }
      await executor.delete(convocatoriasUniversidad).where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, processId))
    },
    templateProblem: (errorKey) => institutionalTemplateProblem(executor, errorKey),
    async lockOtherProcesses(processId) {
      await anotherProcessInProgress(executor, processId, true)
    },
    anotherInProgress: (processId) => anotherProcessInProgress(executor, processId),
    templateChange: (processId, reference) => templateChangedSince(executor, reference === "pause" ? "pausado_en" : "reopen", processId),
    syllabusCounts: (processId, toReopen) => processSyllabusCounts(executor, processId, toReopen),
    adaptToTemplate: (processId, change) => adaptProcessToTemplate(work, processId, change),
    convocationsToReopen: (processId) => convocationsToReopen(executor, processId),
    reopenPlan: (convocationIds, processId, finalized) => catchUp.plan(convocationIds, processId, finalized),
    reopen: (processId) => reopenProcess(work, processId),
    applyPlan: (plan, convocationIds, periodId) => catchUp.apply(plan, convocationIds, periodId),
    async generateReopened(convocationIds) {
      const locked = await executor
        .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
        .from(convocatoriasCarreras)
        .where(and(inArray(convocatoriasCarreras.convocatoriaCarreraId, convocationIds), PROCESS_ALIVE))
        .orderBy(asc(convocatoriasCarreras.convocatoriaCarreraId))
        .for("update")
      for (const convocation of locked) await work.generateConvocation(convocation.id, { allowEmpty: true, skipIncomplete: true })
    },
    async openConvocations(processId) {
      return executor
        .select({ id: convocatoriasCarreras.convocatoriaCarreraId, careerLabel: sql<string>`${careerLabelSql("carreras")}` })
        .from(convocatoriasCarreras)
        .innerJoin(carreras, eq(carreras.carreraId, convocatoriasCarreras.carreraId))
        .where(and(eq(convocatoriasCarreras.convocatoriaUniversidadId, processId), eq(convocatoriasCarreras.estadoConvocatoriaCarrera, "abierta"), PROCESS_ALIVE))
    },
    async updateState(processId, state) {
      await executor.update(convocatoriasUniversidad).set({ estadoConvocatoriaUniversidad: state }).where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, processId))
    },
    async extendDeadline(processId, dueAt, extension) {
      await executor
        .update(convocatoriasUniversidad)
        .set({ fechaEntrega: dueAt, cantidadProrrogas: extension })
        .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, processId))
    },
    teachersWithPendingWork: (id) => recipients.teachersWithPendingWork(id),
  }
}

export function processWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ProcessWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  const processes = processRepositoryOn(executor, () => Promise.reject(new Error("read only")))
  return {
    find: (id) => processes.find(id),
    now,
    nowMs: options.now === undefined ? () => Date.now() : () => now() * 1000,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(processWriteTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createProcessWriteDeps(): Omit<ProcessWriteDeps, "bridge"> {
  return processWriteDepsOn(db, dbTransaction)
}
