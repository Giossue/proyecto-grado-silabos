import { Inject, Injectable } from "@nestjs/common"
import type { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { retainAiPermissionsOn } from "../../server/ai/readPermissionStore"
import { phpJsonDecode } from "../../server/configuration/phpValues"
import type { DocumentSection, FieldRecord, StructureStore, StructureTx } from "../../server/configuration/templateStructure"
import { type Db, TRANSACTION_OPTIONS } from "../../prisma/db"
import { hasRows } from "../../prisma/sql"
import { loadTemplate } from "../../server/shared/templateStore"

type FieldRow = { id: string; templateId: string; blockId: string; responsible: string; content: string | null; key: string | null; label: string | null }

const position = (value: number, index: number) => (Number.isFinite(value) ? Math.trunc(value) : index + 1)

export async function syncDocumentOn(db: Db, templateId: string, sections: DocumentSection[]): Promise<void> {
  const sectionIds = sections.map((section) => section.id)
  const blockIds = sections.flatMap((section) => section.blocks.map((block) => block.id))
  const retired = (
    await db.campos_plantilla.findMany({ where: { plantilla_id: templateId, campo_plantilla_id: { notIn: blockIds } }, select: { campo_plantilla_id: true } })
  ).map((row) => row.campo_plantilla_id)
  await db.definiciones_campo.updateMany({ where: { campo_plantilla_id: { in: retired } }, data: { vigente_en_plantilla: false } })
  await db.campos_plantilla.updateMany({ where: { campo_plantilla_id: { in: retired } }, data: { vigente_en_plantilla: false } })
  await db.secciones_plantilla.updateMany({ where: { plantilla_id: templateId, seccion_plantilla_id: { notIn: sectionIds } }, data: { vigente_en_plantilla: false } })
  await db.definiciones_campo.deleteMany({ where: { plantilla_id: templateId, vigente_en_plantilla: false, valores_campo: { none: {} } } })
  await db.campos_plantilla.deleteMany({
    where: { plantilla_id: templateId, vigente_en_plantilla: false, definiciones_campo: { none: {} } },
  })
  await db.secciones_plantilla.deleteMany({
    where: { plantilla_id: templateId, vigente_en_plantilla: false, campos_plantilla: { none: {} } },
  })
  for (const [sectionIndex, section] of sections.entries()) {
    const values = {
      plantilla_id: templateId,
      clave_seccion_plantilla: section.key,
      titulo_seccion_plantilla: section.title ?? "",
      orientacion_seccion_plantilla: section.orientation ?? "portrait",
      posicion_seccion_plantilla: position(section.position, sectionIndex),
    }
    const existing = await db.secciones_plantilla.findFirst({ where: { seccion_plantilla_id: section.id }, select: { seccion_plantilla_id: true } })
    if (existing) await db.secciones_plantilla.updateMany({ where: { seccion_plantilla_id: section.id }, data: values })
    else await db.secciones_plantilla.create({ data: { seccion_plantilla_id: section.id, ...values } })
    for (const [blockIndex, block] of section.blocks.entries()) {
      const blockValues = {
        seccion_plantilla_id: section.id,
        plantilla_id: templateId,
        clave_campo_plantilla: block.key,
        titulo_campo_plantilla: block.title ?? "",
        posicion_campo_plantilla: position(block.position, blockIndex),
      }
      const existingBlock = await db.campos_plantilla.findFirst({ where: { campo_plantilla_id: block.id }, select: { campo_plantilla_id: true } })
      if (existingBlock) await db.campos_plantilla.updateMany({ where: { campo_plantilla_id: block.id }, data: blockValues })
      else await db.campos_plantilla.create({ data: { campo_plantilla_id: block.id, ...blockValues } })
    }
  }
}

export function structureTxOn(db: Db): StructureTx {
  return {
    async lockTemplate(templateId) {
      const found = await hasRows(db.$queryRaw<{ id: string }[]>`select plantilla_id::text as id from plantilla_silabo where plantilla_id = ${templateId}::uuid limit 1 for update`)
      return found ? loadTemplate(db) : null
    },
    reload: () => loadTemplate(db),
    syncDocument: (templateId, sections) => syncDocumentOn(db, templateId, sections),
    async insertField(field) {
      await db.definiciones_campo.create({
        data: {
          plantilla_id: field.templateId,
          campo_plantilla_id: field.blockId,
          quien_llena_definicion_campo: field.responsible,
          contenido_definicion_campo: field.content as Prisma.InputJsonValue,
          definicion_campo_id: field.id,
        },
      })
    },
    async updateField(id, changes) {
      const values: Prisma.definiciones_campoUncheckedUpdateManyInput = {}
      if (changes.responsible !== undefined) values.quien_llena_definicion_campo = changes.responsible
      if (changes.content !== undefined) values.contenido_definicion_campo = changes.content as Prisma.InputJsonValue
      if (Object.keys(values).length === 0) return
      await db.definiciones_campo.updateMany({ where: { definicion_campo_id: id }, data: values })
    },
    retainAiPermissions: (templateId, keys) => retainAiPermissionsOn(db, templateId, keys),
  }
}

export function structureStoreOn(db: Db, transaction: <T>(work: (tx: StructureTx) => Promise<T>) => Promise<T>): StructureStore {
  return {
    templateLocked: () => hasRows(db.convocatorias_universidad.findMany({ where: { estado_convocatoria_universidad: "abierto" }, select: { convocatoria_universidad_id: true }, take: 1 })),
    async field(id) {
      const [row] = await db.$queryRaw<FieldRow[]>`
        select d.definicion_campo_id::text as id, d.plantilla_id::text as "templateId", d.campo_plantilla_id::text as "blockId",
          d.quien_llena_definicion_campo as responsible, d.contenido_definicion_campo::text as content,
          c.clave_campo_plantilla as key, c.titulo_campo_plantilla as label
        from definiciones_campo d
        left join campos_plantilla c on c.campo_plantilla_id = d.campo_plantilla_id
        where d.definicion_campo_id = ${id}::uuid
        limit 1`
      if (!row) return null
      const record: FieldRecord = { ...row, content: phpJsonDecode(row.content), key: row.key ?? "", label: row.label ?? "" }
      return record
    },
    async liveKeyTaken(templateId, key) {
      const total = await db.campos_plantilla.count({ where: { clave_campo_plantilla: key, plantilla_id: templateId, vigente_en_plantilla: true } })
      return total > 0
    },
    async liveFieldBlocks(templateId, fieldIds) {
      if (fieldIds.length === 0) return new Map()
      const found = await db.definiciones_campo.findMany({
        where: { plantilla_id: templateId, definicion_campo_id: { in: fieldIds }, vigente_en_plantilla: true },
        select: { definicion_campo_id: true, campo_plantilla_id: true },
      })
      return new Map(found.map((row) => [row.definicion_campo_id, row.campo_plantilla_id]))
    },
    transaction,
  }
}

@Injectable()
export class TemplateStructureRepository {
  readonly store: StructureStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = structureStoreOn(prisma, (work) => prisma.$transaction((tx) => work(structureTxOn(tx)), TRANSACTION_OPTIONS))
  }
}
