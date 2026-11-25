import { and, eq, inArray, notExists, notInArray } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { hasRows, jsonbValue, jsonText } from "@/db/expressions"
import { camposPlantilla, convocatoriasUniversidad, definicionesCampo, plantillaSilabo, seccionesPlantilla, valoresCampo } from "@/db/schema"
import { phpJsonDecode } from "./phpValues"
import type { DocumentSection, FieldRecord, StructureStore, StructureTx } from "./templateStructure"
import { loadTemplate } from "./templateStore"

export async function syncDocument(executor: Executor, templateId: string, sections: DocumentSection[]): Promise<void> {
  const sectionIds = sections.map((section) => section.id)
  const blockIds = sections.flatMap((section) => section.blocks.map((block) => block.id))
  const retired = (
    await executor
      .select({ id: camposPlantilla.campoPlantillaId })
      .from(camposPlantilla)
      .where(and(eq(camposPlantilla.plantillaId, templateId), notInArray(camposPlantilla.campoPlantillaId, blockIds)))
  ).map((row) => row.id)
  await executor.update(definicionesCampo).set({ vigenteEnPlantilla: false }).where(inArray(definicionesCampo.campoPlantillaId, retired))
  await executor.update(camposPlantilla).set({ vigenteEnPlantilla: false }).where(inArray(camposPlantilla.campoPlantillaId, retired))
  await executor
    .update(seccionesPlantilla)
    .set({ vigenteEnPlantilla: false })
    .where(and(eq(seccionesPlantilla.plantillaId, templateId), notInArray(seccionesPlantilla.seccionPlantillaId, sectionIds)))
  await executor
    .delete(definicionesCampo)
    .where(
      and(
        eq(definicionesCampo.plantillaId, templateId),
        eq(definicionesCampo.vigenteEnPlantilla, false),
        notExists(executor.select({ id: valoresCampo.valorCampoId }).from(valoresCampo).where(eq(valoresCampo.definicionCampoId, definicionesCampo.definicionCampoId))),
      ),
    )
  await executor
    .delete(camposPlantilla)
    .where(
      and(
        eq(camposPlantilla.plantillaId, templateId),
        eq(camposPlantilla.vigenteEnPlantilla, false),
        notExists(
          executor.select({ id: definicionesCampo.definicionCampoId }).from(definicionesCampo).where(eq(definicionesCampo.campoPlantillaId, camposPlantilla.campoPlantillaId)),
        ),
      ),
    )
  await executor
    .delete(seccionesPlantilla)
    .where(
      and(
        eq(seccionesPlantilla.plantillaId, templateId),
        eq(seccionesPlantilla.vigenteEnPlantilla, false),
        notExists(
          executor.select({ id: camposPlantilla.campoPlantillaId }).from(camposPlantilla).where(eq(camposPlantilla.seccionPlantillaId, seccionesPlantilla.seccionPlantillaId)),
        ),
      ),
    )
  for (const [sectionIndex, section] of sections.entries()) {
    const values = {
      plantillaId: templateId,
      claveSeccionPlantilla: section.key,
      tituloSeccionPlantilla: section.title ?? "",
      orientacionSeccionPlantilla: section.orientation ?? "portrait",
      posicionSeccionPlantilla: Number.isFinite(section.position) ? Math.trunc(section.position) : sectionIndex + 1,
    }
    const existing = eq(seccionesPlantilla.seccionPlantillaId, section.id)
    if (await hasRows(executor.select({ id: seccionesPlantilla.seccionPlantillaId }).from(seccionesPlantilla).where(existing).limit(1))) {
      await executor.update(seccionesPlantilla).set(values).where(existing)
    } else {
      await executor.insert(seccionesPlantilla).values({ seccionPlantillaId: section.id, ...values })
    }
    for (const [blockIndex, block] of section.blocks.entries()) {
      const blockValues = {
        seccionPlantillaId: section.id,
        plantillaId: templateId,
        claveCampoPlantilla: block.key,
        tituloCampoPlantilla: block.title ?? "",
        posicionCampoPlantilla: Number.isFinite(block.position) ? Math.trunc(block.position) : blockIndex + 1,
      }
      const existingBlock = eq(camposPlantilla.campoPlantillaId, block.id)
      if (await hasRows(executor.select({ id: camposPlantilla.campoPlantillaId }).from(camposPlantilla).where(existingBlock).limit(1))) {
        await executor.update(camposPlantilla).set(blockValues).where(existingBlock)
      } else {
        await executor.insert(camposPlantilla).values({ campoPlantillaId: block.id, ...blockValues })
      }
    }
  }
}

export function structureTx(executor: Executor): StructureTx {
  return {
    async lockTemplate(templateId) {
      const [row] = await executor
        .select({ id: plantillaSilabo.plantillaId })
        .from(plantillaSilabo)
        .where(eq(plantillaSilabo.plantillaId, templateId))
        .limit(1)
        .for("update")
      return row ? loadTemplate(executor) : null
    },
    reload: () => loadTemplate(executor),
    syncDocument: (templateId, sections) => syncDocument(executor, templateId, sections),
    async insertField(field) {
      await executor.insert(definicionesCampo).values({
        plantillaId: field.templateId,
        campoPlantillaId: field.blockId,
        quienLlenaDefinicionCampo: field.responsible,
        contenidoDefinicionCampo: jsonbValue(JSON.stringify(field.content)),
        definicionCampoId: field.id,
      })
    },
    async updateField(id, changes) {
      const values: Partial<typeof definicionesCampo.$inferInsert> = {}
      if (changes.responsible !== undefined) values.quienLlenaDefinicionCampo = changes.responsible
      if (changes.content !== undefined) values.contenidoDefinicionCampo = jsonbValue(JSON.stringify(changes.content))
      if (Object.keys(values).length === 0) return
      await executor.update(definicionesCampo).set(values).where(eq(definicionesCampo.definicionCampoId, id))
    },
  }
}

export function structureStoreOn(executor: Executor, transaction: <T>(work: (tx: StructureTx) => Promise<T>) => Promise<T>): StructureStore {
  return {
    templateLocked: () =>
      hasRows(
        executor
          .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
          .from(convocatoriasUniversidad)
          .where(eq(convocatoriasUniversidad.estadoConvocatoriaUniversidad, "abierto"))
          .limit(1),
      ),
    async field(id) {
      const [row] = await executor
        .select({
          id: definicionesCampo.definicionCampoId,
          templateId: definicionesCampo.plantillaId,
          blockId: definicionesCampo.campoPlantillaId,
          responsible: definicionesCampo.quienLlenaDefinicionCampo,
          content: jsonText(definicionesCampo.contenidoDefinicionCampo),
          key: camposPlantilla.claveCampoPlantilla,
          label: camposPlantilla.tituloCampoPlantilla,
        })
        .from(definicionesCampo)
        .leftJoin(camposPlantilla, eq(camposPlantilla.campoPlantillaId, definicionesCampo.campoPlantillaId))
        .where(eq(definicionesCampo.definicionCampoId, id))
        .limit(1)
      if (!row) return null
      const record: FieldRecord = { ...row, content: phpJsonDecode(row.content), key: row.key ?? "", label: row.label ?? "" }
      return record
    },
    async liveKeyTaken(templateId, key) {
      const total = await executor.$count(
        camposPlantilla,
        and(eq(camposPlantilla.claveCampoPlantilla, key), eq(camposPlantilla.plantillaId, templateId), eq(camposPlantilla.vigenteEnPlantilla, true)),
      )
      return total > 0
    },
    async liveFieldBlocks(templateId, fieldIds) {
      if (fieldIds.length === 0) return new Map()
      const found = await executor
        .select({ id: definicionesCampo.definicionCampoId, blockId: definicionesCampo.campoPlantillaId })
        .from(definicionesCampo)
        .where(and(eq(definicionesCampo.plantillaId, templateId), inArray(definicionesCampo.definicionCampoId, fieldIds), eq(definicionesCampo.vigenteEnPlantilla, true)))
      return new Map(found.map((row) => [row.id, row.blockId]))
    },
    transaction,
  }
}

export function createStructureStore(): StructureStore {
  return structureStoreOn(db, (work) => db.transaction((tx) => work(structureTx(tx))))
}
