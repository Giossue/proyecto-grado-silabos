import { type Db, inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import type { SupportDocumentViewStore, SupportDocumentViewTx } from "./supportDocumentView"
import { VIEW_NONE, VIEW_PENDING, VIEW_READY, type StoredObjectInput } from "./supportDocumentWrites"

export async function insertStoredObject(db: Db, row: StoredObjectInput): Promise<void> {
  await db.archivos.create({
    data: {
      archivo_id: row.id,
      disco: row.disk,
      ruta_archivo: row.path,
      nombre_archivo: row.name,
      tipo_archivo: row.mime,
      tamano_bytes: BigInt(row.size),
      hash_archivo: row.sha256,
      categoria: row.classification,
      subido_por: row.ownerId,
      almacenado_en: new Date(row.storedAt * 1000),
    },
  })
}

function viewTx(db: Db): SupportDocumentViewTx {
  return {
    async lockPending(id, originalId) {
      const [row] = await db.$queryRaw<{ view: string; original: string }[]>`select documentos_apoyo.estado_vista as view, documentos_apoyo.archivo_id::text as original from documentos_apoyo
        where documentos_apoyo.documento_apoyo_id = ${id}::uuid limit 1 for update`
      return row?.view === VIEW_PENDING && row.original === originalId
    },
    insertObject: (row) => insertStoredObject(db, row),
    async markReady(id, previewId) {
      await db.documentos_apoyo.updateMany({ where: { documento_apoyo_id: id }, data: { archivo_vista_id: previewId, estado_vista: VIEW_READY } })
    },
  }
}

export function createSupportDocumentViewStore(prisma: PrismaService): SupportDocumentViewStore {
  return {
    async pending(id) {
      const row = await prisma.documentos_apoyo.findFirst({
        where: { documento_apoyo_id: id },
        select: {
          estado_vista: true,
          archivo_id: true,
          archivos_documentos_apoyo_archivo_idToarchivos: { select: { disco: true, ruta_archivo: true, nombre_archivo: true, subido_por: true } },
        },
      })
      if (!row || row.estado_vista !== VIEW_PENDING) return null
      const original = row.archivos_documentos_apoyo_archivo_idToarchivos
      return { objectId: row.archivo_id, disk: original.disco, path: original.ruta_archivo, name: original.nombre_archivo, ownerId: original.subido_por }
    },
    async markWithoutView(id, originalId) {
      await prisma.documentos_apoyo.updateMany({ where: { documento_apoyo_id: id, estado_vista: VIEW_PENDING, ...(originalId === undefined ? {} : { archivo_id: originalId }) }, data: { estado_vista: VIEW_NONE } })
    },
    transaction: (work) => inTransaction(prisma, (tx) => work(viewTx(tx))),
  }
}
