import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { epochText, uuidList } from "../../prisma/sql"
import { systemNow } from "../shared/clock"
import { notificationScope, recipientsOn, type Mail, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { institutionalTemplateProblem } from "./convocationWriteStore"
import { anotherProcessInProgress } from "./finalizedChangeNotice"
import { InProgressWork, SYLLABUS_ALIVE } from "./inProgressWork"
import { adaptProcessToTemplate, convocationsToReopen, processSyllabusCounts, ReopenCatchUp, reopenProcess, templateChangedSince } from "./reopenCatchUp"
import { processRepositoryOn } from "./processQueries"
import type { ProcessWriteDeps, ProcessWriteTx } from "./processWrites"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { careerLabelSql } from "./syllabusSql"
import { rowsOf } from "./teacherSyllabusQueries"

const PROCESS_ALIVE = Prisma.sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

export function processWriteTx(executor: Db, afterCommit: AfterCommit, now: number, mail?: Mail): ProcessWriteTx {
  const notifications = notificationScope(executor, afterCommit, now, mail)
  const work = new InProgressWork(executor, afterCommit, notifications)
  const catchUp = new ReopenCatchUp(work, afterCommit)
  const recipients = recipientsOn(executor)
  return {
    notifications,
    async lockProcess(id) {
      const [row] = await rowsOf<{ id: string; state: string; periodId: string; period: string | null; dueAt: string; extensions: number; periodEndsOn: string | null; finalized: boolean }>(
        executor,
        Prisma.sql`select convocatorias_universidad.convocatoria_universidad_id::text as id, convocatorias_universidad.estado_convocatoria_universidad as state,
            convocatorias_universidad.periodo_academico_id::text as "periodId", periodos_academicos.codigo_periodo_academico as period,
            ${epochText(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueAt", convocatorias_universidad.cantidad_prorrogas as extensions,
            periodos_academicos.fecha_fin_periodo::text as "periodEndsOn", (convocatorias_universidad.finalizada_en is not null) as finalized
          from convocatorias_universidad
          left join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id
          where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid limit 1 for update of convocatorias_universidad`,
      )
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
      const rows = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id from convocatorias_carreras
          where (convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE}) for update`,
      )
      return rows.map((row) => row.id)
    },
    async lockSyllabi(convocationIds) {
      if (convocationIds.length === 0) return []
      const rows = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select silabos.silabo_id::text as id from silabos
          where (silabos.convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${SYLLABUS_ALIVE}) for update of silabos`,
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
      await executor.$executeRaw`SET LOCAL app.reinicio_institucional = 'off'`
      if (convocationIds.length > 0) {
        await executor.$executeRaw`delete from convocatorias_carreras where (convocatorias_carreras.convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${PROCESS_ALIVE})`
      }
      await executor.$executeRaw`delete from convocatorias_universidad where convocatorias_universidad.convocatoria_universidad_id = ${processId}::uuid`
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
      const locked =
        convocationIds.length === 0
          ? await rowsOf<{ id: string }>(
              executor,
              Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id from convocatorias_carreras
                where (false and ${PROCESS_ALIVE}) order by convocatorias_carreras.convocatoria_carrera_id asc for update`,
            )
          : await rowsOf<{ id: string }>(
              executor,
              Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id from convocatorias_carreras
                where (convocatorias_carreras.convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${PROCESS_ALIVE})
                order by convocatorias_carreras.convocatoria_carrera_id asc for update`,
            )
      for (const convocation of locked) await work.generateConvocation(convocation.id, { allowEmpty: true, skipIncomplete: true })
    },
    async openConvocations(processId) {
      return rowsOf<{ id: string; careerLabel: string }>(
        executor,
        Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id, ${careerLabelSql("carreras")} as "careerLabel"
          from convocatorias_carreras inner join carreras on carreras.carrera_id = convocatorias_carreras.carrera_id
          where (convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and convocatorias_carreras.estado_convocatoria_carrera = ${"abierta"} and ${PROCESS_ALIVE})`,
      )
    },
    async updateState(processId, state) {
      await executor.$executeRaw`update convocatorias_universidad set estado_convocatoria_universidad = ${state} where convocatorias_universidad.convocatoria_universidad_id = ${processId}::uuid`
    },
    async extendDeadline(processId, dueAt, extension) {
      await executor.$executeRaw`update convocatorias_universidad set fecha_entrega = ${dueAt}::timestamptz, cantidad_prorrogas = ${extension}
        where convocatorias_universidad.convocatoria_universidad_id = ${processId}::uuid`
    },
    teachersWithPendingWork: (id) => recipients.teachersWithPendingWork(id),
  }
}

export function processWriteDepsOn(executor: Db, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ProcessWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  const processes = processRepositoryOn(executor, () => Promise.reject(new Error("read only")))
  return {
    find: (id) => processes.find(id),
    now,
    nowMs: options.now === undefined ? () => Date.now() : () => now() * 1000,
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(processWriteTx(inner, afterCommit, now(), options.mail)))),
  }
}

export function createProcessWriteDeps(prisma: PrismaService): Omit<ProcessWriteDeps, "bridge"> {
  return processWriteDepsOn(prisma, dbTransaction(prisma))
}
