import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../../prisma/prisma.service"
import type { SupportDocumentRecord, SupportDocumentRepository } from "../../../server/academic/supportDocuments"
import type { ReadableDocument, StoredObjectInput, SupportDocumentTx, SupportDocumentWriteStore } from "../../../server/academic/supportDocumentWrites"
import { withAfterCommit } from "../../../server/queue/dispatch"
import type { Prisma } from "../../../generated/prisma/client"
import { TRANSACTION_OPTIONS } from "../../../prisma/db"
import { AcademicStructurePrismaRepository } from "./academic-structure.repository"
import { epochDate } from "./prisma-values"

type Runner = Prisma.TransactionClient

type DocumentRow = { id: string; title: string; size: string; view: string; uploaded_at: string }

export async function insertStoredObject(runner: Runner, row: StoredObjectInput): Promise<void> {
  await runner.archivos.create({
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
      almacenado_en: epochDate(row.storedAt),
    },
  })
}

function writeTx(runner: Runner): SupportDocumentTx {
  return {
    insertObject: (row) => insertStoredObject(runner, row),
    async insertDocument(row) {
      await runner.documentos_apoyo.create({
        data: {
          documento_apoyo_id: row.id,
          carrera_id: row.careerId,
          titulo_documento: row.title,
          archivo_id: row.objectId,
          archivo_vista_id: row.previewId,
          estado_vista: row.view,
          subido_por: row.uploadedBy,
          subido_en: epochDate(row.uploadedAt),
        },
      })
    },
    async lockDocument(id) {
      const [row] = await runner.$queryRaw<{ id: string; careerId: string; objectId: string; previewId: string | null }[]>`select documento_apoyo_id::text as "id",
          carrera_id::text as "careerId", archivo_id::text as "objectId", archivo_vista_id::text as "previewId"
        from documentos_apoyo where documento_apoyo_id = ${id}::uuid limit 1 for update`
      return row ?? null
    },
    async objects(ids) {
      if (ids.length === 0) return []
      const rows = await runner.archivos.findMany({ where: { archivo_id: { in: ids } }, select: { disco: true, ruta_archivo: true } })
      return rows.map((row) => ({ disk: row.disco, path: row.ruta_archivo }))
    },
    async deleteDocument(id) {
      await runner.documentos_apoyo.deleteMany({ where: { documento_apoyo_id: id } })
    },
    async deleteObjects(ids) {
      if (ids.length > 0) await runner.archivos.deleteMany({ where: { archivo_id: { in: ids } } })
    },
  }
}

@Injectable()
export class SupportDocumentsPrismaRepository implements SupportDocumentRepository, SupportDocumentWriteStore {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AcademicStructurePrismaRepository) private readonly structure: AcademicStructurePrismaRepository,
  ) {}

  async careerActive(careerId: string): Promise<boolean> {
    return (await this.structure.activeCareer(careerId)) !== null
  }

  async forCareer(careerId: string): Promise<SupportDocumentRecord[]> {
    const found = await this.prisma.$queryRaw<DocumentRow[]>`select documento.documento_apoyo_id::text as id, documento.titulo_documento as title,
        archivo.tamano_bytes::text as size, documento.estado_vista as view,
        to_char(documento.subido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') as uploaded_at
      from documentos_apoyo documento
      inner join archivos archivo on archivo.archivo_id = documento.archivo_id
      where documento.carrera_id = ${careerId}::uuid
      order by documento.subido_en desc, documento.titulo_documento asc`
    return found.map((row) => ({ id: row.id, title: row.title, size: Number(row.size), view: row.view, uploadedAt: row.uploaded_at }))
  }

  async documentCareer(id: string): Promise<string | null> {
    const row = await this.prisma.documentos_apoyo.findFirst({ where: { documento_apoyo_id: id }, select: { carrera_id: true } })
    return row?.carrera_id ?? null
  }

  async readable(id: string): Promise<ReadableDocument | null> {
    const row = await this.prisma.documentos_apoyo.findFirst({
      where: { documento_apoyo_id: id },
      select: {
        documento_apoyo_id: true,
        carrera_id: true,
        titulo_documento: true,
        estado_vista: true,
        archivos_documentos_apoyo_archivo_vista_idToarchivos: { select: { disco: true, ruta_archivo: true } },
      },
    })
    if (!row) return null
    const preview = row.archivos_documentos_apoyo_archivo_vista_idToarchivos
    return { id: row.documento_apoyo_id, careerId: row.carrera_id, title: row.titulo_documento, view: row.estado_vista, preview: preview ? { disk: preview.disco, path: preview.ruta_archivo } : null }
  }

  transaction<T>(work: (tx: SupportDocumentTx, afterCommit: (callback: () => unknown) => void) => Promise<T>): Promise<T> {
    return withAfterCommit((afterCommit) => this.prisma.$transaction((runner) => work(writeTx(runner), afterCommit), TRANSACTION_OPTIONS))
  }
}
