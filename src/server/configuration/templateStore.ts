import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { isRecord, phpCount, phpJsonDecode } from "./phpValues"
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

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

async function rows<T>(executor: Executor, query: SQL): Promise<T[]> {
  return (await executor.execute(query)).rows as T[]
}

function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

type TemplateRow = { id: string; modified_at: string | null; definition: string | null }
type SectionRow = { id: string; clave: string; titulo: string; orientacion: string | null; posicion: number }
type BlockRow = SectionRow & { section_id: string }
type FieldRow = { id: string; block_id: string; quien_llena: string; contenido: string; clave: string | null; titulo: string | null }

export async function loadTemplate(executor: Executor, lock = false): Promise<SyllabusTemplate | null> {
  const [row] = await rows<TemplateRow>(
    executor,
    sql`select plantilla_id::text as id, plantilla_modificada_en::text as modified_at, definicion_plantilla::text as definition
      from plantilla_silabo limit 1 ${lock ? sql`for update` : sql``}`,
  )
  if (!row) return null
  const decoded = phpJsonDecode(row.definition)
  const definition = isRecord(decoded) && phpCount(decoded) > 0 ? trustedDefinition(decoded) : null
  const sections = await rows<SectionRow>(
    executor,
    sql`select seccion_plantilla_id::text as id, clave_seccion_plantilla as clave, titulo_seccion_plantilla as titulo,
        orientacion_seccion_plantilla as orientacion, posicion_seccion_plantilla as posicion
      from secciones_plantilla where plantilla_id = ${row.id}::uuid and vigente_en_plantilla = true
      order by posicion_seccion_plantilla asc, clave_seccion_plantilla asc`,
  )
  const blocks = await rows<BlockRow>(
    executor,
    sql`select campo_plantilla_id::text as id, seccion_plantilla_id::text as section_id, clave_campo_plantilla as clave,
        titulo_campo_plantilla as titulo, posicion_campo_plantilla as posicion
      from campos_plantilla where plantilla_id = ${row.id}::uuid and vigente_en_plantilla = true
      order by posicion_campo_plantilla asc, clave_campo_plantilla asc`,
  )
  const fields = await rows<FieldRow>(
    executor,
    sql`select definiciones_campo.definicion_campo_id::text as id, definiciones_campo.campo_plantilla_id::text as block_id,
        definiciones_campo.quien_llena_definicion_campo as quien_llena, definiciones_campo.contenido_definicion_campo::text as contenido,
        bloque.clave_campo_plantilla as clave, bloque.titulo_campo_plantilla as titulo
      from definiciones_campo
      left join campos_plantilla bloque on bloque.campo_plantilla_id = definiciones_campo.campo_plantilla_id
      where definiciones_campo.plantilla_id = ${row.id}::uuid and definiciones_campo.vigente_en_plantilla = true`,
  )
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
  return { id: row.id, modifiedAt: row.modified_at, definition, sections: presented }
}

type ValueRow = { field_id: string; subject_id: string | null; value: string | null }

function toValue(row: ValueRow): StoredValue {
  return { fieldId: row.field_id, subjectId: row.subject_id, value: phpJsonDecode(row.value) }
}

export function createTemplateStore(executor: Executor = db as unknown as Executor): TemplateStore {
  return {
    template: () => loadTemplate(executor),
    async subjectValues(subjectId) {
      const found = await rows<ValueRow>(
        executor,
        sql`select definicion_campo_id::text as field_id, asignatura_id::text as subject_id, valor_campo::text as value
          from valores_campo where asignatura_id = ${subjectId}::uuid`,
      )
      return found.map(toValue)
    },
    async valuesForSubjects(subjectIds, fieldIds) {
      if (subjectIds.length === 0 || fieldIds.length === 0) return []
      const found = await rows<ValueRow>(
        executor,
        sql`select definicion_campo_id::text as field_id, asignatura_id::text as subject_id, valor_campo::text as value
          from valores_campo where asignatura_id in (${uuidList(subjectIds)}) and definicion_campo_id in (${uuidList(fieldIds)})`,
      )
      return found.map(toValue)
    },
    async liveFields(ids, careerOnly) {
      if (ids.length === 0) return []
      const found = await rows<{ id: string; quien_llena: string; contenido: string }>(
        executor,
        sql`select definicion_campo_id::text as id, quien_llena_definicion_campo as quien_llena, contenido_definicion_campo::text as contenido
          from definiciones_campo where definicion_campo_id in (${uuidList([...new Set(ids)])}) and vigente_en_plantilla = true
          ${careerOnly ? sql`and quien_llena_definicion_campo != 'institucional'` : sql``}`,
      )
      return found.map((row) => ({ id: row.id, responsible: row.quien_llena, content: phpJsonDecode(row.contenido) }))
    },
  }
}
