import { FIELD_LIMIT_INVALID, KEY_PATTERN, RESPONSIBLES, templateDraftSchema } from "@silabos/shared/schemas/template"
import { validateSchema } from "../http/schemaValidation"
import { isList, isPhpArray, isRecord, list, phpCount, phpIntCast, phpShape, phpString, phpTrim, record, type PhpRecord } from "./phpValues"
import {
  CAREER,
  defineCondition,
  FIELD_LIMIT_MAX,
  FIELD_LIMIT_MIN,
  foundResponses,
  INSTITUTIONAL,
  normalizeFieldDocument,
  TemplateValidationError,
  unanswered,
  withoutOwnOptions,
  type TemplateDefinition,
} from "./templateRuntime"
import { defineDocumentStyle, documentWithLayout, documentWithStyles } from "./templateStyle"
import { documentFromHtml, documentLines } from "./documentHtml"
import { defineBlock } from "./blockDefinition"
import { canonicalJson } from "../documents/canonicalJson"
import { defineAnyBlock, shortBlock } from "./templateShortForm"
import { DEFINITION_KEYS, defineTemplate, listLimitsOf, teacherFields, withBlocks, withListLimits } from "./templateDefinition"
import { legacyUnitsDocument } from "./legacyUnits"
import { templateFromAnyLanguage } from "./templateSpanish"

export const FORMAT_VERSION = 2
export { FIELD_LIMIT_INVALID, KEY_PATTERN, RESPONSIBLES }
const FIELD_LIMIT_ONLY_CAREER = "Un campo «Nadie (texto fijo)» no puede tener límite de caracteres."
const ROOT_KEYS = DEFINITION_KEYS
const SOURCE_KINDS = ["una", "varias"]
const INSTITUTIONAL_RESPONSES = "Un campo «Nadie (texto fijo)» no lleva tipos de respuesta. Cambie «¿Quién lo llena?» o quite la respuesta."


export type DraftProblem = { path: string; message: string; blocking: boolean }

export function isPhpList(value: unknown): boolean {
  return isList(value) || (isRecord(value) && Object.keys(value).every((key, index) => key === String(index)))
}

export function toRuntime(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toRuntime)
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 0) return []
  if (keys.every((key, index) => key === String(index))) return keys.map((key) => toRuntime(value[key]))
  return Object.fromEntries(keys.map((key) => [key, toRuntime(value[key])]))
}

export { phpIntCast }

export function responsibleOf(value: unknown): unknown {
  return value === "docente" || value === "coordinacion" ? CAREER : value
}

function at(value: unknown, key: string): unknown {
  if (isRecord(value)) return value[key]
  if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)]
  return undefined
}

function given(value: unknown, key: string): unknown {
  const found = at(value, key)
  return found === undefined ? null : found
}

function entries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  return isRecord(value) ? Object.entries(value) : []
}

function castArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return []
  return isPhpArray(value) ? list(value) : [value]
}

function fieldsOf(section: unknown): unknown {
  const fields = given(section, "fields")
  return isPhpArray(fields) ? fields : []
}

function htmlOrDocument(content: unknown): unknown {
  return typeof content === "string" || (isPhpArray(content) && isPhpList(content)) ? documentFromHtml(content) : content
}

export function fieldDocument(content: unknown): unknown {
  return legacyUnitsDocument(isPhpArray(content) && !isPhpList(content) ? content : documentFromHtml(content))
}

function htmlLines(value: unknown): boolean {
  return typeof value === "string" || (isPhpArray(value) && isPhpList(value) && phpCount(value) > 0 && list(value).every((line) => typeof line === "string"))
}

function definingErrors<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof TemplateValidationError) throw new TemplateValidationError({ definition: flatten(error.errors) })
    throw error
  }
}

export function prepareDraft(raw: PhpRecord): PhpRecord {
  const translated = templateFromAnyLanguage(raw)
  const input = "version" in translated ? translated : { version: FORMAT_VERSION, ...translated }
  const sections = input.sections
  if (!isPhpArray(sections)) return input
  const prepared = entries(sections).map(([index, section]): [string, unknown] => {
    const fields = fieldsOf(section)
    if (!isPhpArray(section) || phpCount(fields) === 0) return [index, section]
    const mapped = entries(fields).map(([position, field]): [string, unknown] => {
      if (!isRecord(field) || !Object.prototype.hasOwnProperty.call(field, "quien_llena")) return [position, field]
      return [position, { ...field, quien_llena: responsibleOf(field.quien_llena) }]
    })
    return [index, { ...record(section), fields: Array.isArray(fields) ? mapped.map(([, field]) => field) : Object.fromEntries(mapped) }]
  })
  return { ...input, sections: Array.isArray(sections) ? prepared.map(([, section]) => section) : Object.fromEntries(prepared) }
}

function ksorted<T>(values: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right))))
}

export function withFieldConditions(definition: TemplateDefinition, conditions: Record<string, PhpRecord>): TemplateDefinition {
  const rest = Object.fromEntries(Object.entries(definition).filter(([key]) => key !== "field_conditions")) as TemplateDefinition
  return Object.keys(conditions).length === 0 ? rest : ({ ...rest, field_conditions: ksorted(conditions) } as TemplateDefinition)
}

export function withFieldLimits(definition: TemplateDefinition, limits: Record<string, number>): TemplateDefinition {
  const rest = Object.fromEntries(Object.entries(definition).filter(([key]) => key !== "field_limits")) as TemplateDefinition
  return Object.keys(limits).length === 0 ? rest : ({ ...rest, field_limits: ksorted(limits) } as TemplateDefinition)
}

export function withDocument(definition: TemplateDefinition, document: PhpRecord): TemplateDefinition {
  return { ...definition, document: defineDocumentStyle(document) }
}

function flatten(errors: Record<string, string[]>): string[] {
  return Object.values(errors).flat()
}

function conditionResponses(node: unknown): PhpRecord[] {
  if (!isPhpArray(node)) return []
  const attrs = at(node, "attrs")
  const found: PhpRecord[] = at(node, "type") === "response" && isPhpArray(attrs) ? [attrs as PhpRecord] : []
  const children = at(node, "content")
  for (const child of isPhpArray(children) ? list(children) : []) found.push(...conditionResponses(child))
  return found
}

function invalidCondition(raw: unknown, earlier: Map<string, PhpRecord>): string | null {
  let condition: PhpRecord
  try {
    condition = defineCondition(raw)
  } catch (error) {
    if (error instanceof TemplateValidationError) return flatten(error.errors)[0] ?? ""
    throw error
  }
  const source = earlier.get(phpString(condition.response))
  if (source === undefined) {
    return "La condición «Mostrar solo si» usa una respuesta que ya no está antes de esta parte. Elija otra respuesta o quite la condición."
  }
  if (!SOURCE_KINDS.includes(given(source, "kind") as string)) {
    return "La condición «Mostrar solo si» solo puede usar respuestas de elegir una o elegir varias."
  }
  const options = given(source, "options")
  const keys = (isPhpArray(options) ? list(options) : []).map((option) => (isPhpArray(option) ? at(option, "const") : undefined)).filter((key) => key !== undefined && key !== null)
  if (list(condition.options).some((option) => !keys.some((key) => phpString(key) === phpString(option)))) {
    return "La condición «Mostrar solo si» usa una opción que la respuesta ya no tiene. Elija otra opción o quite la condición."
  }
  return null
}

type ConditionField = { path: string; document: unknown; show_if: unknown }

export function conditionProblems(fields: ConditionField[]): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = []
  const seen = new Map<string, PhpRecord>()
  for (const field of fields) {
    const earlier = new Map(seen)
    if (field.show_if !== null && field.show_if !== undefined) {
      const message = invalidCondition(field.show_if, earlier)
      if (message !== null) problems.push({ path: `${field.path}.show_if`, message })
    }
    for (const attrs of conditionResponses(field.document)) {
      if (isPhpArray(attrs.showIf)) {
        const message = invalidCondition(attrs.showIf, seen)
        if (message !== null) problems.push({ path: `${field.path}.content`, message })
      }
      const id = attrs.id
      if (typeof id === "string") {
        if (seen.has(id)) problems.push({ path: `${field.path}.content`, message: "Dos respuestas tienen el mismo identificador. Quite una y vuelva a insertarla." })
        if (!seen.has(id)) seen.set(id, attrs)
      }
    }
  }
  return problems.filter((problem, index) => problems.findIndex((other) => other.path === problem.path && other.message === problem.message) === index)
}

export function responsesWithin(document: unknown): boolean {
  return foundResponses(document).length > 0
}

export function contentForField(responsible: string, content: PhpRecord): PhpRecord {
  if (responsible === INSTITUTIONAL && responsesWithin(content)) throw new TemplateValidationError({ content: [INSTITUTIONAL_RESPONSES] })
  return withoutOwnOptions(unanswered(content)) as PhpRecord
}

export function fieldLimitAllowed(responsible: unknown): boolean {
  return responsibleOf(responsible) === CAREER
}

export class DraftRequest {
  private definitionCache: TemplateDefinition | null = null
  private definitionErrors: string[] | null = null

  constructor(
    readonly input: PhpRecord,
    private readonly current: TemplateDefinition,
  ) {}

  private sectionList(): unknown[] {
    return castArray(this.input.sections ?? [])
  }

  fieldConditions(): Record<string, PhpRecord> {
    const conditions: Record<string, PhpRecord> = {}
    for (const section of this.sectionList()) {
      for (const field of list(fieldsOf(section))) {
        const key = given(field, "key")
        const showIf = given(field, "show_if")
        if (!isPhpArray(field) || typeof key !== "string" || showIf === null) continue
        try {
          conditions[key] = defineCondition(showIf)
        } catch (error) {
          if (!(error instanceof TemplateValidationError)) throw error
        }
      }
    }
    return conditions
  }

  fieldLimits(): Record<string, number> {
    const limits: Record<string, number> = {}
    for (const section of this.sectionList()) {
      for (const field of list(fieldsOf(section))) {
        const limit = isPhpArray(field) ? given(field, "max_length") : null
        const key = given(field, "key")
        const responsible = given(field, "quien_llena")
        if (typeof key !== "string" || typeof limit !== "number" || !Number.isInteger(limit) || limit < FIELD_LIMIT_MIN || limit > FIELD_LIMIT_MAX) continue
        if (typeof responsible !== "string" || !fieldLimitAllowed(responsible)) continue
        limits[key] = limit
      }
    }
    return limits
  }

  private withTitleAndLayout(base: TemplateDefinition): TemplateDefinition {
    let document = base.document
    let definition = base
    const styles = this.input.document
    if (phpIntCast(this.input.version) !== FORMAT_VERSION && isPhpArray(styles)) document = documentWithStyles(document, styles)
    const title = this.input.title
    if (typeof title === "string" && phpTrim(title) !== "") document = { ...document, title: { ...record(document.title), text: phpTrim(title) } }
    const layout = this.input.layout
    const changes = this.input.block_changes
    if (isPhpArray(changes) && phpCount(changes) > 0 && phpIntCast(this.input.version) !== FORMAT_VERSION) definition = withBlocks(definition, changes)
    const lists = this.input.lists
    if (isPhpArray(lists) && phpCount(lists) > 0) definition = withListLimits(definition, listLimitsOf(lists))
    if (!isPhpArray(layout)) return withDocument(definition, document)
    const picked = Object.fromEntries(entries(layout).filter(([key]) => ["margin_cm", "title_font_size", "section_font_size", "body_font_size"].includes(key)))
    return withDocument(definition, documentWithLayout(document, picked))
  }

  private withTeacherFields(base: TemplateDefinition): TemplateDefinition {
    const sent = given(this.input, "teacher_fields")
    if (sent === null) return base
    const fields = this.sectionList().flatMap((section) => list(fieldsOf(section))).filter(isPhpArray)
    const sources = [{ key: "", fields: fields.map((field) => ({ key: given(field, "key"), quien_llena: given(field, "quien_llena"), content: null })) }]
    const nobody = new Set(fields.filter((field) => given(field, "quien_llena") === INSTITUTIONAL).map((field) => given(field, "key")))
    return { ...base, teacher_fields: teacherFields(sent, sources).filter((key) => !nobody.has(key)) }
  }

  private draftDefinition(): TemplateDefinition {
    if (phpIntCast(this.input.version) !== FORMAT_VERSION) {
      return definingErrors(() => withFieldLimits(withFieldConditions(this.withTitleAndLayout(this.withTeacherFields(this.current)), this.fieldConditions()), this.fieldLimits()))
    }
    const sections = this.sectionList().map((section) => ({
      key: given(section, "key"),
      fields: list(fieldsOf(section)).map((field) => ({ key: given(field, "key"), quien_llena: given(field, "quien_llena"), content: htmlOrDocument(given(field, "content")) })),
    }))
    const root = Object.fromEntries(ROOT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(this.input, key)).map((key) => [key, this.input[key]]))
    const defined = definingErrors(() => defineTemplate(root, sections))
    const keys = sections.map((section) => phpString(section.key))
    const required: [string, unknown][] = [
      ["required_sections", defined.required_sections],
      ["library_sections", defined.library_sections],
    ]
    for (const [name, wanted] of required) {
      const missing = list(wanted).filter((key) => !keys.includes(phpString(key)))
      if (missing.length > 0) throw new TemplateValidationError({ definition: [`«${name}» nombra secciones que no están en la plantilla: ${missing.map(phpString).join(", ")}.`] })
    }
    return definingErrors(() => withFieldLimits(withFieldConditions(this.withTitleAndLayout(defined), this.fieldConditions()), this.fieldLimits()))
  }

  definition(): TemplateDefinition {
    if (this.definitionCache !== null) return this.definitionCache
    this.definitionCache = this.draftDefinition()
    return this.definitionCache
  }

  validDefinition(): TemplateDefinition | null {
    if (this.definitionErrors !== null) return null
    try {
      return this.definition()
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error
      this.definitionErrors = flatten(error.errors)
      return null
    }
  }

  private uniqueFieldKey(value: unknown): string[] {
    const keys: unknown[] = []
    for (const section of this.sectionList()) {
      for (const field of castArray(given(section, "fields") ?? [])) keys.push(isPhpArray(field) ? given(field, "key") : null)
    }
    return keys.filter((key) => key === value).length > 1
      ? [`La clave del campo «${phpString(value)}» está repetida; cada campo necesita una clave única en toda la plantilla.`]
      : []
  }

  private content(raw: unknown, attribute: string): string[] {
    const value = htmlLines(raw) ? documentFromHtml(raw) : raw
    if (!htmlLines(raw) && (!isPhpArray(value) || isPhpList(value))) return ["El contenido debe ser un documento, un texto HTML o una lista de líneas HTML."]
    const definition = this.validDefinition()
    if (definition === null) return []
    try {
      normalizeFieldDocument(value, definition, attribute)
      return []
    } catch (error) {
      if (error instanceof TemplateValidationError) return flatten(error.errors)
      throw error
    }
  }

  schema() {
    const choices = record(this.current.document.choices)
    return templateDraftSchema({
      formatVersion: FORMAT_VERSION,
      choices: (key) => list(choices[key]).map((value) => phpString(value)),
      repeatedFieldKey: (value) => this.uniqueFieldKey(value),
      contentFailures: (value, attribute) => this.content(value, attribute),
    })
  }

  private conditionFields(definition: TemplateDefinition): ConditionField[] {
    const fields: ConditionField[] = []
    this.sectionList().forEach((section, sectionIndex) => {
      list(fieldsOf(section)).forEach((field, fieldIndex) => {
        if (!isPhpArray(field)) return
        const content = htmlOrDocument(given(field, "content"))
        let document: unknown = null
        if (isPhpArray(content)) {
          try {
            document = normalizeFieldDocument(content, definition)
          } catch (error) {
            if (!(error instanceof TemplateValidationError)) throw error
          }
        }
        fields.push({ path: `sections.${sectionIndex}.fields.${fieldIndex}`, document, show_if: given(field, "show_if") })
      })
    })
    return fields
  }

  async errors(): Promise<Record<string, string[]>> {
    const errors = (await validateSchema(this.schema(), this.input)).errors ?? {}
    const add = (key: string, message: string) => {
      const messages = errors[key] ?? []
      if (!messages.includes(message)) errors[key] = [...messages, message]
    }
    const definition = this.validDefinition()
    if (definition === null) {
      for (const message of this.definitionErrors ?? []) add("definition", message)
      return errors
    }
    for (const problem of conditionProblems(this.conditionFields(definition))) add(problem.path, problem.message)
    this.sectionList().forEach((section, sectionIndex) => {
      list(fieldsOf(section)).forEach((field, fieldIndex) => {
        const responsible = given(field, "quien_llena")
        if (isPhpArray(field) && given(field, "max_length") !== null && typeof responsible === "string" && !fieldLimitAllowed(responsible)) {
          add(`sections.${sectionIndex}.fields.${fieldIndex}.max_length`, FIELD_LIMIT_ONLY_CAREER)
        }
      })
    })
    return errors
  }
}

export type DraftField = { key: string; label: string | null; responsible: string; content: PhpRecord }
export type DraftSection = { key: string; title: string; orientation: string; fields: DraftField[] }

export function validatedSections(input: PhpRecord): DraftSection[] {
  return castArray(input.sections).map((section) => ({
    key: phpString(given(section, "key")),
    title: phpString(given(section, "title")),
    orientation: phpString(given(section, "orientation") ?? "portrait"),
    fields: list(fieldsOf(section)).map((field) => ({
      key: phpString(given(field, "key")),
      label: given(field, "label") === null ? null : phpString(given(field, "label")),
      responsible: phpString(given(field, "quien_llena")),
      content: record(fieldDocument(given(field, "content"))),
    })),
  }))
}

export function structureProblems(definition: TemplateDefinition, sections: unknown): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = []
  const all = isPhpArray(sections) ? list(sections) : []
  const keys = all.map((section) => (isPhpArray(section) ? given(section, "key") : null))
  const required: [string, unknown][] = [
    ["obligatorias", definition.required_sections],
    ["de biblioteca", definition.library_sections],
  ]
  for (const [name, wanted] of required) {
    const missing = list(wanted).filter((key) => !keys.some((given) => phpString(given) === phpString(key)))
    if (missing.length > 0) problems.push({ path: "sections", message: `Faltan secciones ${name}: ${missing.map(phpString).join(", ")}.` })
  }
  all.forEach((section, index) => {
    if (!isPhpArray(section)) return
    const fields = given(section, "fields")
    if (fields === null || (isPhpArray(fields) && phpCount(fields) === 0)) {
      const title = given(section, "title")
      problems.push({ path: `sections.${index}`, message: `La sección «${typeof title === "string" ? title : ""}» no tiene campos; agregue al menos uno o quítela.` })
    }
  })
  return problems
}

export async function draftProblems(payload: PhpRecord, current: TemplateDefinition): Promise<DraftProblem[]> {
  const problems: DraftProblem[] = structureProblems(current, isPhpArray(payload.sections) ? payload.sections : []).map((problem) => ({ ...problem, blocking: false }))
  const errors = await new DraftRequest(prepareDraft(payload), current).errors()
  for (const [path, messages] of Object.entries(errors)) for (const message of messages) problems.push({ path, message, blocking: true })
  if (problems.some((problem) => problem.blocking)) return problems
  entries(isPhpArray(payload.sections) ? payload.sections : []).forEach(([sectionIndex, section]) => {
    entries(fieldsOf(section)).forEach(([fieldIndex, field]) => {
      if (!isPhpArray(field) || given(field, "quien_llena") !== INSTITUTIONAL || !Object.prototype.hasOwnProperty.call(field, "content")) return
      const content = at(field, "content")
      const encoded = JSON.stringify(content)
      if (!encoded.includes("data-response") && !encoded.includes('"type":"response"')) return
      try {
        contentForField(INSTITUTIONAL, normalizeFieldDocument(fieldDocument(content), current))
      } catch (error) {
        if (!(error instanceof TemplateValidationError)) throw error
        for (const message of flatten(error.errors)) problems.push({ path: `sections.${sectionIndex}.fields.${fieldIndex}.content`, message, blocking: true })
      }
    })
  })
  return problems
}

export function exportedBlock(kind: string, block: PhpRecord, variables: string[]): PhpRecord {
  const full = {
    label: block.label,
    ...(phpCount(block.props ?? []) !== 0 ? { props: block.props } : {}),
    ...(phpCount(block.value ?? []) !== 0 ? { value: block.value } : {}),
    ...(phpCount(block.rules ?? []) !== 0 ? { rules: block.rules } : {}),
    ...(block.catalog !== undefined && block.catalog !== null ? { catalog: block.catalog } : {}),
    layout: documentLines({ type: "doc", content: block.layout }),
  }
  const short = shortBlock(block)
  return importsAlike(kind, short, full, variables) ? short : full
}

function importsAlike(kind: string, short: PhpRecord, full: PhpRecord, variables: string[]): boolean {
  const asImported = (value: unknown) => toRuntime(JSON.parse(JSON.stringify(phpShape(value))))
  try {
    return canonicalJson(defineAnyBlock(kind, asImported(short), variables)) === canonicalJson(defineBlock(kind, asImported(full), variables))
  } catch (error) {
    if (error instanceof TemplateValidationError) return false
    throw error
  }
}
