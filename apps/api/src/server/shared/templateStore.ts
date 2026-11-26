import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { isRecord, phpCount, phpJsonDecode } from "../configuration/phpValues"
import { officialDefinition } from "../configuration/officialTemplate"
import type { SyllabusTemplate, TemplateBlock, TemplateField, TemplateSection } from "../configuration/templatePresentation"
import { trustedDefinition } from "../configuration/templateRuntime"

export type StoredValue = { fieldId: string; subjectId: string | null; value: unknown }
export type LiveField = { id: string; responsible: string; content: unknown }

export interface TemplateStore {
  template(): Promise<SyllabusTemplate | null>
  subjectValues(subjectId: string): Promise<StoredValue[]>
  valuesForSubjects(subjectIds: string[], fieldIds: string[]): Promise<StoredValue[]>
  liveFields(ids: string[], careerOnly: boolean): Promise<LiveField[]>
}

type TemplateRow = { id: string; modifiedAt: string | null; definition: string | null }
type SectionRow = { id: string; clave: string; titulo: string; orientacion: string | null; posicion: number }
type BlockRow = { id: string; section_id: string; clave: string; titulo: string; posicion: number }
type FieldRow = { id: string; block_id: string; quien_llena: string; contenido: string | null; clave: string | null; titulo: string | null }
type ValueRow = { fieldId: string; subjectId: string | null; value: string | null }

export async function loadTemplate(db: Db, lock = false): Promise<SyllabusTemplate | null> {
  const [row] = await db.$queryRaw<TemplateRow[]>`
    select plantilla_id::text as id, plantilla_modificada_en::text as "modifiedAt", definicion_plantilla::text as definition
    from plantilla_silabo limit 1 ${lock ? Prisma.sql`for update` : Prisma.empty}`
  if (!row) return null
  const decoded = phpJsonDecode(row.definition)
  const definition = isRecord(decoded) && phpCount(decoded) > 0 ? trustedDefinition(decoded) : officialDefinition()
  const sections = await db.$queryRaw<SectionRow[]>`
    select seccion_plantilla_id::text as id, clave_seccion_plantilla as clave, titulo_seccion_plantilla as titulo,
      orientacion_seccion_plantilla as orientacion, posicion_seccion_plantilla as posicion
    from secciones_plantilla
    where plantilla_id = ${row.id}::uuid and vigente_en_plantilla = true
    order by posicion_seccion_plantilla asc, clave_seccion_plantilla asc`
  const blocks = await db.$queryRaw<BlockRow[]>`
    select campo_plantilla_id::text as id, seccion_plantilla_id::text as section_id, clave_campo_plantilla as clave,
      titulo_campo_plantilla as titulo, posicion_campo_plantilla as posicion
    from campos_plantilla
    where plantilla_id = ${row.id}::uuid and vigente_en_plantilla = true
    order by posicion_campo_plantilla asc, clave_campo_plantilla asc`
  const fields = await db.$queryRaw<FieldRow[]>`
    select d.definicion_campo_id::text as id, d.campo_plantilla_id::text as block_id, d.quien_llena_definicion_campo as quien_llena,
      d.contenido_definicion_campo::text as contenido, c.clave_campo_plantilla as clave, c.titulo_campo_plantilla as titulo
    from definiciones_campo d
    left join campos_plantilla c on c.campo_plantilla_id = d.campo_plantilla_id
    where d.plantilla_id = ${row.id}::uuid and d.vigente_en_plantilla = true`
  const fieldsByBlock = new Map<string, TemplateField[]>()
  for (const field of fields) {
    const list = fieldsByBlock.get(field.block_id) ?? []
    list.push({ id: field.id, blockId: field.block_id, key: field.clave ?? "", label: field.titulo ?? "", responsible: field.quien_llena, content: phpJsonDecode(field.contenido) })
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

function toValue(row: ValueRow): StoredValue {
  return { ...row, value: phpJsonDecode(row.value) }
}

export function createTemplateStore(db: Db): TemplateStore {
  return {
    template: () => loadTemplate(db),
    async subjectValues(subjectId) {
      const found = await db.$queryRaw<ValueRow[]>`
        select definicion_campo_id::text as "fieldId", asignatura_id::text as "subjectId", valor_campo::text as value
        from valores_campo where asignatura_id = ${subjectId}::uuid`
      return found.map(toValue)
    },
    async valuesForSubjects(subjectIds, fieldIds) {
      if (subjectIds.length === 0 || fieldIds.length === 0) return []
      const found = await db.$queryRaw<ValueRow[]>`
        select definicion_campo_id::text as "fieldId", asignatura_id::text as "subjectId", valor_campo::text as value
        from valores_campo where asignatura_id = any(${subjectIds}::uuid[]) and definicion_campo_id = any(${fieldIds}::uuid[])`
      return found.map(toValue)
    },
    async liveFields(ids, careerOnly) {
      if (ids.length === 0) return []
      const found = await db.$queryRaw<{ id: string; responsible: string; content: string | null }[]>`
        select definicion_campo_id::text as id, quien_llena_definicion_campo as responsible, contenido_definicion_campo::text as content
        from definiciones_campo
        where definicion_campo_id = any(${[...new Set(ids)]}::uuid[]) and vigente_en_plantilla = true
          ${careerOnly ? Prisma.sql`and quien_llena_definicion_campo <> 'institucional'` : Prisma.empty}`
      return found.map((row): LiveField => ({ ...row, content: phpJsonDecode(row.content) }))
    },
  }
}
