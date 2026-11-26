import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { iso8601 } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { withAfterCommit } from "../queue/dispatch"
import { dispatchSyllabusExport } from "./syllabusExportJob"
import { dbTransaction, exportRequestTxOn, type TransactionRunner } from "./syllabusExportStore"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import { rowsOf } from "../syllabus/teacherSyllabusQueries"
import type { DocumentRequestDeps, DocumentStore } from "./revisionDocuments"

export function documentStoreOn(executor: Db): DocumentStore {
  const reviews = reviewDetailStoreOn(executor)
  return {
    revision: (id) => reviews.revision(id),
    syllabus: (id, userId) => reviews.syllabus(id, userId),
    async approval(revisionId) {
      const [row] = await rowsOf<{ approvedAt: string; approvedBy: string | null }>(
        executor,
        Prisma.sql`select ${iso8601(Prisma.raw('"aprobaciones"."aprobado_en"'))} as "approvedAt", "usuarios"."nombre_usuario" as "approvedBy"
        from "aprobaciones" left join "usuarios" on "usuarios"."usuario_id" = "aprobaciones"."aprobado_por"
        where "aprobaciones"."revision_silabo_id" = ${revisionId}::uuid limit 1`,
      )
      return row ? { approvedAt: row.approvedAt, approvedBy: row.approvedBy ?? "" } : null
    },
    async artifacts(revisionId) {
      const rows = await rowsOf<{ id: string; state: string; requestedAt: string; completedAt: string | null; pdfSize: bigint | null }>(
        executor,
        Prisma.sql`select "exportaciones_silabo"."exportacion_silabo_id"::text as id, "exportaciones_silabo"."estado_exportacion" as state,
          ${iso8601(Prisma.raw('"exportaciones_silabo"."solicitado_en"'))} as "requestedAt", ${iso8601(Prisma.raw('"exportaciones_silabo"."completado_en"'))} as "completedAt",
          "archivos"."tamano_bytes" as "pdfSize"
        from "exportaciones_silabo" left join "archivos" on "archivos"."archivo_id" = "exportaciones_silabo"."archivo_pdf_id"
        where "exportaciones_silabo"."revision_silabo_id" = ${revisionId}::uuid
        order by "exportaciones_silabo"."solicitado_en" desc`,
      )
      return rows.map((row) => ({ id: row.id, state: row.state, requestedAt: row.requestedAt, completedAt: row.completedAt, pdfSize: row.pdfSize === null ? null : Number(row.pdfSize) }))
    },
    async artifact(id) {
      const [row] = await rowsOf<{ id: string; revisionId: string; state: string; objectId: string | null; disk: string | null; path: string | null }>(
        executor,
        Prisma.sql`select "exportaciones_silabo"."exportacion_silabo_id"::text as id, "exportaciones_silabo"."revision_silabo_id"::text as "revisionId",
          "exportaciones_silabo"."estado_exportacion" as state, "archivos"."archivo_id"::text as "objectId", "archivos"."disco" as disk, "archivos"."ruta_archivo" as path
        from "exportaciones_silabo" left join "archivos" on "archivos"."archivo_id" = "exportaciones_silabo"."archivo_pdf_id"
        where "exportaciones_silabo"."exportacion_silabo_id" = ${id}::uuid limit 1`,
      )
      if (!row) return null
      return { id: row.id, revisionId: row.revisionId, state: row.state, object: row.objectId === null ? null : { id: row.objectId, disk: row.disk ?? "", path: row.path ?? "" } }
    },
  }
}

export function createDocumentStore(prisma: PrismaService): DocumentStore {
  return documentStoreOn(prisma)
}

export type DocumentRequestOptions = { now?: () => number; newId?: () => string; dispatch?: (artifactId: string) => unknown }

export function documentRequestPartsOn(
  executor: Db,
  transaction: TransactionRunner,
  options: DocumentRequestOptions = {},
): Pick<DocumentRequestDeps, "existing" | "transaction" | "newId" | "now"> {
  const dispatch = options.dispatch ?? dispatchSyllabusExport
  return {
    existing: (revisionId, key) => exportRequestTxOn(executor, () => undefined, dispatch).existingArtifact(revisionId, key),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(exportRequestTxOn(inner, afterCommit, dispatch)))),
    newId: options.newId ?? uuid7,
    now: options.now ?? systemNow,
  }
}

export function createDocumentRequestParts(prisma: PrismaService): Pick<DocumentRequestDeps, "existing" | "transaction" | "newId" | "now"> {
  return documentRequestPartsOn(prisma, dbTransaction(prisma))
}
