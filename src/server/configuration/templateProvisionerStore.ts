import "server-only"
import { and, eq, isNotNull, ne, sql } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { hasRows, jsonbValue } from "@/db/expressions"
import { camposPlantilla, definicionesCampo, plantillaSilabo, seccionesPlantilla, valoresCampo } from "@/db/schema"
import { phpJsonEncode } from "../http/phpJson"
import { randomUUID } from "node:crypto"
import { uuid7 } from "../http/uuid7"
import { officialDefinition, officialSections } from "./officialTemplate"
import { phpShape, type PhpRecord } from "./phpValues"
import { buildStructure, defaultProvisionDeps, type ProvisionDeps, type ProvisionStore, type ProvisionTx } from "./templateProvisioner"
import { structureStoreOn, structureTx } from "./templateStructureStore"

const coordinationJoin = eq(camposPlantilla.campoPlantillaId, definicionesCampo.campoPlantillaId)

export function provisionTx(executor: Executor): ProvisionTx {
  const structure = structureTx(executor)
  return {
    anyTemplate: () => hasRows(executor.select({ id: plantillaSilabo.plantillaId }).from(plantillaSilabo).limit(1).for("update")),
    lockTemplate: (templateId) => structure.lockTemplate(templateId),
    async insertTemplate(templateId, definition) {
      await executor.insert(plantillaSilabo).values({ definicionPlantilla: jsonbValue(phpJsonEncode(phpShape(definition))), plantillaId: templateId })
    },
    async hasStructure(templateId) {
      return (
        (await hasRows(
          executor
            .select({ id: seccionesPlantilla.seccionPlantillaId })
            .from(seccionesPlantilla)
            .where(and(eq(seccionesPlantilla.plantillaId, templateId), eq(seccionesPlantilla.vigenteEnPlantilla, true)))
            .limit(1),
        )) &&
        (await hasRows(
          executor
            .select({ id: camposPlantilla.campoPlantillaId })
            .from(camposPlantilla)
            .innerJoin(seccionesPlantilla, eq(seccionesPlantilla.seccionPlantillaId, camposPlantilla.seccionPlantillaId))
            .where(and(eq(camposPlantilla.plantillaId, templateId), eq(camposPlantilla.vigenteEnPlantilla, true), eq(seccionesPlantilla.vigenteEnPlantilla, true)))
            .limit(1),
        )) &&
        (await hasRows(
          executor
            .select({ id: definicionesCampo.definicionCampoId })
            .from(definicionesCampo)
            .where(and(eq(definicionesCampo.plantillaId, templateId), eq(definicionesCampo.vigenteEnPlantilla, true)))
            .limit(1),
        ))
      )
    },
    syncDocument: (templateId, sections) => structure.syncDocument(templateId, sections),
    async suffixRetiredSections(templateId) {
      const suffix = sql`'-' || substr(${seccionesPlantilla.seccionPlantillaId}::text, 1, 8)`
      await executor
        .update(seccionesPlantilla)
        .set({ claveSeccionPlantilla: sql`${seccionesPlantilla.claveSeccionPlantilla} || ${suffix}` })
        .where(
          and(
            eq(seccionesPlantilla.plantillaId, templateId),
            eq(seccionesPlantilla.vigenteEnPlantilla, false),
            sql`right(${seccionesPlantilla.claveSeccionPlantilla}, 9) <> ${suffix}`,
          ),
        )
    },
    insertField: (field) => structure.insertField({ ...field, content: phpShape(field.content) as PhpRecord }),
    async saveDefinition(templateId, definition) {
      await executor
        .update(plantillaSilabo)
        .set({ definicionPlantilla: jsonbValue(phpJsonEncode(phpShape(definition))) })
        .where(eq(plantillaSilabo.plantillaId, templateId))
    },
    async coordinationFields(templateId) {
      const found = await executor
        .select({ key: camposPlantilla.claveCampoPlantilla, id: definicionesCampo.definicionCampoId })
        .from(definicionesCampo)
        .innerJoin(camposPlantilla, coordinationJoin)
        .where(
          and(
            eq(definicionesCampo.plantillaId, templateId),
            eq(definicionesCampo.vigenteEnPlantilla, true),
            eq(camposPlantilla.vigenteEnPlantilla, true),
            ne(definicionesCampo.quienLlenaDefinicionCampo, "institucional"),
          ),
        )
      return new Map(found.map((row) => [row.key, row.id]))
    },
    async moveSubjectValues(from, to) {
      await executor
        .update(valoresCampo)
        .set({ definicionCampoId: to })
        .where(and(eq(valoresCampo.definicionCampoId, from), isNotNull(valoresCampo.asignaturaId)))
    },
  }
}

export function provisionStoreOn(executor: Executor, transaction: <T>(work: (executor: Executor) => Promise<T>) => Promise<T>): ProvisionStore {
  const structure = structureStoreOn(executor, async () => {
    throw new Error("unused")
  })
  return {
    templateLocked: () => structure.templateLocked(),
    transaction: (work) => transaction((inner) => work(provisionTx(inner))),
  }
}

export function createProvisionDeps(): ProvisionDeps {
  return defaultProvisionDeps(provisionStoreOn(db, (work) => db.transaction((tx) => work(tx))))
}

export async function provisionOfficialTemplate(tx: ProvisionTx, ids = { template: uuid7, block: randomUUID, field: uuid7 }): Promise<string | null> {
  if (await tx.anyTemplate()) return null
  const templateId = ids.template()
  const definition = officialDefinition()
  await tx.insertTemplate(templateId, definition)
  await tx.syncDocument(templateId, [])
  await buildStructure(tx, { newBlockId: ids.block, newFieldId: ids.field } as ProvisionDeps, templateId, officialSections(), definition)
  return templateId
}
