import "server-only"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { convocatoriasCarreras, convocatoriasUniversidad } from "@/db/schema"
import { phpJsonDecode } from "../configuration/phpValues"
import { canonicalJson } from "../documents/canonicalJson"
import { buildSyllabusSnapshot } from "../documents/syllabusSnapshot"
import { snapshotSourceOn } from "../documents/syllabusSnapshotStore"
import { systemNow, type WriteOptions } from "../notifications/queries"
import { CLOSED_DOCUMENT, type ClosingDeps, type ClosingTx } from "./processClosing"
import { processRepositoryOn, processTx } from "./processQueries"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const PROCESS_ALIVE = sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

function closingTx(executor: Executor): ClosingTx {
  const process = processTx(executor)
  return {
    lockProcess: (id) => process.lockProcess(id),
    async closeProcess(id, keepPausedAt) {
      await executor
        .update(convocatoriasUniversidad)
        .set({ estadoConvocatoriaUniversidad: "cerrado", finalizadaEn: sql`clock_timestamp()`, ...(keepPausedAt ? {} : { pausadoEn: null }) })
        .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, id))
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
      return rows.map((row) => ({ id: row.id, context: phpJsonDecode(row.context) }))
    },
    snapshot: (syllabusId) => buildSyllabusSnapshot(syllabusId, snapshotSourceOn(executor)),
    async storeClosedDocument(syllabusId, snapshot) {
      await executor.execute(sql`update silabos set datos_academicos_silabo = (case jsonb_typeof(datos_academicos_silabo)
          when 'object' then datos_academicos_silabo
          when 'array' then (select coalesce(jsonb_object_agg((item.position - 1)::text, item.value), '{}'::jsonb)
            from jsonb_array_elements(datos_academicos_silabo) with ordinality as item(value, position))
          else '{}'::jsonb end) || jsonb_build_object(${CLOSED_DOCUMENT}::text, ${canonicalJson(snapshot)}::jsonb)
        where silabo_id = ${syllabusId}::uuid`)
    },
    async closeConvocations(processId) {
      await executor
        .update(convocatoriasCarreras)
        .set({ estadoPrevioCierreConvocatoriaCarrera: sql`${convocatoriasCarreras.estadoConvocatoriaCarrera}`, estadoConvocatoriaCarrera: "cerrada" })
        .where(
          and(
            eq(convocatoriasCarreras.convocatoriaUniversidadId, processId),
            inArray(convocatoriasCarreras.estadoConvocatoriaCarrera, ["abierta", "pausada"]),
            PROCESS_ALIVE,
          ),
        )
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
