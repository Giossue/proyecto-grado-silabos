import { desc, eq, sql, type AnyColumn, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { aprobaciones, archivos, exportacionesSilabo, usuarios } from "@/db/schema"
import { iso8601 } from "../http/sql"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../notifications/queries"
import { withAfterCommit } from "../queue/dispatch"
import { dispatchSyllabusExport } from "./syllabusExportJob"
import { dbTransaction, exportRequestTxOn, type TransactionRunner } from "./syllabusExportStore"
import { reviewDetailStoreOn } from "../syllabus/reviewDetailQueries"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { DocumentRequestDeps, DocumentStore } from "./revisionDocuments"

function isoText(column: AnyColumn): SQL<string> {
  return sql<string>`${iso8601(sql`${column}`)}`
}

export function documentStoreOn(executor: Executor): DocumentStore {
  const reviews = reviewDetailStoreOn(executor)
  return {
    revision: (id) => reviews.revision(id),
    syllabus: (id, userId) => reviews.syllabus(id, userId),
    async approval(revisionId) {
      const [row] = await executor
        .select({ approvedAt: isoText(aprobaciones.aprobadoEn), approvedBy: usuarios.nombreUsuario })
        .from(aprobaciones)
        .leftJoin(usuarios, eq(usuarios.usuarioId, aprobaciones.aprobadoPor))
        .where(eq(aprobaciones.revisionSilaboId, revisionId))
        .limit(1)
      return row ? { approvedAt: row.approvedAt, approvedBy: row.approvedBy ?? "" } : null
    },
    async artifacts(revisionId) {
      const rows = await executor
        .select({
          id: exportacionesSilabo.exportacionSilaboId,
          state: exportacionesSilabo.estadoExportacion,
          requestedAt: isoText(exportacionesSilabo.solicitadoEn),
          completedAt: sql<string | null>`${iso8601(sql`${exportacionesSilabo.completadoEn}`)}`,
          pdfSize: archivos.tamanoBytes,
        })
        .from(exportacionesSilabo)
        .leftJoin(archivos, eq(archivos.archivoId, exportacionesSilabo.archivoPdfId))
        .where(eq(exportacionesSilabo.revisionSilaboId, revisionId))
        .orderBy(desc(exportacionesSilabo.solicitadoEn))
      return rows.map((row) => ({ id: row.id, state: row.state, requestedAt: row.requestedAt, completedAt: row.completedAt, pdfSize: row.pdfSize }))
    },
    async artifact(id) {
      const [row] = await executor
        .select({
          id: exportacionesSilabo.exportacionSilaboId,
          revisionId: exportacionesSilabo.revisionSilaboId,
          state: exportacionesSilabo.estadoExportacion,
          objectId: archivos.archivoId,
          disk: archivos.disco,
          path: archivos.rutaArchivo,
        })
        .from(exportacionesSilabo)
        .leftJoin(archivos, eq(archivos.archivoId, exportacionesSilabo.archivoPdfId))
        .where(eq(exportacionesSilabo.exportacionSilaboId, id))
        .limit(1)
      if (!row) return null
      return { id: row.id, revisionId: row.revisionId, state: row.state, object: row.objectId === null ? null : { id: row.objectId, disk: row.disk ?? "", path: row.path ?? "" } }
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
): Pick<DocumentRequestDeps, "existing" | "transaction" | "newId" | "now"> {
  const dispatch = options.dispatch ?? dispatchSyllabusExport
  return {
    existing: (revisionId, key) => exportRequestTxOn(executor, () => undefined, dispatch).existingArtifact(revisionId, key),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(exportRequestTxOn(inner, afterCommit, dispatch)))),
    newId: options.newId ?? uuid7,
    now: options.now ?? systemNow,
  }
}

export function createDocumentRequestParts(): Pick<DocumentRequestDeps, "existing" | "transaction" | "newId" | "now"> {
  return documentRequestPartsOn(db as unknown as Executor, dbTransaction)
}
