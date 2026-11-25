import { and, asc, eq, inArray, ne } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { jsonText } from "@/db/expressions"
import { camposPlantilla, definicionesCampo, plantillaSilabo, seccionesPlantilla, valoresCampo } from "@/db/schema"
import { isRecord, phpCount, phpJsonDecode } from "./phpValues"
import { officialDefinition } from "./officialTemplate"
import { trustedDefinition } from "./templateRuntime"
import type { SyllabusTemplate, TemplateBlock, TemplateField, TemplateSection } from "./templatePresentation"

export type StoredValue = { fieldId: string; subjectId: string | null; value: unknown }
export type LiveField = { id: string; responsible: string; content: unknown }

export interface TemplateStore {
  template(): Promise<SyllabusTemplate | null>
  subjectValues(subjectId: string): Promise<StoredValue[]>
  valuesForSubjects(subjectIds: string[], fieldIds: string[]): Promise<StoredValue[]>
  liveFields(ids: string[], careerOnly: boolean): Promise<LiveField[]>
}

export async function loadTemplate(executor: Executor, lock = false): Promise<SyllabusTemplate | null> {
  const query = executor
    .select({ id: plantillaSilabo.plantillaId, modifiedAt: plantillaSilabo.plantillaModificadaEn, definition: jsonText(plantillaSilabo.definicionPlantilla) })
    .from(plantillaSilabo)
    .limit(1)
  const [row] = await (lock ? query.for("update") : query)
  if (!row) return null
  const decoded = phpJsonDecode(row.definition)
  const definition = isRecord(decoded) && phpCount(decoded) > 0 ? trustedDefinition(decoded) : officialDefinition()
  const sections = await executor
    .select({
      id: seccionesPlantilla.seccionPlantillaId,
      clave: seccionesPlantilla.claveSeccionPlantilla,
      titulo: seccionesPlantilla.tituloSeccionPlantilla,
      orientacion: seccionesPlantilla.orientacionSeccionPlantilla,
      posicion: seccionesPlantilla.posicionSeccionPlantilla,
    })
    .from(seccionesPlantilla)
    .where(and(eq(seccionesPlantilla.plantillaId, row.id), eq(seccionesPlantilla.vigenteEnPlantilla, true)))
    .orderBy(asc(seccionesPlantilla.posicionSeccionPlantilla), asc(seccionesPlantilla.claveSeccionPlantilla))
  const blocks = await executor
    .select({
      id: camposPlantilla.campoPlantillaId,
      section_id: camposPlantilla.seccionPlantillaId,
      clave: camposPlantilla.claveCampoPlantilla,
      titulo: camposPlantilla.tituloCampoPlantilla,
      posicion: camposPlantilla.posicionCampoPlantilla,
    })
    .from(camposPlantilla)
    .where(and(eq(camposPlantilla.plantillaId, row.id), eq(camposPlantilla.vigenteEnPlantilla, true)))
    .orderBy(asc(camposPlantilla.posicionCampoPlantilla), asc(camposPlantilla.claveCampoPlantilla))
  const fields = await executor
    .select({
      id: definicionesCampo.definicionCampoId,
      block_id: definicionesCampo.campoPlantillaId,
      quien_llena: definicionesCampo.quienLlenaDefinicionCampo,
      contenido: jsonText(definicionesCampo.contenidoDefinicionCampo),
      clave: camposPlantilla.claveCampoPlantilla,
      titulo: camposPlantilla.tituloCampoPlantilla,
    })
    .from(definicionesCampo)
    .leftJoin(camposPlantilla, eq(camposPlantilla.campoPlantillaId, definicionesCampo.campoPlantillaId))
    .where(and(eq(definicionesCampo.plantillaId, row.id), eq(definicionesCampo.vigenteEnPlantilla, true)))
  const fieldsByBlock = new Map<string, TemplateField[]>()
  for (const field of fields) {
    const list = fieldsByBlock.get(field.block_id) ?? []
    list.push({
      id: field.id,
      blockId: field.block_id,
      key: field.clave ?? "",
      label: field.titulo ?? "",
      responsible: field.quien_llena,
      content: phpJsonDecode(field.contenido),
    })
    fieldsByBlock.set(field.block_id, list)
  }
  const blocksBySection = new Map<string, TemplateBlock[]>()
  for (const block of blocks) {
    const list = blocksBySection.get(block.section_id) ?? []
    list.push({ id: block.id, key: block.clave, title: block.titulo, position: Number(block.posicion), fields: fieldsByBlock.get(block.id) ?? [] })
    blocksBySection.set(block.section_id, list)
  }
  const presented: TemplateSection[] = sections.map((section) => ({
    id: section.id,
    key: section.clave,
    title: section.titulo,
    orientation: section.orientacion ?? "portrait",
    position: Number(section.posicion),
    blocks: blocksBySection.get(section.id) ?? [],
  }))
  return { id: row.id, modifiedAt: row.modifiedAt, definition, sections: presented }
}

const VALUE = { fieldId: valoresCampo.definicionCampoId, subjectId: valoresCampo.asignaturaId, value: jsonText(valoresCampo.valorCampo) }

function toValue(row: { fieldId: string; subjectId: string | null; value: string | null }): StoredValue {
  return { ...row, value: phpJsonDecode(row.value) }
}

export function createTemplateStore(executor: Executor = db): TemplateStore {
  return {
    template: () => loadTemplate(executor),
    async subjectValues(subjectId) {
      const found = await executor.select(VALUE).from(valoresCampo).where(eq(valoresCampo.asignaturaId, subjectId))
      return found.map(toValue)
    },
    async valuesForSubjects(subjectIds, fieldIds) {
      if (subjectIds.length === 0 || fieldIds.length === 0) return []
      const found = await executor
        .select(VALUE)
        .from(valoresCampo)
        .where(and(inArray(valoresCampo.asignaturaId, subjectIds), inArray(valoresCampo.definicionCampoId, fieldIds)))
      return found.map(toValue)
    },
    async liveFields(ids, careerOnly) {
      if (ids.length === 0) return []
      const found = await executor
        .select({ id: definicionesCampo.definicionCampoId, responsible: definicionesCampo.quienLlenaDefinicionCampo, content: jsonText(definicionesCampo.contenidoDefinicionCampo) })
        .from(definicionesCampo)
        .where(
          and(
            inArray(definicionesCampo.definicionCampoId, [...new Set(ids)]),
            eq(definicionesCampo.vigenteEnPlantilla, true),
            careerOnly ? ne(definicionesCampo.quienLlenaDefinicionCampo, "institucional") : undefined,
          ),
        )
      return found.map((row) => ({ ...row, content: phpJsonDecode(row.content) }))
    },
  }
}
