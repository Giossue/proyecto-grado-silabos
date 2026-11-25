import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { uuidList } from "../http/sql"
import { notificationScope, recipientsOn, systemNow, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { institutionalTemplateProblem } from "./convocationWriteStore"
import { anotherProcessInProgress } from "./finalizedChangeNotice"
import { InProgressWork, SYLLABUS_ALIVE } from "./inProgressWork"
import { adaptProcessToTemplate, convocationsToReopen, processSyllabusCounts, ReopenCatchUp, reopenProcess, templateChangedSince } from "./reopenCatchUp"
import { processRepositoryOn } from "./processQueries"
import type { ProcessWriteDeps, ProcessWriteTx } from "./processWrites"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const PROCESS_ALIVE = sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

export function processWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, mail?: Mail): ProcessWriteTx {
  const notifications = notificationScope(executor, afterCommit, now, mail)
  const work = new InProgressWork(executor, afterCommit, notifications)
  const catchUp = new ReopenCatchUp(work, afterCommit)
  const recipients = recipientsOn(executor)
  return {
    notifications,
    async lockProcess(id) {
      const [row] = await rowsOf<{
        id: string
        state: string
        period_id: string
        period: string | null
        due_at: number
        extensions: number
        ends_on: string
        finalized: boolean
      }>(
        executor,
        sql`select proceso.convocatoria_universidad_id::text as id, proceso.estado_convocatoria_universidad as state, proceso.periodo_academico_id::text as period_id,
            periodo.codigo_periodo_academico as period, extract(epoch from proceso.fecha_entrega)::bigint as due_at, proceso.cantidad_prorrogas as extensions,
            to_char(periodo.fecha_fin_periodo, 'YYYY-MM-DD') as ends_on, proceso.finalizada_en is not null as finalized
          from convocatorias_universidad proceso left join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
          where proceso.convocatoria_universidad_id = ${id}::uuid limit 1 for update of proceso`,
      )
      return row
        ? {
            id: row.id,
            state: row.state,
            periodId: row.period_id,
            period: row.period ?? "Período",
            dueAt: Number(row.due_at),
            extensions: Number(row.extensions),
            periodEndsOn: row.ends_on,
            finalized: row.finalized,
          }
        : null
    },
    async lockConvocations(processId) {
      const rows = await rowsOf<{ id: string }>(
        executor,
        sql`select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE} for update`,
      )
      return rows.map((row) => row.id)
    },
    async lockSyllabi(convocationIds) {
      if (convocationIds.length === 0) return []
      const rows = await rowsOf<{ id: string }>(
        executor,
        sql`select silabos.silabo_id::text as id from silabos where silabos.convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${SYLLABUS_ALIVE} for update of silabos`,
      )
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
        await executor.execute(sql`delete from convocatorias_carreras where convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${PROCESS_ALIVE}`)
      }
      await executor.execute(sql`delete from convocatorias_universidad where convocatoria_universidad_id = ${processId}::uuid`)
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
      const locked = await rowsOf<{ id: string }>(
        executor,
        sql`select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${PROCESS_ALIVE}
          order by convocatoria_carrera_id asc for update`,
      )
      for (const convocation of locked) await work.generateConvocation(convocation.id, { allowEmpty: true, skipIncomplete: true })
    },
    async openConvocations(processId) {
      return rowsOf<{ id: string; careerLabel: string }>(
        executor,
        sql`select convocatorias_carreras.convocatoria_carrera_id::text as id, ${careerLabelSql("carrera")} as "careerLabel"
          from convocatorias_carreras inner join carreras carrera on carrera.carrera_id = convocatorias_carreras.carrera_id
          where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and convocatorias_carreras.estado_convocatoria_carrera = 'abierta' and ${PROCESS_ALIVE}`,
      )
    },
    async updateState(processId, state) {
      await executor.execute(sql`update convocatorias_universidad set estado_convocatoria_universidad = ${state} where convocatoria_universidad_id = ${processId}::uuid`)
    },
    async extendDeadline(processId, dueAt, extension) {
      await executor.execute(sql`update convocatorias_universidad set fecha_entrega = ${dueAt}::timestamptz, cantidad_prorrogas = ${extension}
        where convocatoria_universidad_id = ${processId}::uuid`)
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
  return processWriteDepsOn(db as unknown as Executor, dbTransaction)
}
