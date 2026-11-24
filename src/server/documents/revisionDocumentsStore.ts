import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { record } from "../configuration/phpValues"
import { iso8601 } from "../laravel/sql"
import { uuid7 } from "../laravel/uuid7"
import { systemNow } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { revisionSnapshotOf } from "../syllabus/syllabusDetailQueries"
import { gotenbergEnabled, gotenbergSettings } from "./gotenbergConverter"
import { dispatchSyllabusExport } from "./syllabusExportJob"
import { dbTransaction, exportRequestTxOn, type TransactionRunner } from "./syllabusExportStore"
import { rendersInNext } from "./syllabusRenderer"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { DocumentRequestDeps, DocumentStore } from "./revisionDocuments"

export function documentStoreOn(executor: Executor): DocumentStore {
  const reviews = reviewDetailStoreOn(executor)
  return {
    revision: (id) => reviews.revision(id),
    syllabus: (id, userId) => reviews.syllabus(id, userId),
    async approval(revisionId) {
      const [row] = await rowsOf<{ approved_at: string; approved_by: string | null }>(
        executor,
        sql`select ${iso8601(sql.raw("aprobaciones.aprobado_en"))} as approved_at, usuarios.nombre_usuario as approved_by
          from aprobaciones left join usuarios on usuarios.usuario_id = aprobaciones.aprobado_por
          where aprobaciones.revision_silabo_id = ${revisionId}::uuid limit 1`,
      )
      return row ? { approvedAt: row.approved_at, approvedBy: row.approved_by ?? "" } : null
    },
    async artifacts(revisionId) {
      const rows = await rowsOf<{ id: string; state: string; requested_at: string; completed_at: string | null; pdf_size: string | null }>(
        executor,
        sql`select exportacion.exportacion_silabo_id::text as id, exportacion.estado_exportacion as state,
            ${iso8601(sql.raw("exportacion.solicitado_en"))} as requested_at,
            case when exportacion.completado_en is null then null else ${iso8601(sql.raw("exportacion.completado_en"))} end as completed_at,
            archivo.tamano_bytes::text as pdf_size
          from exportaciones_silabo exportacion left join archivos archivo on archivo.archivo_id = exportacion.archivo_pdf_id
          where exportacion.revision_silabo_id = ${revisionId}::uuid order by exportacion.solicitado_en desc`,
      )
      return rows.map((row) => ({ id: row.id, state: row.state, requestedAt: row.requested_at, completedAt: row.completed_at, pdfSize: row.pdf_size === null ? null : Number(row.pdf_size) }))
    },
    async artifact(id) {
      const [row] = await rowsOf<{ id: string; revision_id: string; state: string; object_id: string | null; disk: string | null; path: string | null }>(
        executor,
        sql`select exportacion.exportacion_silabo_id::text as id, exportacion.revision_silabo_id::text as revision_id, exportacion.estado_exportacion as state,
            archivo.archivo_id::text as object_id, archivo.disco as disk, archivo.ruta_archivo as path
          from exportaciones_silabo exportacion left join archivos archivo on archivo.archivo_id = exportacion.archivo_pdf_id
          where exportacion.exportacion_silabo_id = ${id}::uuid limit 1`,
      )
      if (!row) return null
      return { id: row.id, revisionId: row.revision_id, state: row.state, object: row.object_id === null ? null : { id: row.object_id, disk: row.disk ?? "", path: row.path ?? "" } }
    },
  }
}

export function createDocumentStore(): DocumentStore {
  return documentStoreOn(db as unknown as Executor)
}

export type DocumentRequestOptions = { now?: () => number; newId?: () => string; dispatch?: (artifactId: string) => unknown }

export function documentRequestPartsOn(
  executor: Executor,
  transaction: TransactionRunner,
  options: DocumentRequestOptions = {},
): Pick<DocumentRequestDeps, "renderable" | "existing" | "transaction" | "newId" | "now"> {
  const dispatch = options.dispatch ?? dispatchSyllabusExport
  return {
    renderable: async (revisionId) => rendersInNext(record(await revisionSnapshotOf(executor, revisionId)), gotenbergEnabled(gotenbergSettings())),
    existing: (revisionId, key) => exportRequestTxOn(executor, () => undefined, dispatch).existingArtifact(revisionId, key),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(exportRequestTxOn(inner, afterCommit, dispatch)))),
    newId: options.newId ?? uuid7,
    now: options.now ?? systemNow,
  }
}

export function createDocumentRequestParts(): Pick<DocumentRequestDeps, "renderable" | "existing" | "transaction" | "newId" | "now"> {
  return documentRequestPartsOn(db as unknown as Executor, dbTransaction)
}
