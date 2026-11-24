import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonDecode } from "../configuration/phpValues"
import { canonicalJson, hasAmbiguousNumbers } from "../documents/canonicalJson"
import { buildSyllabusSnapshot } from "../documents/syllabusSnapshot"
import { snapshotSourceOn } from "../documents/syllabusSnapshotStore"
import { systemNow, type WriteOptions } from "../notifications/queries"
import type { ClosingDeps, ClosingTx } from "./processClosing"
import { processRepositoryOn, processTx } from "./processQueries"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { NeedsLaravel } from "./snapshotDocuments"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const PROCESS_ALIVE = sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

function closingTx(executor: Executor): ClosingTx {
  const process = processTx(executor)
  return {
    lockProcess: (id) => process.lockProcess(id),
    recordAudit: (event) => process.recordAudit(event),
    async closeProcess(id, keepPausedAt) {
      await executor.execute(sql`update convocatorias_universidad set estado_convocatoria_universidad = 'cerrado', finalizada_en = clock_timestamp()
        ${keepPausedAt ? sql`` : sql`, pausado_en = null`} where convocatoria_universidad_id = ${id}::uuid`)
    },
    async lockOpenSyllabi(processId) {
      const rows = await rowsOf<{ id: string; context: string | null }>(
        executor,
        sql`select silabos.silabo_id::text as id, silabos.datos_academicos_silabo::text as context from silabos
          where exists (select 1 from convocatorias_carreras where convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
              and convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE})
            and silabos.estado_silabo not in ('en_revision', 'aprobado')
            and exists (select 1 from convocatorias_carreras where convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id and ${PROCESS_ALIVE})
          for update of silabos`,
      )
      if (rows.some((row) => hasAmbiguousNumbers(row.context))) throw new NeedsLaravel()
      return rows.map((row) => ({ id: row.id, context: phpJsonDecode(row.context) }))
    },
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async storeContext(syllabusId, context) {
      await executor.execute(sql`update silabos set datos_academicos_silabo = ${canonicalJson(context)}::jsonb where silabo_id = ${syllabusId}::uuid`)
    },
    async closeConvocations(processId) {
      await executor.execute(sql`update convocatorias_carreras set estado_previo_cierre_convocatoria_carrera = estado_convocatoria_carrera,
          estado_convocatoria_carrera = 'cerrada'
        where convocatoria_universidad_id = ${processId}::uuid and estado_convocatoria_carrera in ('abierta', 'pausada') and ${PROCESS_ALIVE}`)
    },
  }
}

export function closingDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ClosingDeps, "bridge"> {
  return {
    processes: processRepositoryOn(executor, (work) => transaction((inner) => work(processTx(inner)))),
    now: options.now ?? systemNow,
    transaction: (work) => transaction((inner) => work(closingTx(inner))),
  }
}

export function createClosingDeps(): Omit<ClosingDeps, "bridge"> {
  return closingDepsOn(db as unknown as Executor, dbTransaction)
}
