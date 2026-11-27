import { createHash } from "node:crypto"
import { defineBlock, given } from "../configuration/blockDefinition"
import { documentFromHtml, documentLines } from "../configuration/documentHtml"
import { formatLimit } from "../configuration/fieldLimit"
import { isPhpArray, isRecord, list, mbStrlen, phpEquals, phpIdentical, phpShape, phpString, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { buildTable, designWithKeys, drawnLayout, guardTable, readTable } from "../configuration/repeatableTable"
import { conditionProblems, contentForField, exportedBlock, RESPONSIBLES, responsibleOf, toRuntime } from "../configuration/templateDraft"
import { defineAnyBlock, isShortBlock } from "../configuration/templateShortForm"
import { definitionError } from "../configuration/templateStyle"
import { canonicalJson } from "../documents/canonicalJson"
import { withBlocks } from "../configuration/templateDefinition"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import {
  defineCondition,
  FIELD_LIMIT_MAX,
  FIELD_LIMIT_MIN,
  fieldConditions,
  fieldLimits,
  limitAllowed,
  normalizeFieldDocument,
  plainText,
  RESPONSE_NODE,
  TemplateValidationError,
  type TemplateDefinition,
} from "../configuration/templateRuntime"
import { phpJson, phpTrimChars, strAscii, strLimit } from "./php"

export type AssistantField = {
  key: string
  label: string
  quien_llena: string
  content: PhpRecord
  show_if?: PhpRecord
  max_length?: number
}

export type AssistantSection = { key: string; title: string; orientation: string; fields: AssistantField[] }

export type AssistantPayload = { version: number; sections: AssistantSection[]; block_changes?: Record<string, PhpRecord> }

export class TemplateDraftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateDraftError"
  }
}

export const MAX_SECTIONS = 60
export const MAX_FIELDS = 60
export const MAX_TEXT = 180
export const MAX_HTML = 100000
export const CELL_COLORS = ["#C3D4EA", "#4F81BD"]
export const TEXT_COLORS = ["#000000", "#365F91", "#FFFFFF"]
export const START = "(inicio)"
export const END = "(final)"
export const RESPONSIBLE_LABELS: Record<string, string> = { carrera: "Carrera", institucional: "Institucional" }

const FIELD_LIMIT_INVALID = "El límite de caracteres debe ser un número entero entre 1 y 50 000."
const FIELD_LIMIT_ONLY_CAREER = "Un campo «Nadie (texto fijo)» no puede tener límite de caracteres."

type Located = { section: AssistantSection; field: AssistantField }

function flatten(error: TemplateValidationError): string[] {
  return Object.values(error.errors).flat()
}

function sectionsOf(template: SyllabusTemplate, definition: TemplateDefinition): AssistantSection[] {
  const conditions = fieldConditions(definition)
  const limits = fieldLimits(definition)
  return template.sections.map((section) => ({
    key: section.key,
    title: section.title,
    orientation: section.orientation === "landscape" ? "landscape" : "portrait",
    fields: section.blocks.flatMap((block) =>
      block.fields.map((field) => ({
        key: field.key,
        label: field.label,
        quien_llena: field.responsible,
        content: field.content as PhpRecord,
        ...(conditions[field.key] !== undefined ? { show_if: conditions[field.key] } : {}),
        ...(limits[field.key] !== undefined && limitAllowed(field.responsible) ? { max_length: limits[field.key] } : {}),
      })),
    ),
  }))
}

function fingerprintOf(definition: TemplateDefinition, sections: AssistantSection[]): string {
  return createHash("sha256")
    .update(phpJson([definition, sections], { unicode: true }))
    .digest("hex")
}

export function templateDefinitionOf(template: SyllabusTemplate): TemplateDefinition {
  return template.definition
}

function responsesOf(node: unknown): PhpRecord[] {
  if (!isPhpArray(node)) return []
  const attrs = isRecord(node) ? node.attrs : undefined
  const found: PhpRecord[] = isRecord(node) && node.type === RESPONSE_NODE && isPhpArray(attrs) ? [record(attrs)] : []
  const children = isRecord(node) ? node.content : undefined
  for (const child of isPhpArray(children) ? list(children) : []) found.push(...responsesOf(child))
  return found
}

function documentBlocks(value: unknown): PhpRecord[] {
  if (!isRecord(value) || value.type !== "doc") return []
  const content = value.content ?? []
  return isPhpArray(content) ? list(content).filter((node): node is PhpRecord => isPhpArray(node)).map(record) : []
}

function drawn(kind: string, raw: PhpRecord): PhpRecord {
  if (!isShortBlock(raw) || Object.prototype.hasOwnProperty.call(raw, "diseño")) return raw
  const where = `blocks.${kind}.campos`
  const lists = isRecord(raw.campos) ? Object.entries(raw.campos) : []
  const only = lists.length === 1 && isRecord(lists[0][1]) && isRecord(lists[0][1].columnas) ? lists[0] : null
  if (only === null) definitionError(`${where}: sin «diseño» el sistema solo dibuja una tabla con una lista de filas y sus «columnas»; para otra forma escriba el «diseño».`)
  const [listKey, rows] = only
  if (typeof given(rows, "titulo") !== "string" || phpTrim(phpString(given(rows, "titulo"))) === "") {
    definitionError(`${where}.${listKey}.titulo: escriba cómo se llama cada fila, en singular; sin «diseño» el sistema dibuja la tabla del editor.`)
  }
  const columns = Object.entries(record(given(rows, "columnas"))).map(([key, column]) => {
    const title = given(column, "titulo")
    if (typeof title !== "string" || phpTrim(title) === "") definitionError(`${where}.${listKey}.columnas.${key}.titulo: escriba el título de la columna; sin «diseño» el sistema dibuja la tabla con esos títulos.`)
    return { key, title }
  })
  return { ...raw, diseño: drawnLayout(listKey, columns) }
}

const WHITESPACE = /[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu

export class AssistantDraft {
  private sections: AssistantSection[]
  private tables: Record<string, PhpRecord> = {}
  private withTables: TemplateDefinition | null = null

  private constructor(
    private readonly base_: TemplateDefinition,
    private readonly base: AssistantSection[],
    private readonly fingerprint_: string,
    start: AssistantSection[],
  ) {
    this.sections = start
  }

  static fromTemplate(template: SyllabusTemplate, start: AssistantSection[] | null = null): AssistantDraft {
    const definition = templateDefinitionOf(template)
    const sections = sectionsOf(template, definition)
    return new AssistantDraft(definition, sections, fingerprintOf(definition, sections), start ?? sections)
  }

  static fromDraft(template: SyllabusTemplate, sections: AssistantSection[]): AssistantDraft {
    const definition = templateDefinitionOf(template)
    return new AssistantDraft(definition, sections, fingerprintOf(definition, sectionsOf(template, definition)), sections)
  }

  static fingerprint(template: SyllabusTemplate): string {
    const definition = templateDefinitionOf(template)
    return fingerprintOf(definition, sectionsOf(template, definition))
  }

  baseFingerprint(): string {
    return this.fingerprint_
  }

  baseDefinition(): TemplateDefinition {
    return this.base_
  }

  definition(): TemplateDefinition {
    if (Object.keys(this.tables).length === 0) return this.base_
    this.withTables ??= withBlocks(this.base_, this.tables)
    return this.withTables
  }

  changed(): boolean {
    return !phpIdentical(this.sections, this.base) || Object.keys(this.tables).length > 0
  }

  payload(): AssistantPayload {
    return { version: 1, sections: this.sections, ...(Object.keys(this.tables).length === 0 ? {} : { block_changes: this.tables }) }
  }

  createTable(design: PhpRecord): string {
    const keyed = designWithKeys({ ...design, kind: null }, Object.keys(this.definition().blocks))
    const kind = phpString(keyed.kind)
    let table: PhpRecord
    try {
      table = defineBlock(kind, buildTable(keyed), Object.keys(this.base_.variables))
    } catch (error) {
      if (error instanceof TemplateValidationError) throw new TemplateDraftError(`La tabla no es válida: ${flatten(error).join(" ")}`)
      throw error
    }
    this.tables = { ...this.tables, [kind]: table }
    this.withTables = null
    return kind
  }

  table(kind: string): PhpRecord {
    const block = Object.prototype.hasOwnProperty.call(this.definition().blocks, kind) ? this.definition().blocks[kind] : null
    if (block === null || block === undefined) throw new TemplateDraftError(`No existe la tabla «${kind}». Las claves de las tablas aparecen en ver_plantilla.`)
    const variables = Object.keys(this.base_.variables)
    const shown = exportedBlock(kind, record(block), variables)
    return { clave: kind, se_puede_cambiar: readTable(kind, record(block), variables).design !== null, tabla: this.withoutDrawnLayout(kind, shown) }
  }

  hasTable(kind: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.definition().blocks, kind)
  }

  writeTable(kind: string, raw: PhpRecord): string {
    const variables = Object.keys(this.base_.variables)
    const stored = Object.prototype.hasOwnProperty.call(this.base_.blocks, kind) ? record(this.base_.blocks[kind]) : null
    let table: PhpRecord
    try {
      table = defineAnyBlock(kind, drawn(kind, raw), variables)
      guardTable(kind, stored, table, variables)
    } catch (error) {
      if (error instanceof TemplateValidationError) throw new TemplateDraftError(`La tabla no es válida: ${flatten(error).join(" ")}`)
      throw error
    }
    this.tables = { ...this.tables, [kind]: table }
    this.withTables = null
    return kind
  }

  private withoutDrawnLayout(kind: string, shown: PhpRecord): PhpRecord {
    if (!isShortBlock(shown)) return shown
    const { diseño: _layout, ...implied } = shown
    void _layout
    const variables = Object.keys(this.base_.variables)
    const asSent = (value: PhpRecord) => record(toRuntime(JSON.parse(JSON.stringify(phpShape(value)))))
    try {
      return canonicalJson(defineAnyBlock(kind, drawn(kind, asSent(implied)), variables)) === canonicalJson(defineAnyBlock(kind, asSent(shown), variables)) ? implied : shown
    } catch (error) {
      if (error instanceof TemplateValidationError) return shown
      throw error
    }
  }

  overview(): PhpRecord[] {
    const required = list(this.definition().required_sections)
    const library = list(this.definition().library_sections)
    return this.sections.map((section, index) => ({
      posicion: index + 1,
      clave: section.key,
      titulo: section.title,
      orientacion: section.orientation === "landscape" ? "horizontal" : "vertical",
      obligatoria: required.includes(section.key),
      revisa_biblioteca: library.includes(section.key),
      campos: section.fields.map((field, position) => ({
        posicion: position + 1,
        clave: field.key,
        nombre: field.label,
        quien_llena: field.quien_llena,
        resumen: this.summary(field.content),
        ...(field.show_if !== undefined ? { mostrar_solo_si: field.show_if } : {}),
        ...(field.max_length !== undefined ? { limite_caracteres: field.max_length } : {}),
      })),
    }))
  }

  field(key: string): PhpRecord {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const field = this.sections[sectionIndex].fields[fieldIndex]
    return {
      clave: field.key,
      nombre: field.label,
      quien_llena: field.quien_llena,
      seccion: this.sections[sectionIndex].key,
      contenido_html: documentLines(field.content).join("\n"),
      ...(field.show_if !== undefined ? { mostrar_solo_si: field.show_if } : {}),
      ...(field.max_length !== undefined ? { limite_caracteres: field.max_length } : {}),
    }
  }

  limitField(key: string, limit: number): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    if (limit === 0) {
      this.changeField(sectionIndex, fieldIndex, (field) => {
        const { max_length: _removed, ...rest } = field
        void _removed
        return rest
      })
      return key
    }
    if (!limitAllowed(this.sections[sectionIndex].fields[fieldIndex].quien_llena)) throw new TemplateDraftError(FIELD_LIMIT_ONLY_CAREER)
    if (limit < FIELD_LIMIT_MIN || limit > FIELD_LIMIT_MAX) throw new TemplateDraftError(FIELD_LIMIT_INVALID)
    this.changeField(sectionIndex, fieldIndex, (field) => ({ ...field, max_length: limit }))
    return key
  }

  showFieldIf(key: string, response: string, options: string[]): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const wanted = phpTrim(response)
    if (wanted === "") {
      this.changeField(sectionIndex, fieldIndex, (field) => {
        const { show_if: _removed, ...rest } = field
        void _removed
        return rest
      })
      return key
    }
    let source: PhpRecord | null = null
    for (const section of this.sections) {
      for (const field of section.fields) {
        for (const attrs of responsesOf(field.content)) {
          if (attrs.id === wanted) source ??= attrs
        }
      }
    }
    if (source === null) {
      throw new TemplateDraftError(
        `No hay ninguna respuesta con el identificador «${wanted}». Póngale "id" en data-response al colocarla (ver_campo muestra los identificadores).`,
      )
    }
    const choices = isPhpArray(source.options) ? list(source.options) : []
    const keys: unknown[] = []
    for (const option of options) {
      const trimmed = phpTrim(option)
      const match = choices.filter((choice) => {
        const item = record(choice)
        return item.const === trimmed || phpString(item.title).toLowerCase() === trimmed.toLowerCase()
      })
      if (match.length === 0) throw new TemplateDraftError(`La respuesta «${wanted}» no tiene la opción «${option}».`)
      keys.push(record(match[0]).const)
    }
    let condition: PhpRecord
    try {
      condition = defineCondition({ response: wanted, options: keys })
    } catch (error) {
      if (error instanceof TemplateValidationError) throw new TemplateDraftError(flatten(error)[0] ?? "")
      throw error
    }
    const before = this.sections
    this.changeField(sectionIndex, fieldIndex, (field) => ({ ...field, show_if: condition }))
    const fields = this.sections.flatMap((section, index) =>
      section.fields.map((field, position) => ({ path: `sections.${index}.fields.${position}`, document: field.content, show_if: field.show_if ?? null })),
    )
    for (const problem of conditionProblems(fields)) {
      if (problem.path === `sections.${sectionIndex}.fields.${fieldIndex}.show_if`) {
        this.sections = before
        throw new TemplateDraftError(problem.message)
      }
    }
    return key
  }

  addSection(title: string, orientation: string, position: number): string {
    if (this.sections.length >= MAX_SECTIONS) throw new TemplateDraftError(`La plantilla ya tiene el máximo de ${MAX_SECTIONS} secciones.`)
    const cleanTitle = this.text(title, "El título de la sección", false)
    const key = this.uniqueKey(cleanTitle, "seccion", this.sectionKeys())
    const section: AssistantSection = { key, title: cleanTitle, orientation: this.orientation(orientation), fields: [] }
    const sections = [...this.sections]
    sections.splice(this.insertionIndex(position, sections.length), 0, section)
    this.sections = sections
    return key
  }

  addSectionAfter(title: string, orientation: string, after: string): string {
    const position = this.positionAfter(this.sections.map((section) => section.key), after, null, "sección")
    return this.addSection(title, orientation, position)
  }

  moveSectionAfter(key: string, after: string): string {
    this.locateSection(key)
    return this.moveSection(key, this.positionAfter(this.sections.map((section) => section.key), after, key, "sección"))
  }

  addFieldAfter(sectionKey: string, label: string, responsible: string, html: string, after: string): string {
    const keys = this.sections[this.locateSection(sectionKey)].fields.map((field) => field.key)
    return this.addField(sectionKey, label, responsible, html, this.positionAfter(keys, after, null, "campo"))
  }

  moveFieldAfter(key: string, sectionKey: string, after: string): string {
    this.locateField(key)
    const keys = this.sections[this.locateSection(sectionKey)].fields.map((field) => field.key)
    return this.moveField(key, sectionKey, this.positionAfter(keys, after, key, "campo"))
  }

  renumber(): string[] {
    const renamed: string[] = []
    let number = 0
    this.sections.forEach((section, index) => {
      const match = /^\s*\p{Nd}+\s*\.\s*(.*)$/u.exec(section.title)
      if (match === null) return
      number++
      const title = `${number}. ${match[1]}`
      if (title !== section.title) {
        this.changeSection(index, (item) => ({ ...item, title }))
        renamed.push(`«${section.title}» → «${title}»`)
      }
      let sub = 0
      section.fields.forEach((field, fieldIndex) => {
        const fieldMatch = /^\s*\p{Nd}+\s*\.\s*\p{Nd}+\.?\s+(.*)$/u.exec(field.label)
        if (fieldMatch === null) return
        sub++
        const label = `${number}.${sub} ${fieldMatch[1]}`
        if (label !== field.label) {
          this.changeField(index, fieldIndex, (item) => ({ ...item, label }))
          renamed.push(`«${field.label}» → «${label}»`)
        }
      })
    })
    return renamed
  }

  renameSection(key: string, title: string): string {
    const index = this.locateSection(key)
    const cleanTitle = this.text(title, "El título de la sección", false)
    this.changeSection(index, (section) => ({ ...section, title: cleanTitle }))
    return key
  }

  orientSection(key: string, orientation: string): string {
    const index = this.locateSection(key)
    const value = this.orientation(orientation)
    this.changeSection(index, (section) => ({ ...section, orientation: value }))
    return key
  }

  moveSection(key: string, position: number): string {
    const index = this.locateSection(key)
    const section = this.sections[index]
    const sections = [...this.sections]
    sections.splice(index, 1)
    sections.splice(this.insertionIndex(position, sections.length), 0, section)
    this.sections = sections
    return key
  }

  removeSection(key: string): string {
    const index = this.locateSection(key)
    const definition = this.definition()
    if (list(definition.required_sections).includes(key) || list(definition.library_sections).includes(key)) {
      throw new TemplateDraftError(`La sección «${this.sections[index].title}» es obligatoria y no se puede quitar.`)
    }
    this.sections = this.sections.filter((_, position) => position !== index)
    return key
  }

  addField(sectionKey: string, label: string, responsible: string, html: string, position: number): string {
    const index = this.locateSection(sectionKey)
    if (this.sections[index].fields.length >= MAX_FIELDS) throw new TemplateDraftError(`La sección ya tiene el máximo de ${MAX_FIELDS} campos.`)
    const cleanLabel = this.text(label, "El nombre del campo", true)
    const key = this.uniqueKey(cleanLabel, "campo", this.fieldKeys())
    const quienLlena = this.responsible(responsible)
    const field: AssistantField = { key, label: cleanLabel, quien_llena: quienLlena, content: this.content(html) }
    this.allowResponses(field.quien_llena, field.content)
    const fields = [...this.sections[index].fields]
    fields.splice(this.insertionIndex(position, fields.length), 0, field)
    this.setFields(index, fields)
    return key
  }

  renameField(key: string, label: string): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const cleanLabel = this.text(label, "El nombre del campo", true)
    this.changeField(sectionIndex, fieldIndex, (field) => ({ ...field, label: cleanLabel }))
    return key
  }

  assignField(key: string, responsible: string): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const value = this.responsible(responsible)
    this.allowResponses(value, this.sections[sectionIndex].fields[fieldIndex].content)
    this.changeField(sectionIndex, fieldIndex, (field) => keepingLimit({ ...field, quien_llena: value }))
    return key
  }

  rewriteField(key: string, html: string): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const content = this.content(html)
    this.allowResponses(this.sections[sectionIndex].fields[fieldIndex].quien_llena, content)
    this.changeField(sectionIndex, fieldIndex, (field) => ({ ...field, content }))
    return key
  }

  moveField(key: string, sectionKey: string, position: number): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const target = this.locateSection(sectionKey)
    if (target !== sectionIndex && this.sections[target].fields.length >= MAX_FIELDS) {
      throw new TemplateDraftError(`La sección de destino ya tiene el máximo de ${MAX_FIELDS} campos.`)
    }
    const field = this.sections[sectionIndex].fields[fieldIndex]
    this.setFields(
      sectionIndex,
      this.sections[sectionIndex].fields.filter((_, index) => index !== fieldIndex),
    )
    const fields = [...this.sections[target].fields]
    fields.splice(this.insertionIndex(position, fields.length), 0, field)
    this.setFields(target, fields)
    return key
  }

  duplicateField(key: string): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    if (this.sections[sectionIndex].fields.length >= MAX_FIELDS) throw new TemplateDraftError(`La sección ya tiene el máximo de ${MAX_FIELDS} campos.`)
    const keys = this.fieldKeys()
    const ids = this.responseIds()
    const field = this.sections[sectionIndex].fields[fieldIndex]
    const label = field.label === "" ? "" : this.text(`${field.label} (copia)`, "El nombre del campo", true)
    const copy = this.copyField(field, label, keys, ids)
    const fields = [...this.sections[sectionIndex].fields]
    fields.splice(fieldIndex + 1, 0, copy)
    this.setFields(sectionIndex, fields)
    return copy.key
  }

  duplicateSection(key: string): string {
    const index = this.locateSection(key)
    if (this.sections.length >= MAX_SECTIONS) throw new TemplateDraftError(`La plantilla ya tiene el máximo de ${MAX_SECTIONS} secciones.`)
    const section = this.sections[index]
    const title = this.text(`${section.title} (copia)`, "El título de la sección", false)
    const keys = this.fieldKeys()
    const ids = this.responseIds()
    const fields = section.fields.map((field) => this.copyField(field, field.label, keys, ids))
    const copy: AssistantSection = { key: this.uniqueKey(section.key, "seccion", this.sectionKeys()), title, orientation: section.orientation, fields }
    const sections = [...this.sections]
    sections.splice(index + 1, 0, copy)
    this.sections = sections
    return copy.key
  }

  removeField(key: string): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    this.setFields(
      sectionIndex,
      this.sections[sectionIndex].fields.filter((_, index) => index !== fieldIndex),
    )
    return key
  }

  applyPreset(key: string, presetKey: string): string {
    const [sectionIndex, fieldIndex] = this.locateField(key)
    const preset = list(this.definition().presets).find((item) => isPhpArray(item) && phpEquals(record(item).key, presetKey))
    if (preset === undefined) throw new TemplateDraftError(`No existe el contenido listo «${presetKey}». Use listar_presets para ver los disponibles.`)
    const found = record(preset)
    this.changeField(sectionIndex, fieldIndex, (field) => keepingLimit({ ...field, quien_llena: phpString(found.quien_llena), content: found.content as PhpRecord }))
    return key
  }

  changes(): string[] {
    const changes: string[] = Object.entries(this.tables).map(([kind, table]) =>
      Object.prototype.hasOwnProperty.call(this.base_.blocks, kind) ? `Cambia la tabla «${phpString(table.label)}».` : `Nueva tabla repetible «${phpString(table.label)}».`,
    )
    const baseSections = keyed(this.base)
    const draftSections = keyed(this.sections)
    for (const section of this.sections) {
      const before = baseSections.get(section.key)
      if (before === undefined) {
        changes.push(`Nueva sección «${section.title}».`)
        continue
      }
      if (before.title !== section.title) changes.push(`La sección «${before.title}» se llamará «${section.title}».`)
      if (before.orientation !== section.orientation) {
        changes.push(`La sección «${section.title}» pasa a ${section.orientation === "landscape" ? "horizontal" : "vertical"}.`)
      }
    }
    for (const section of this.base) {
      if (!draftSections.has(section.key)) changes.push(`Se quita la sección «${section.title}».`)
    }
    const common = (sections: AssistantSection[], other: Map<string, AssistantSection>) => sections.map((section) => section.key).filter((key) => other.has(key))
    if (!phpIdentical(common(this.base, draftSections), common(this.sections, baseSections))) changes.push("Cambia el orden de las secciones.")

    const baseFields = fieldsByKey(this.base)
    const draftFields = fieldsByKey(this.sections)
    for (const [key, item] of draftFields) {
      const name = fieldName(item.field)
      const before = baseFields.get(key)
      if (before === undefined) {
        changes.push(`Nuevo campo «${name}» en «${item.section.title}».`)
        continue
      }
      if (before.field.label !== item.field.label) changes.push(`El campo «${fieldName(before.field)}» se llamará «${name}».`)
      if (before.field.quien_llena !== item.field.quien_llena) changes.push(`«${name}» ahora lo llena: ${RESPONSIBLE_LABELS[item.field.quien_llena] ?? ""}.`)
      if (!phpIdentical(before.field.content, item.field.content)) changes.push(`Cambia el contenido de «${name}».`)
      if (!phpIdentical(before.field.show_if ?? null, item.field.show_if ?? null)) {
        const showIf = item.field.show_if
        changes.push(
          showIf !== undefined
            ? `«${name}» se mostrará solo si la respuesta «${phpString(showIf.response)}» tiene: ${list(showIf.options).map(phpString).join(", ")}.`
            : `«${name}» se mostrará siempre.`,
        )
      }
      if ((before.field.max_length ?? null) !== (item.field.max_length ?? null)) {
        changes.push(
          item.field.max_length !== undefined
            ? `«${name}» admitirá hasta ${formatLimit(item.field.max_length)} caracteres del docente.`
            : `«${name}» ya no tendrá límite de caracteres.`,
        )
      }
      if (before.section.key !== item.section.key) changes.push(`«${name}» pasa a la sección «${item.section.title}».`)
    }
    for (const [key, item] of baseFields) {
      if (!draftFields.has(key) && draftSections.has(item.section.key)) changes.push(`Se quita el campo «${fieldName(item.field)}» de «${item.section.title}».`)
    }
    for (const section of this.sections) {
      const before = baseSections.get(section.key)
      if (before === undefined) continue
      const kept = (fields: AssistantField[], other: AssistantField[]) => fields.map((field) => field.key).filter((key) => other.some((field) => field.key === key))
      if (!phpIdentical(kept(before.fields, section.fields), kept(section.fields, before.fields))) changes.push(`Cambia el orden de los campos de «${section.title}».`)
    }
    return changes
  }

  changedKeys(): { secciones: string[]; campos: string[] } {
    const baseSections = keyed(this.base)
    const baseFields = fieldsByKey(this.base)
    const sections: string[] = []
    for (const section of this.sections) {
      const before = baseSections.get(section.key)
      if (before === undefined || before.title !== section.title || before.orientation !== section.orientation) sections.push(section.key)
    }
    const fields: string[] = []
    for (const [key, item] of fieldsByKey(this.sections)) {
      const before = baseFields.get(key)
      if (
        before === undefined ||
        before.section.key !== item.section.key ||
        !phpIdentical(withoutContent(item.field), withoutContent(before.field)) ||
        !phpIdentical(before.field.content, item.field.content)
      ) {
        fields.push(key)
      }
    }
    return { secciones: sections, campos: fields }
  }

  private summary(document: PhpRecord): string {
    for (const node of documentBlocks(document)) {
      if (node.type === "documentBlock") {
        const kind = phpString(record(node.attrs).kind ?? "")
        const block = this.definition().blocks[kind]
        const label = block !== undefined && block !== null && record(block).label !== undefined && record(block).label !== null ? record(block).label : kind
        return `[tabla «${phpString(label)}», clave ${kind}]`
      }
    }
    const text = phpTrim(plainText(document, this.base_).replace(WHITESPACE, " "))
    if (text === "" || phpTrim(text.replaceAll("|", "")) === "") return "(vacío: espacio para responder)"
    return strLimit(text, 160)
  }

  private text(value: string, what: string, allowEmpty: boolean): string {
    const trimmed = phpTrim(value)
    if (trimmed === "" && !allowEmpty) throw new TemplateDraftError(`${what} no puede quedar vacío.`)
    if (mbStrlen(trimmed) > MAX_TEXT) throw new TemplateDraftError(`${what} admite hasta ${MAX_TEXT} caracteres.`)
    return trimmed
  }

  private orientation(value: string): string {
    const lowered = phpTrim(value).replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    if (lowered === "vertical" || lowered === "portrait") return "portrait"
    if (lowered === "horizontal" || lowered === "landscape") return "landscape"
    throw new TemplateDraftError("La orientación debe ser «vertical» u «horizontal».")
  }

  private responsible(value: string): string {
    const mapped = phpString(responsibleOf(phpTrim(value).replace(/[A-Z]/g, (letter) => letter.toLowerCase())))
    if (!RESPONSIBLES.includes(mapped)) throw new TemplateDraftError("quien_llena debe ser «carrera» o «institucional».")
    return mapped
  }

  private content(html: string): PhpRecord {
    const source = phpTrim(html)
    if (mbStrlen(source) > MAX_HTML) throw new TemplateDraftError("El contenido es demasiado largo.")
    let document: PhpRecord
    try {
      document = normalizeFieldDocument(documentFromHtml(source === "" ? "<p></p>" : source), this.definition(), "contenido_html")
    } catch (error) {
      if (error instanceof TemplateValidationError) throw new TemplateDraftError(`El contenido no es válido: ${flatten(error).join(" ")}`)
      throw error
    }
    const wrong = [...new Set(outsidePalette(document))]
    if (wrong.length > 0) {
      throw new TemplateDraftError(
        `Colores no permitidos: ${wrong.join(", ")}. Fondo de celda: celeste #C3D4EA (con negrita) o azul institucional #4F81BD (con texto blanco #FFFFFF y negrita). Texto: negro #000000, azul #365F91 o blanco #FFFFFF.`,
      )
    }
    return document
  }

  private allowResponses(responsible: string, content: PhpRecord): void {
    try {
      contentForField(responsible, content)
    } catch (error) {
      if (error instanceof TemplateValidationError) {
        throw new TemplateDraftError("Un campo «Nadie (texto fijo)» (institucional) no lleva respuestas. Cámbielo a «Coordinación» (carrera) o quite las respuestas.")
      }
      throw error
    }
  }

  private changeSection(index: number, change: (section: AssistantSection) => AssistantSection): void {
    this.sections = this.sections.map((section, position) => (position === index ? change(section) : section))
  }

  private changeField(sectionIndex: number, fieldIndex: number, change: (field: AssistantField) => AssistantField): void {
    this.changeSection(sectionIndex, (section) => ({ ...section, fields: section.fields.map((field, position) => (position === fieldIndex ? change(field) : field)) }))
  }

  private setFields(sectionIndex: number, fields: AssistantField[]): void {
    this.changeSection(sectionIndex, (section) => ({ ...section, fields }))
  }

  private positionAfter(keys: string[], after: string, moving: string | null, what: string): number {
    const remaining = keys.filter((key) => key !== moving)
    const target = phpTrim(after)
    if (target === START) return 1
    if (target === END || target === "") return remaining.length + 1
    if (target === moving) throw new TemplateDraftError(`No se puede ubicar un ${what} después de sí mismo.`)
    const index = remaining.indexOf(target)
    if (index === -1) throw new TemplateDraftError(`No existe el ${what} «${target}» en ese lugar. Use una clave de ver_plantilla, «${START}» o «${END}».`)
    return index + 2
  }

  private insertionIndex(position: number, count: number): number {
    return position < 1 || position > count ? count : position - 1
  }

  private locateSection(key: string): number {
    const index = this.sections.findIndex((section) => section.key === key)
    if (index === -1) throw new TemplateDraftError(`No existe la sección «${key}». Use ver_plantilla para ver las claves.`)
    return index
  }

  private locateField(key: string): [number, number] {
    for (const [sectionIndex, section] of this.sections.entries()) {
      const fieldIndex = section.fields.findIndex((field) => field.key === key)
      if (fieldIndex !== -1) return [sectionIndex, fieldIndex]
    }
    throw new TemplateDraftError(`No existe el campo «${key}». Use ver_plantilla para ver las claves.`)
  }

  private sectionKeys(): string[] {
    return [...new Set([...this.base.map((section) => section.key), ...this.sections.map((section) => section.key)])]
  }

  private fieldKeys(): string[] {
    return [...new Set([...fieldsByKey(this.base).keys(), ...fieldsByKey(this.sections).keys()])]
  }

  private copyField(field: AssistantField, label: string, keys: string[], ids: string[]): AssistantField {
    const key = this.uniqueKey(field.key, "campo", keys)
    keys.push(key)
    return { ...field, key, label, content: withNewResponseIds(field.content, ids) }
  }

  private responseIds(): string[] {
    const ids: string[] = []
    for (const section of this.sections) {
      for (const field of section.fields) {
        for (const attrs of responsesOf(field.content)) if (typeof attrs.id === "string") ids.push(attrs.id)
      }
    }
    return ids
  }

  private uniqueKey(name: string, fallback: string, used: string[]): string {
    const lowered = strAscii(name).toLowerCase().replace(/[^a-z0-9]+/g, "_")
    const stripped = phpTrimChars(lowered, "_").replace(/^[0-9_]+/, "")
    const base = phpTrimChars(strLimit(stripped, 80, ""), "_")
    const start = base === "" ? fallback : base
    let key = start
    for (let number = 2; used.includes(key); number++) key = `${start}_${number}`
    return key
  }
}

function keepingLimit(field: AssistantField): AssistantField {
  if (limitAllowed(field.quien_llena)) return field
  const { max_length: _removed, ...rest } = field
  void _removed
  return rest
}

function withoutContent(field: AssistantField): PhpRecord {
  const { content: _content, ...rest } = field
  void _content
  return rest
}

function outsidePalette(node: unknown): string[] {
  const wrong: string[] = []
  if (!isRecord(node)) return wrong
  const attrs = isPhpArray(node.attrs) ? record(node.attrs) : {}
  const check = (color: unknown, allowed: string[]) => {
    if (typeof color === "string" && !allowed.includes(asciiUpper(color))) wrong.push(asciiUpper(color))
  }
  check(attrs.backgroundColor, CELL_COLORS)
  check(attrs.textColor, TEXT_COLORS)
  for (const mark of isPhpArray(node.marks) ? list(node.marks) : []) {
    if (isRecord(mark) && mark.type === "textStyle") check(record(mark.attrs).color, TEXT_COLORS)
  }
  for (const child of isPhpArray(node.content) ? list(node.content) : []) {
    if (isPhpArray(child)) wrong.push(...outsidePalette(child))
  }
  return wrong
}

function withNewResponseIds(node: PhpRecord, ids: string[]): PhpRecord {
  let next = node
  const attrs = node.attrs
  const id = isRecord(attrs) ? attrs.id : undefined
  if (node.type === RESPONSE_NODE && typeof id === "string" && isPhpArray(attrs)) {
    const base = phpTrimRight(id.slice(0, 37), "_")
    let copy = `${base}_2`
    for (let number = 3; ids.includes(copy); number++) copy = `${base}_${number}`
    ids.push(copy)
    next = { ...node, attrs: { ...record(attrs), id: copy } }
  }
  if (isPhpArray(next.content)) {
    next = { ...next, content: list(next.content).map((child) => (isPhpArray(child) && isRecord(child) ? withNewResponseIds(child, ids) : child)) }
  }
  return next
}

function asciiUpper(value: string): string {
  return value.replace(/[a-z]/g, (letter) => letter.toUpperCase())
}

function phpTrimRight(value: string, character: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === character) end--
  return value.slice(0, end)
}

function keyed(sections: AssistantSection[]): Map<string, AssistantSection> {
  const map = new Map<string, AssistantSection>()
  for (const section of sections) map.set(section.key, section)
  return map
}

function fieldsByKey(sections: AssistantSection[]): Map<string, Located> {
  const map = new Map<string, Located>()
  for (const section of sections) for (const field of section.fields) map.set(field.key, { section, field })
  return map
}

function fieldName(field: AssistantField): string {
  return field.label !== "" ? field.label : field.key
}
