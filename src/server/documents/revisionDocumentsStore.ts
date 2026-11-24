import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { iso8601 } from "../laravel/sql"
import { insertAuditEvent } from "../operations/recordAuditEvent"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { DocumentStore } from "./revisionDocuments"

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
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
  }
}

export function createDocumentStore(): DocumentStore {
  return documentStoreOn(db as unknown as Executor)
}
