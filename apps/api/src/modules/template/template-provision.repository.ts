import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { allowAiReadingOn, retainAiPermissionsOn } from "../../server/ai/readPermissionStore"
import { phpShape, type PhpRecord } from "../../server/configuration/phpValues"
import type { ProvisionStore, ProvisionTx } from "../../server/configuration/templateProvisioner"
import { type Db, TRANSACTION_OPTIONS } from "../../prisma/db"
import { hasRows, jsonbValue } from "../../prisma/sql"
import { structureStoreOn, structureTxOn } from "./template-structure.repository"

export function provisionTxOn(db: Db): ProvisionTx {
  const structure = structureTxOn(db)
  const created = new Set<string>()
  return {
    anyTemplate: () => hasRows(db.$queryRaw<{ id: string }[]>`select plantilla_id::text as id from plantilla_silabo limit 1 for update`),
    lockTemplate: (templateId) => structure.lockTemplate(templateId),
    async insertTemplate(templateId, definition) {
      await db.$executeRaw`insert into plantilla_silabo (plantilla_id, definicion_plantilla) values (${templateId}::uuid, ${jsonbValue(JSON.stringify(phpShape(definition)))})`
      created.add(templateId)
    },
    createdHere: (templateId) => created.has(templateId),
    allowAiReading: (templateId, keys) => allowAiReadingOn(db, templateId, keys),
    retainAiPermissions: (templateId, keys) => retainAiPermissionsOn(db, templateId, keys),
    async hasStructure(templateId) {
      return (
        (await hasRows(db.secciones_plantilla.findMany({ where: { plantilla_id: templateId, vigente_en_plantilla: true }, select: { seccion_plantilla_id: true }, take: 1 }))) &&
        (await hasRows(
          db.campos_plantilla.findMany({
            where: { plantilla_id: templateId, vigente_en_plantilla: true, secciones_plantilla: { vigente_en_plantilla: true } },
            select: { campo_plantilla_id: true },
            take: 1,
          }),
        )) &&
        (await hasRows(db.definiciones_campo.findMany({ where: { plantilla_id: templateId, vigente_en_plantilla: true }, select: { definicion_campo_id: true }, take: 1 })))
      )
    },
    syncDocument: (templateId, sections) => structure.syncDocument(templateId, sections),
    async suffixRetiredSections(templateId) {
      await db.$executeRaw`
        update secciones_plantilla
        set clave_seccion_plantilla = clave_seccion_plantilla || ('-' || substr(seccion_plantilla_id::text, 1, 8))
        where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = false
          and right(clave_seccion_plantilla, 9) <> ('-' || substr(seccion_plantilla_id::text, 1, 8))`
    },
    insertField: (field) => structure.insertField({ ...field, content: phpShape(field.content) as PhpRecord }),
    async saveDefinition(templateId, definition) {
      await db.$executeRaw`update plantilla_silabo set definicion_plantilla = ${jsonbValue(JSON.stringify(phpShape(definition)))} where plantilla_id = ${templateId}::uuid`
    },
    async coordinationFields(templateId) {
      const found = await db.definiciones_campo.findMany({
        where: {
          plantilla_id: templateId,
          vigente_en_plantilla: true,
          quien_llena_definicion_campo: { not: "institucional" },
          campos_plantilla: { vigente_en_plantilla: true },
        },
        select: { definicion_campo_id: true, campos_plantilla: { select: { clave_campo_plantilla: true } } },
      })
      return new Map(found.map((row) => [row.campos_plantilla.clave_campo_plantilla, row.definicion_campo_id]))
    },
    async moveSubjectValues(from, to) {
      await db.valores_campo.updateMany({ where: { definicion_campo_id: from, asignatura_id: { not: null } }, data: { definicion_campo_id: to } })
    },
  }
}

export function provisionStoreOn(db: Db, transaction: <T>(work: (tx: ProvisionTx) => Promise<T>) => Promise<T>): ProvisionStore {
  const structure = structureStoreOn(db, async () => {
    throw new Error("unused")
  })
  return { templateLocked: () => structure.templateLocked(), transaction }
}

@Injectable()
export class TemplateProvisionRepository {
  readonly store: ProvisionStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = provisionStoreOn(prisma, (work) => prisma.$transaction((tx) => work(provisionTxOn(tx)), TRANSACTION_OPTIONS))
  }
}
