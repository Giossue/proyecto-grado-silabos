import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { withAfterCommit } from "../queue/dispatch"
import { uuidList } from "../http/sql"
import { findActiveCareer } from "./structureQueries"
import type { SupportDocumentViewStore, SupportDocumentViewTx } from "./supportDocumentView"
import { VIEW_NONE, VIEW_PENDING, VIEW_READY, type StoredObjectInput, type SupportDocumentTx, type SupportDocumentWriteStore } from "./supportDocumentWrites"

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

async function rows<T>(executor: Executor, query: SQL): Promise<T[]> {
  return (await executor.execute(query)).rows as T[]
}

export async function insertStoredObject(executor: Executor, row: StoredObjectInput): Promise<void> {
  await executor.execute(sql`insert into archivos (archivo_id, disco, ruta_archivo, nombre_archivo, tipo_archivo, tamano_bytes, hash_archivo, categoria, subido_por, almacenado_en)
    values (${row.id}::uuid, ${row.disk}, ${row.path}, ${row.name}, ${row.mime}, ${row.size}, ${row.sha256}, ${row.classification}, ${row.ownerId}::uuid, to_timestamp(${row.storedAt}))`)
}

function writeTx(executor: Executor): SupportDocumentTx {
  return {
    insertObject: (row) => insertStoredObject(executor, row),
    async insertDocument(row) {
      await executor.execute(sql`insert into documentos_apoyo (documento_apoyo_id, carrera_id, titulo_documento, archivo_id, archivo_vista_id, estado_vista, subido_por, subido_en)
        values (${row.id}::uuid, ${row.careerId}::uuid, ${row.title}, ${row.objectId}::uuid, ${row.previewId}::uuid, ${row.view}, ${row.uploadedBy}::uuid, to_timestamp(${row.uploadedAt}))`)
    },
    async lockDocument(id) {
      const [row] = await rows<{ id: string; career_id: string; object_id: string; preview_id: string | null }>(
        executor,
        sql`select documento_apoyo_id::text as id, carrera_id::text as career_id, archivo_id::text as object_id, archivo_vista_id::text as preview_id
          from documentos_apoyo where documento_apoyo_id = ${id}::uuid limit 1 for update`,
      )
      return row ? { id: row.id, careerId: row.career_id, objectId: row.object_id, previewId: row.preview_id } : null
    },
    async objects(ids) {
      if (ids.length === 0) return []
      return rows<{ disk: string; path: string }>(executor, sql`select disco as disk, ruta_archivo as path from archivos where archivo_id in (${uuidList(ids)})`)
    },
    async deleteDocument(id) {
      await executor.execute(sql`delete from documentos_apoyo where documento_apoyo_id = ${id}::uuid`)
    },
    async deleteObjects(ids) {
      if (ids.length > 0) await executor.execute(sql`delete from archivos where archivo_id in (${uuidList(ids)})`)
    },
  }
}

export function supportDocumentStoreOn(executor: Executor, transaction: <T>(work: (executor: Executor) => Promise<T>) => Promise<T>): SupportDocumentWriteStore {
  return {
    careerActive: async (careerId) => (await findActiveCareer(careerId)) !== null,
    async documentCareer(id) {
      const [row] = await rows<{ career_id: string }>(executor, sql`select carrera_id::text as career_id from documentos_apoyo where documento_apoyo_id = ${id}::uuid limit 1`)
      return row?.career_id ?? null
    },
    async readable(id) {
      const [row] = await rows<{ id: string; career_id: string; title: string; view: string; disk: string | null; path: string | null }>(
        executor,
        sql`select documento.documento_apoyo_id::text as id, documento.carrera_id::text as career_id, documento.titulo_documento as title,
            documento.estado_vista as view, vista.disco as disk, vista.ruta_archivo as path
          from documentos_apoyo documento left join archivos vista on vista.archivo_id = documento.archivo_vista_id
          where documento.documento_apoyo_id = ${id}::uuid limit 1`,
      )
      if (!row) return null
      return { id: row.id, careerId: row.career_id, title: row.title, view: row.view, preview: row.disk !== null && row.path !== null ? { disk: row.disk, path: row.path } : null }
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
      const [row] = await rows<{ view: string }>(executor, sql`select estado_vista as view from documentos_apoyo where documento_apoyo_id = ${id}::uuid limit 1 for update`)
      return row?.view === VIEW_PENDING
    },
    insertObject: (row) => insertStoredObject(executor, row),
    async markReady(id, previewId) {
      await executor.execute(sql`update documentos_apoyo set archivo_vista_id = ${previewId}::uuid, estado_vista = ${VIEW_READY} where documento_apoyo_id = ${id}::uuid`)
    },
  }
}

export function supportDocumentViewStoreOn(executor: Executor, transaction: <T>(work: (executor: Executor) => Promise<T>) => Promise<T>): SupportDocumentViewStore {
  return {
    async pending(id) {
      const [row] = await rows<{ view: string; disk: string; path: string; name: string; owner_id: string | null }>(
        executor,
        sql`select documento.estado_vista as view, archivo.disco as disk, archivo.ruta_archivo as path, archivo.nombre_archivo as name, archivo.subido_por::text as owner_id
          from documentos_apoyo documento inner join archivos archivo on archivo.archivo_id = documento.archivo_id
          where documento.documento_apoyo_id = ${id}::uuid limit 1`,
      )
      if (!row || row.view !== VIEW_PENDING) return null
      return { disk: row.disk, path: row.path, name: row.name, ownerId: row.owner_id }
    },
    async markWithoutView(id) {
      await executor.execute(sql`update documentos_apoyo set estado_vista = ${VIEW_NONE} where documento_apoyo_id = ${id}::uuid and estado_vista = ${VIEW_PENDING}`)
    },
    transaction: (work) => transaction((tx) => work(viewTx(tx))),
  }
}

export function createSupportDocumentViewStore(): SupportDocumentViewStore {
  return supportDocumentViewStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(tx as unknown as Executor)))
}
