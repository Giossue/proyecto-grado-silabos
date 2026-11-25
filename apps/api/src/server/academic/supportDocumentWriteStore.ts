import { and, eq, inArray } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { fromEpoch } from "@/db/expressions"
import { archivos, documentosApoyo } from "@/db/schema"
import { withAfterCommit } from "../queue/dispatch"
import { findActiveCareer } from "./structureQueries"
import type { SupportDocumentViewStore, SupportDocumentViewTx } from "./supportDocumentView"
import { VIEW_NONE, VIEW_PENDING, VIEW_READY, type StoredObjectInput, type SupportDocumentTx, type SupportDocumentWriteStore } from "./supportDocumentWrites"

export async function insertStoredObject(executor: Executor, row: StoredObjectInput): Promise<void> {
  await executor.insert(archivos).values({
    archivoId: row.id,
    disco: row.disk,
    rutaArchivo: row.path,
    nombreArchivo: row.name,
    tipoArchivo: row.mime,
    tamanoBytes: row.size,
    hashArchivo: row.sha256,
    categoria: row.classification,
    subidoPor: row.ownerId,
    almacenadoEn: fromEpoch(row.storedAt),
  })
}

function writeTx(executor: Executor): SupportDocumentTx {
  return {
    insertObject: (row) => insertStoredObject(executor, row),
    async insertDocument(row) {
      await executor.insert(documentosApoyo).values({
        documentoApoyoId: row.id,
        carreraId: row.careerId,
        tituloDocumento: row.title,
        archivoId: row.objectId,
        archivoVistaId: row.previewId,
        estadoVista: row.view,
        subidoPor: row.uploadedBy,
        subidoEn: fromEpoch(row.uploadedAt),
      })
    },
    async lockDocument(id) {
      const [row] = await executor
        .select({ id: documentosApoyo.documentoApoyoId, careerId: documentosApoyo.carreraId, objectId: documentosApoyo.archivoId, previewId: documentosApoyo.archivoVistaId })
        .from(documentosApoyo)
        .where(eq(documentosApoyo.documentoApoyoId, id))
        .limit(1)
        .for("update")
      return row ?? null
    },
    async objects(ids) {
      if (ids.length === 0) return []
      return executor.select({ disk: archivos.disco, path: archivos.rutaArchivo }).from(archivos).where(inArray(archivos.archivoId, ids))
    },
    async deleteDocument(id) {
      await executor.delete(documentosApoyo).where(eq(documentosApoyo.documentoApoyoId, id))
    },
    async deleteObjects(ids) {
      if (ids.length > 0) await executor.delete(archivos).where(inArray(archivos.archivoId, ids))
    },
  }
}

export function supportDocumentStoreOn(executor: Executor, transaction: <T>(work: (executor: Executor) => Promise<T>) => Promise<T>): SupportDocumentWriteStore {
  return {
    careerActive: async (careerId) => (await findActiveCareer(careerId)) !== null,
    async documentCareer(id) {
      const [row] = await executor.select({ careerId: documentosApoyo.carreraId }).from(documentosApoyo).where(eq(documentosApoyo.documentoApoyoId, id)).limit(1)
      return row?.careerId ?? null
    },
    async readable(id) {
      const [row] = await executor
        .select({
          id: documentosApoyo.documentoApoyoId,
          careerId: documentosApoyo.carreraId,
          title: documentosApoyo.tituloDocumento,
          view: documentosApoyo.estadoVista,
          disk: archivos.disco,
          path: archivos.rutaArchivo,
        })
        .from(documentosApoyo)
        .leftJoin(archivos, eq(archivos.archivoId, documentosApoyo.archivoVistaId))
        .where(eq(documentosApoyo.documentoApoyoId, id))
        .limit(1)
      if (!row) return null
      return { id: row.id, careerId: row.careerId, title: row.title, view: row.view, preview: row.disk !== null && row.path !== null ? { disk: row.disk, path: row.path } : null }
    },
    transaction: (work) => withAfterCommit((afterCommit) => transaction((tx) => work(writeTx(tx), afterCommit))),
  }
}

export function createSupportDocumentWriteStore(): SupportDocumentWriteStore {
  return supportDocumentStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(tx as unknown as Executor)))
}

function viewTx(executor: Executor): SupportDocumentViewTx {
  return {
    async lockPending(id) {
      const [row] = await executor.select({ view: documentosApoyo.estadoVista }).from(documentosApoyo).where(eq(documentosApoyo.documentoApoyoId, id)).limit(1).for("update")
      return row?.view === VIEW_PENDING
    },
    insertObject: (row) => insertStoredObject(executor, row),
    async markReady(id, previewId) {
      await executor.update(documentosApoyo).set({ archivoVistaId: previewId, estadoVista: VIEW_READY }).where(eq(documentosApoyo.documentoApoyoId, id))
    },
  }
}

export function supportDocumentViewStoreOn(executor: Executor, transaction: <T>(work: (executor: Executor) => Promise<T>) => Promise<T>): SupportDocumentViewStore {
  return {
    async pending(id) {
      const [row] = await executor
        .select({ view: documentosApoyo.estadoVista, disk: archivos.disco, path: archivos.rutaArchivo, name: archivos.nombreArchivo, ownerId: archivos.subidoPor })
        .from(documentosApoyo)
        .innerJoin(archivos, eq(archivos.archivoId, documentosApoyo.archivoId))
        .where(eq(documentosApoyo.documentoApoyoId, id))
        .limit(1)
      if (!row || row.view !== VIEW_PENDING) return null
      return { disk: row.disk, path: row.path, name: row.name, ownerId: row.ownerId }
    },
    async markWithoutView(id) {
      await executor.update(documentosApoyo).set({ estadoVista: VIEW_NONE }).where(and(eq(documentosApoyo.documentoApoyoId, id), eq(documentosApoyo.estadoVista, VIEW_PENDING)))
    },
    transaction: (work) => transaction((tx) => work(viewTx(tx))),
  }
}

export function createSupportDocumentViewStore(): SupportDocumentViewStore {
  return supportDocumentViewStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(tx as unknown as Executor)))
}
