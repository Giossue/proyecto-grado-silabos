import { defineBlock, given, pcreMatch } from "./blockDefinition"
import { isList, isPhpArray, isRecord, isScalar, list, mbStrlen, phpIntCast, phpString, phpTrim, record, type PhpRecord } from "./phpValues"
import { guardTable } from "./repeatableTable"
import { defineAnyBlock } from "./templateShortForm"
import { normalizeTemplateDocument, type TemplateDefinition } from "./templateRuntime"
import { defineDocumentStyle, definitionError } from "./templateStyle"

export const SOURCES = [
  "identification.faculty", "identification.career", "identification.curriculum", "identification.subject", "identification.code",
  "identification.modality", "identification.teacher_campus", "identification.period", "identification.cycle",
  "identification.parallel", "identification.shift", "identification.prerequisites", "identification.teacher_corequisites",
  "identification.organization_unit", "identification.hours_ac", "identification.hours_pae", "identification.hours_aa",
  "identification.total_hours", "identification.credits", "identification.teaching_weeks", "identification.teacher", "identification.email",
  "identification.formation", "approval.submitted_on", "approval.coordinator", "approval.approved_on",
  "approval.librarian", "approval.verified_on",
  "signature.docente", "signature.coordinacion", "signature.biblioteca",
]

export const DEFINITION_KEYS = ["document", "variables", "blocks", "required_sections", "library_sections", "presets", "response_policy", "teacher_fields"]
const KEY = /^[a-z][a-z0-9_]{0,99}$/
const VARIABLE_KEYS = ["label", "source", "sample", "format", "equals"]
const LEGACY_RESPONSIBLES = ["docente", "coordinacion"]

export type DraftSectionSource = { key: unknown; fields: { key: unknown; quien_llena: unknown; content: unknown }[] }
export type ListLimit = { block: string; path: string; min: number; max: number; initial: number }

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((_, index) => String(index))
  return isRecord(value) ? Object.keys(value) : []
}

function entriesOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  return isRecord(value) ? Object.entries(value) : []
}

function isObjectLike(value: unknown): boolean {
  return isPhpArray(value) && !(isList(value) && value.length > 0)
}

function defineVariables(raw: unknown): Record<string, PhpRecord> {
  if (!isObjectLike(raw)) definitionError("«variables» debe ser un objeto con una variable por clave.")
  const clean: Record<string, PhpRecord> = {}
  for (const [key, variable] of entriesOf(raw)) {
    const where = `variables.${key}`
    if (!pcreMatch(KEY, key)) definitionError(`${where}: la clave usa minúsculas, números y _.`)
    if (!isPhpArray(variable) || keysOf(variable).some((name) => !VARIABLE_KEYS.includes(name))) {
      definitionError(`${where}: use label, source y, si hace falta, sample, format y equals.`)
    }
    const label = given(variable, "label")
    if (typeof label !== "string" || phpTrim(label) === "" || mbStrlen(label) > 120) definitionError(`${where}.label: escriba el nombre (hasta 120 caracteres).`)
    const source = given(variable, "source")
    if (typeof source !== "string" || !SOURCES.includes(source)) definitionError(`${where}.source: use una de las fuentes del sistema (ver el manual técnico).`)
    const entry: PhpRecord = { label, source }
    for (const name of ["sample", "equals"]) {
      const value = given(variable, name)
      if (value === null || value === "") continue
      if (typeof value !== "string" || mbStrlen(value) > 500) definitionError(`${where}.${name}: debe ser un texto de hasta 500 caracteres.`)
      entry[name] = value
    }
    if (given(variable, "format") !== null) {
      if (given(variable, "format") !== "number") definitionError(`${where}.format: el único formato es «number».`)
      entry.format = "number"
    }
    clean[key] = entry
  }
  return clean
}

function sectionKeys(raw: unknown, where: string): string[] {
  if (!isList(raw)) definitionError(`«${where}» debe ser una lista de claves de sección.`)
  for (const key of raw) {
    if (typeof key !== "string" || !pcreMatch(KEY, key)) definitionError(`«${where}»: «${isScalar(key) ? phpString(key) : "?"}» no es una clave de sección válida.`)
  }
  return [...new Set(raw as string[])]
}

function responsible(value: unknown): unknown {
  return typeof value === "string" && LEGACY_RESPONSIBLES.includes(value) ? "carrera" : value
}

function definePresets(raw: unknown, sections: DraftSectionSource[]): PhpRecord[] {
  const fields = new Map<string, { quien_llena: unknown; content: unknown }>()
  for (const section of sections) for (const field of section.fields) fields.set(phpString(field.key), field)
  if (!isList(raw)) definitionError("«presets» debe ser una lista.")
  return raw.map((preset, index) => {
    const key = given(preset, "key")
    const field = given(preset, "field")
    const label = given(preset, "label")
    if (
      !isPhpArray(preset) ||
      typeof key !== "string" ||
      !pcreMatch(KEY, key) ||
      typeof field !== "string" ||
      !pcreMatch(KEY, field) ||
      typeof label !== "string" ||
      phpTrim(label) === "" ||
      mbStrlen(label) > 120
    ) {
      definitionError(`presets.${index}: escriba key, label y field (la clave de un campo de la plantilla).`)
    }
    let source = fields.get(field) ?? null
    if (source === null && given(preset, "content") !== null && given(preset, "quien_llena") !== null) source = { quien_llena: given(preset, "quien_llena"), content: given(preset, "content") }
    if (source === null) definitionError(`presets.${index}.field: «${field}» no es un campo de la plantilla.`)
    return { key, label, field, quien_llena: phpString(responsible(source.quien_llena)), content: source.content }
  })
}

export function teacherFields(raw: unknown, sections: DraftSectionSource[]): string[] {
  if (!isList(raw)) definitionError("«teacher_fields» debe ser una lista de claves de campo.")
  const keys = new Set(sections.flatMap((section) => section.fields.map((field) => phpString(field.key))))
  for (const key of raw) {
    if (typeof key !== "string" || !keys.has(key)) definitionError(`teacher_fields: «${isScalar(key) ? phpString(key) : "?"}» no es un campo de la plantilla.`)
  }
  return [...new Set(raw as string[])]
}

export function defineTemplate(raw: unknown, sections: DraftSectionSource[] = []): TemplateDefinition {
  if (!isObjectLike(raw)) definitionError("La definición de la plantilla debe ser un objeto.")
  const unknown = keysOf(raw).filter((key) => !DEFINITION_KEYS.includes(key))
  if (unknown.length > 0) definitionError(`Clave desconocida en la plantilla: «${unknown.join("», «")}».`)
  const variables = defineVariables(given(raw, "variables") ?? [])
  if ((given(raw, "response_policy") ?? "protected") !== "protected") definitionError("«response_policy» debe ser «protected».")
  const keys = Object.keys(variables)
  const rawBlocks = given(raw, "blocks") ?? []
  if (!isObjectLike(rawBlocks)) definitionError("«blocks» debe ser un objeto con una definición por bloque.")
  const blocks: Record<string, PhpRecord> = {}
  for (const [kind, block] of entriesOf(rawBlocks)) blocks[kind] = defineAnyBlock(kind, block, keys)
  const document = defineDocumentStyle(given(raw, "document") ?? [])
  const requiredSections = sectionKeys(given(raw, "required_sections") ?? [], "required_sections")
  const librarySections = sectionKeys(given(raw, "library_sections") ?? [], "library_sections")
  const teacher = teacherFields(given(raw, "teacher_fields") ?? [], sections)
  const context: TemplateDefinition = { document: {}, variables: {}, blocks }
  const presets = definePresets(given(raw, "presets") ?? [], sections).map((preset) => {
    if (!isPhpArray(preset.content)) throw new TypeError("TemplateDocument::normalize(): Argument #1 ($document) must be of type array")
    return { ...preset, content: normalizeTemplateDocument(preset.content, keys, context) }
  })
  return {
    response_policy: "protected",
    document,
    variables,
    blocks,
    required_sections: requiredSections,
    library_sections: librarySections,
    presets,
    teacher_fields: teacher,
  }
}

export function withBlocks(definition: TemplateDefinition, changes: unknown): TemplateDefinition {
  const blocks: Record<string, PhpRecord> = { ...definition.blocks }
  const variables = Object.keys(definition.variables)
  for (const [kind, raw] of entriesOf(changes)) {
    const changed = defineBlock(kind, raw, variables)
    guardTable(kind, Object.prototype.hasOwnProperty.call(blocks, kind) ? record(blocks[kind]) : null, changed, variables)
    blocks[kind] = changed
  }
  return { ...definition, blocks }
}

function withLimits(schema: PhpRecord, path: string[], limits: ListLimit): PhpRecord {
  const [segment, ...rest] = path
  const missing = () => definitionError(`«${limits.path}» no es una lista del bloque «${limits.block}».`)
  if (segment === undefined) {
    if (schema.type !== "array") missing()
    const name = phpString(given(schema, "title") ?? limits.path)
    if (limits.max < 1 || limits.min > limits.max) definitionError(`«${name}»: el máximo debe ser al menos 1 y no menor que el mínimo.`)
    if (limits.initial < limits.min || limits.initial > limits.max) definitionError(`«${name}»: «Al empezar» debe estar entre el mínimo y el máximo.`)
    return { ...schema, minItems: limits.min, maxItems: limits.max, initial: limits.initial }
  }
  if (segment === "*" && schema.type === "array") return { ...schema, items: withLimits(record(schema.items), rest, limits) }
  if (schema.type === "object" && given(schema.properties, segment) !== null) {
    return { ...schema, properties: { ...record(schema.properties), [segment]: withLimits(record(given(schema.properties, segment)), rest, limits) } }
  }
  return missing()
}

export function listLimitsOf(raw: unknown): ListLimit[] {
  return list(raw)
    .filter((item) => isPhpArray(item))
    .map((item) => ({
      block: phpString(given(item, "block") ?? ""),
      path: phpString(given(item, "path") ?? ""),
      min: phpIntCast(given(item, "min") ?? 0),
      max: phpIntCast(given(item, "max") ?? 0),
      initial: phpIntCast(given(item, "initial") ?? 0),
    }))
}

export function withListLimits(definition: TemplateDefinition, lists: ListLimit[]): TemplateDefinition {
  const blocks: Record<string, PhpRecord> = { ...definition.blocks }
  const changed = new Set<string>()
  for (const limits of lists) {
    const block = Object.prototype.hasOwnProperty.call(blocks, limits.block) ? record(blocks[limits.block]) : null
    if (block === null) definitionError(`«${limits.block}» no es un bloque de la plantilla.`)
    const schema = withLimits({ type: "object", properties: block.value }, limits.path.split("."), limits)
    blocks[limits.block] = { ...block, value: schema.properties }
    changed.add(limits.block)
  }
  const variables = Object.keys(definition.variables)
  for (const kind of changed) blocks[kind] = defineBlock(kind, blocks[kind], variables)
  return { ...definition, blocks }
}

