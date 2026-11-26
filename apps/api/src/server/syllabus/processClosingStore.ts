import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { phpJsonDecode } from "../configuration/phpValues"
import { canonicalJson } from "../documents/canonicalJson"
import { buildSyllabusSnapshot } from "../documents/syllabusSnapshot"
import { snapshotSourceOn } from "../documents/syllabusSnapshotStore"
import { systemNow } from "../shared/clock"
import { type WriteOptions } from "../notifications/queries"
import { CLOSED_DOCUMENT, type ClosingDeps, type ClosingTx } from "./processClosing"
import { processRepositoryOn, processTx } from "./processQueries"
import { dbTransaction, type TransactionRunner } from "./reviewDecisionStore"
import { rowsOf } from "./teacherSyllabusQueries"

const PROCESS_ALIVE = Prisma.sql`exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

function closingTx(executor: Db): ClosingTx {
  const process = processTx(executor)
  return {
    lockProcess: (id) => process.lockProcess(id),
    async closeProcess(id, keepPausedAt) {
      await executor.$executeRaw`update convocatorias_universidad set estado_convocatoria_universidad = ${"cerrado"},
        ${keepPausedAt ? Prisma.empty : Prisma.sql`pausado_en = null,`} finalizada_en = clock_timestamp()
        where convocatorias_universidad.convocatoria_universidad_id = ${id}::uuid`
    },
    async lockOpenSyllabi(processId) {
      const rows = await rowsOf<{ id: string; context: string | null }>(
        executor,
        Prisma.sql`select silabos.silabo_id::text as id, silabos.datos_academicos_silabo::text as context from silabos
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
      await executor.$executeRaw(Prisma.sql`update silabos set datos_academicos_silabo = (case jsonb_typeof(datos_academicos_silabo)
          when 'object' then datos_academicos_silabo
          when 'array' then (select coalesce(jsonb_object_agg((item.position - 1)::text, item.value), '{}'::jsonb)
            from jsonb_array_elements(datos_academicos_silabo) with ordinality as item(value, position))
          else '{}'::jsonb end) || jsonb_build_object(${CLOSED_DOCUMENT}::text, ${canonicalJson(snapshot)}::jsonb)
        where silabo_id = ${syllabusId}::uuid`)
    },
    async closeConvocations(processId) {
      await executor.$executeRaw`update convocatorias_carreras set estado_convocatoria_carrera = ${"cerrado"},
        estado_previo_cierre_convocatoria_carrera = convocatorias_carreras.estado_convocatoria_carrera
        where (convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid
          and convocatorias_carreras.estado_convocatoria_carrera in (${"abierto"}, ${"pausado"}) and ${PROCESS_ALIVE})`
    },
  }
}

export function closingDepsOn(executor: Db, transaction: TransactionRunner, options: WriteOptions = {}): Omit<ClosingDeps, "bridge"> {
  return {
    processes: processRepositoryOn(executor, (work) => transaction((inner) => work(processTx(inner)))),
    now: options.now ?? systemNow,
    transaction: (work) => transaction((inner) => work(closingTx(inner))),
  }
}

export function createClosingDeps(prisma: PrismaService): Omit<ClosingDeps, "bridge"> {
  return closingDepsOn(prisma, dbTransaction(prisma))
}
