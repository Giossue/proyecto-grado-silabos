import { hasOwnText, markOwnText, markTeacherEdits, openShape, teacherEdits, writtenValue } from "./teacherText"
import { ruleFailures } from "@silabos/shared/lib/blocks/rules"
import { holds } from "@silabos/shared/lib/blocks/condition"
import { Scope } from "@silabos/shared/lib/blocks/scope"
import type { BlockDefinition as LibBlockDefinition, BlockRule, Condition } from "@silabos/shared/lib/blocks/types"
import { filledText, resolveBlock, toDocument } from "@silabos/shared/lib/blocks/walk"
import {
  isList,
  isPhpArray,
  isRecord,
  isScalar,
  list,
  mbStrlen,
  phpCount,
  phpEquals,
  phpIdentical,
  phpString,
  phpTrim,
  record,
  type PhpRecord,
} from "./phpValues"

export class TemplateValidationError extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super(Object.values(errors).flat()[0] ?? "")
  }
}

export type TemplateDefinition = PhpRecord & {
  document: PhpRecord
  variables: Record<string, PhpRecord>
  blocks: Record<string, PhpRecord>
}

export const RESPONSE_NODE = "response"
const OWN_OPTIONS = "customOptions"
const CONDITION_ID = "id"
const CONDITION_ATTR = "showIf"
const KEY = /^[a-z][a-z0-9_]{0,40}$/
const MAX_OPTIONS = 50
const OPTION_LENGTH = 120
const TEXT_LENGTH = 3000
const HELP_LENGTH = 200
const DISPLAYS = ["lista", "desplegable"]
const SETTINGS: Record<string, unknown> = { required: true, help: "", maxLength: TEXT_LENGTH, minChoices: null, maxChoices: null, display: "lista" }
const COMMON_SETTINGS = ["required", "help"]
const KINDS: Record<string, { label: string; settings: string[]; type: "string" | "array"; options: boolean; error: string }> = {
  texto: { label: "Texto libre", settings: ["maxLength"], type: "string", options: false, error: "Escriba una respuesta de hasta 3000 caracteres." },
  una: { label: "Elegir una", settings: ["display"], type: "string", options: true, error: "Elija solo entre las opciones de la respuesta." },
  varias: { label: "Elegir varias", settings: ["minChoices", "maxChoices"], type: "array", options: true, error: "Elija solo entre las opciones de la respuesta." },
}
const FONTS = ["Arial", "Calibri", "Times New Roman", "Verdana", "Georgia"]
const CELL_ALIGNMENTS = ["left", "center", "right", "justify"]
const CELL_BORDER_STYLES = ["thin", "thick", "none"]
const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/u
export const INSTITUTIONAL = "institucional"
export const CAREER = "carrera"

function fail(message: string, attribute = "document"): never {
  throw new TemplateValidationError({ [attribute]: [message] })
}

function at(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : Array.isArray(value) && /^\d+$/.test(key) ? value[Number(key)] : undefined
}

function given(value: unknown, key: string): unknown {
  const found = at(value, key)
  return found === undefined ? null : found
}

function hasKey(value: unknown, key: string): boolean {
  return isRecord(value) ? Object.prototype.hasOwnProperty.call(value, key) : Array.isArray(value) && /^\d+$/.test(key) && Number(key) < value.length
}

function phpArrayOr(value: unknown): unknown[] | PhpRecord {
  return isPhpArray(value) ? value : []
}

function nodeType(node: unknown): string {
  const type = at(node, "type")
  return typeof type === "string" ? type : ""
}

function content(node: unknown): unknown[] {
  return list(given(node, "content") ?? [])
}

function without(node: PhpRecord, keys: string[]): PhpRecord {
  return Object.fromEntries(Object.entries(node).filter(([key]) => !keys.includes(key)))
}

function splitLines(text: string): string[] {
  return text.split(LINE_BREAK)
}

export function isDocument(value: unknown): boolean {
  return isPhpArray(value) && at(value, "type") === "doc"
}

export function plainText(node: unknown, definition: TemplateDefinition): string {
  const type = at(node, "type")
  if (type === "text") return typeof at(node, "text") === "string" ? (at(node, "text") as string) : ""
  if (type === "hardBreak") return "\n"
  if (type === "documentBlock") return blockPlainText(phpArrayOr(at(node, "attrs")), definition)
  if (type === RESPONSE_NODE) return responseLines(phpArrayOr(at(node, "attrs"))).join("\n")
  const children = list(phpArrayOr(at(node, "content"))).map((child) => (isPhpArray(child) ? plainText(child, definition) : ""))
  if (type === "tableRow") return children.join(" | ")
  if (type === "listItem") return "• " + children.join("\n")
  return children.join(type === "paragraph" ? "" : "\n")
}

function blockDefinitionOf(attrs: unknown, definition: TemplateDefinition): PhpRecord | null {
  const kind = at(attrs, "kind")
  if (typeof kind !== "string") return null
  const block = definition.blocks[kind]
  return block === undefined ? null : record(block)
}

function libDefinition(block: PhpRecord): LibBlockDefinition {
  return {
    ...block,
    props: record(block.props),
    value: record(block.value),
    rules: list(block.rules),
    layout: list(block.layout),
  } as unknown as LibBlockDefinition
}

function blockPlainText(attrs: unknown, definition: TemplateDefinition): string {
  const block = blockDefinitionOf(attrs, definition)
  if (block === null) return ""
  return filledText(resolveBlock(libDefinition(block), record(at(attrs, "props")), record(at(attrs, "value")), {}))
}

export function expandBlock(node: unknown, variables: Record<string, string>, definition: TemplateDefinition): unknown[] {
  const attrs = phpArrayOr(at(node, "attrs"))
  const block = blockDefinitionOf(attrs, definition)
  if (block === null) return []
  return toDocument(resolveBlock(libDefinition(block), record(at(attrs, "props")), record(at(attrs, "value")), variables)) as unknown[]
}

function hasOptions(kind: string): boolean {
  return KINDS[kind]?.options ?? false
}

function kindLabels(): string {
  const labels = Object.values(KINDS).map((kind) => kind.label)
  const last = labels.pop()
  return `${labels.join(", ")} o ${last}`
}

function emptyResponseValue(kind: string): unknown {
  const entry = KINDS[kind]
  if (entry?.type === "array") return []
  if (entry?.type === "string") return entry.options ? null : ""
  return null
}

function collapse(text: string): string {
  return phpTrim(text.replace(/\s+/gu, " "))
}

function responseOptions(kind: string, raw: unknown): { const: string; title: string }[] {
  if (!isList(raw)) fail("Las opciones de la respuesta no son válidas.")
  if (!hasOptions(kind)) {
    if (raw.length !== 0) fail(`Una respuesta de ${KINDS[kind].label.toLowerCase()} no lleva opciones.`)
    return []
  }
  if (raw.length > MAX_OPTIONS) fail(`Una respuesta admite hasta ${MAX_OPTIONS} opciones.`)
  const options: { const: string; title: string }[] = []
  for (const option of raw) {
    const key = isPhpArray(option) ? given(option, "const") : null
    const rawTitle = isPhpArray(option) ? at(option, "title") : null
    const title = typeof rawTitle === "string" ? collapse(rawTitle) : ""
    if (title === "" || mbStrlen(title) > OPTION_LENGTH) fail(`Escriba el texto de cada opción, de hasta ${OPTION_LENGTH} caracteres.`)
    if (typeof key !== "string" || !KEY.test(key) || options.some((item) => item.const === key)) fail("Las opciones de la respuesta no son válidas.")
    if (options.some((item) => item.title.toLowerCase() === title.toLowerCase())) fail("Hay opciones repetidas. Deje cada opción una sola vez.")
    options.push({ const: key, title })
  }
  return options
}

function help(raw: unknown): string {
  const text = typeof raw === "string" ? collapse(raw) : null
  if (text === null || mbStrlen(text) > HELP_LENGTH) fail(`Escriba una ayuda de hasta ${HELP_LENGTH} caracteres.`)
  return text
}

function choiceLimit(raw: unknown, options: unknown[]): number {
  if (options.length === 0) fail("Escriba las opciones antes de fijar cuántas elegir.")
  const count = options.length
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > count) fail(`Cuántas elegir va de 1 a ${count}, el número de opciones.`)
  return raw
}

function responseSettings(kind: string, options: unknown[], attrs: unknown): PhpRecord {
  const allowed = [...COMMON_SETTINGS, ...KINDS[kind].settings]
  const settings: PhpRecord = {}
  for (const name of Object.keys(SETTINGS)) {
    const raw = given(attrs, name)
    if (raw === null) continue
    if (!allowed.includes(name)) fail(`Una respuesta de ${KINDS[kind].label.toLowerCase()} no lleva esa opción.`)
    let value: unknown
    if (name === "required") value = typeof raw === "boolean" ? raw : fail("Indique si la respuesta es obligatoria.")
    else if (name === "help") value = help(raw)
    else if (name === "maxLength")
      value = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= TEXT_LENGTH ? raw : fail(`El límite de caracteres va de 1 a ${TEXT_LENGTH}.`)
    else if (name === "minChoices" || name === "maxChoices") value = choiceLimit(raw, options)
    else value = typeof raw === "string" && DISPLAYS.includes(raw) ? raw : fail(`Elija cómo se muestra: ${DISPLAYS.join(" o ")}.`)
    if (value !== SETTINGS[name]) settings[name] = value
  }
  if (typeof settings.minChoices === "number" && typeof settings.maxChoices === "number" && settings.minChoices > settings.maxChoices) {
    fail("El mínimo para elegir no puede superar el máximo.")
  }
  return settings
}

export function defineCondition(raw: unknown): PhpRecord {
  const response = isPhpArray(raw) ? given(raw, "response") : null
  const options = isPhpArray(raw) ? given(raw, "options") : null
  const keysOk = isRecord(raw) && Object.keys(raw).every((key) => key === "response" || key === "options")
  if (
    !keysOk ||
    typeof response !== "string" ||
    !KEY.test(response) ||
    !isList(options) ||
    options.length === 0 ||
    options.length > MAX_OPTIONS ||
    options.some((option) => typeof option !== "string" || !KEY.test(option))
  ) {
    fail("Elija la respuesta y al menos una de sus opciones para «Mostrar solo si».")
  }
  return { response, options: [...new Set(options as string[])] }
}

function responseLogic(attrs: unknown): PhpRecord {
  const logic: PhpRecord = {}
  if (given(attrs, CONDITION_ID) !== null) {
    const id = at(attrs, CONDITION_ID)
    if (typeof id !== "string" || !KEY.test(id)) fail("El identificador de la respuesta no es válido.")
    logic[CONDITION_ID] = id
  }
  if (given(attrs, CONDITION_ATTR) !== null) logic[CONDITION_ATTR] = defineCondition(at(attrs, CONDITION_ATTR))
  return logic
}

function assertChoices(count: number, min: unknown, max: unknown): void {
  const plural = (limit: number) => (limit === 1 ? "1 opción" : `${limit} opciones`)
  if (typeof min === "number" && Number.isInteger(min) && count < min) fail(`Elija al menos ${plural(min)}.`)
  if (typeof max === "number" && Number.isInteger(max) && count > max) fail(`Elija como máximo ${plural(max)}.`)
}

function setting(attrs: unknown, name: string): unknown {
  const value = given(attrs, name)
  return value ?? SETTINGS[name] ?? null
}

function optionTitle(options: unknown, chosen: unknown): string {
  for (const option of list(options)) {
    if (at(option, "const") === chosen) return phpString(at(option, "title"))
  }
  return ""
}

export function responseAttrs(attrs: unknown): PhpRecord {
  const kind = given(attrs, "kind")
  if (typeof kind !== "string" || !(kind in KINDS)) fail(`Elija un tipo de respuesta: ${kindLabels()}.`)
  const options = responseOptions(kind, given(attrs, "options") ?? [])
  const settings = responseSettings(kind, options, attrs)
  const logic = responseLogic(attrs)
  const raw = given(attrs, "value")
  const entry = KINDS[kind]
  if (entry.options && options.length === 0) {
    if (raw !== null && raw !== "" && !(isPhpArray(raw) && phpCount(raw) === 0)) fail("Esta respuesta todavía no tiene opciones para elegir.")
    return { kind, options, value: emptyResponseValue(kind), ...settings, ...logic }
  }
  const own = at(attrs, OWN_OPTIONS) === true ? { [OWN_OPTIONS]: true } : {}
  let error = entry.error
  let maxLength = TEXT_LENGTH
  if (typeof settings.maxLength === "number") {
    maxLength = settings.maxLength
    error = `Escriba una respuesta de hasta ${maxLength} caracteres.`
  }
  if (entry.type === "array" && raw !== null && !isList(raw)) fail(error)
  let value: unknown
  if (entry.type === "array") {
    const items = isList(raw) ? raw : []
    if (items.length > 100) fail(error)
    const chosen = items.map((item) => {
      if (item === null || item === "") return null
      if (typeof item !== "string" || optionTitle(options, item) === "") fail(error)
      return item
    })
    value = [...new Set(chosen.filter((item): item is string => typeof item === "string"))]
  } else if (entry.options) {
    if (raw === null || raw === "") value = null
    else if (typeof raw !== "string" || optionTitle(options, raw) === "") fail(error)
    else value = raw
  } else {
    if (raw === null) value = ""
    else if (typeof raw !== "string" || mbStrlen(raw) > maxLength) fail(error)
    else value = phpTrim(raw)
  }
  if (Array.isArray(value) && value.length > 0) assertChoices(value.length, setting(settings, "minChoices"), setting(settings, "maxChoices"))
  return { kind, options, value, ...settings, ...(entry.options ? own : {}), ...logic }
}

export function responseAnswered(attrs: unknown): boolean {
  const value = given(attrs, "value")
  return value !== null && value !== "" && !(isPhpArray(value) && phpCount(value) === 0)
}

export function responseRequired(attrs: unknown): boolean {
  return setting(attrs, "required") !== false
}

function needsOptions(attrs: unknown): boolean {
  const kind = at(attrs, "kind")
  return hasOptions(typeof kind === "string" ? kind : "") && phpCount(given(attrs, "options") ?? []) === 0
}

function adjustable(attrs: unknown): boolean {
  const kind = at(attrs, "kind")
  return hasOptions(typeof kind === "string" ? kind : "") && phpCount(given(attrs, "options") ?? []) !== 0
}

export function responseLines(attrs: unknown): string[] {
  const kind = phpString(given(attrs, "kind"))
  const options = isPhpArray(at(attrs, "options")) ? at(attrs, "options") : []
  const value = given(attrs, "value")
  if (!responseAnswered(attrs) || !(kind in KINDS)) return []
  if (!hasOptions(kind)) return isScalar(value) ? splitLines(phpString(value)) : []
  return (isPhpArray(value) ? list(value) : [value]).map((chosen) => optionTitle(options, chosen)).filter((title) => title !== "")
}

function chosenSettings(attrs: unknown): PhpRecord {
  const chosen: PhpRecord = {}
  for (const name of Object.keys(SETTINGS)) {
    const value = given(attrs, name)
    if (value !== null && !phpIdentical(value, SETTINGS[name])) chosen[name] = value
  }
  return chosen
}

function sameQuestion(template: unknown, value: unknown, career: boolean): boolean {
  if (given(template, "kind") !== given(value, "kind")) return false
  if (!phpIdentical(chosenSettings(template), chosenSettings(value))) return false
  return (
    phpIdentical(given(template, "options") ?? [], given(value, "options") ?? []) ||
    (career && (needsOptions(template) || (given(value, OWN_OPTIONS) === true && adjustable(template))))
  )
}

function sameAnswer(template: unknown, value: unknown): boolean {
  return (
    given(template, "kind") === given(value, "kind") &&
    phpIdentical(chosenSettings(template), chosenSettings(value)) &&
    phpEquals(given(template, "options") ?? [], given(value, "options") ?? []) &&
    phpEquals(given(template, "value"), given(value, "value"))
  )
}

function carryResponse(template: PhpRecord, value: unknown): PhpRecord {
  if (given(template, "kind") !== given(value, "kind")) return template
  const keys = list(isPhpArray(template.options) ? template.options : []).map((option) => at(option, "const"))
  let answer = given(value, "value")
  if (hasOptions(phpString(template.kind))) {
    answer = isPhpArray(answer) ? list(answer).filter((chosen) => keys.includes(chosen)) : keys.includes(answer) ? answer : null
  }
  try {
    return responseAttrs({ ...template, value: answer })
  } catch (error) {
    if (error instanceof TemplateValidationError) return template
    throw error
  }
}

function ownOptions(template: unknown, value: PhpRecord, saving: boolean): PhpRecord {
  const own = value[OWN_OPTIONS] === true
  const rest = without(value, [OWN_OPTIONS])
  if (!adjustable(template) || given(template, "kind") !== given(rest, "kind") || !phpIdentical(chosenSettings(template), chosenSettings(rest))) {
    return rest
  }
  const differs = !phpIdentical(given(rest, "options") ?? [], given(template, "options") ?? [])
  if (saving) {
    if (phpCount(given(rest, "options") ?? []) === 0) fail("Deje al menos una opción en la respuesta de la plantilla.")
    return differs ? { ...rest, [OWN_OPTIONS]: true } : rest
  }
  if (!differs) return rest
  return own ? { ...rest, [OWN_OPTIONS]: true } : carryResponse(record(template), rest)
}

function stampCondition(template: unknown, value: PhpRecord): PhpRecord {
  const stamped = without(value, [CONDITION_ID, CONDITION_ATTR])
  for (const name of [CONDITION_ID, CONDITION_ATTR]) {
    if (given(template, name) !== null) stamped[name] = at(template, name)
  }
  return stamped
}

export function withoutOwnOptions(node: unknown): unknown {
  if (!isPhpArray(node)) return node
  let next: unknown = node
  if (at(node, "type") === RESPONSE_NODE && isPhpArray(at(node, "attrs"))) {
    const attrs = at(node, "attrs")
    next = { ...record(node), attrs: isRecord(attrs) ? without(attrs, [OWN_OPTIONS]) : attrs }
  }
  if (isPhpArray(at(next, "content"))) next = { ...record(next), content: list(at(next, "content")).map(withoutOwnOptions) }
  return next
}

function withoutLogic(node: unknown): unknown {
  if (!isPhpArray(node)) return node
  let next: unknown = node
  if (at(node, "type") === RESPONSE_NODE && isPhpArray(at(node, "attrs"))) {
    const attrs = at(node, "attrs")
    next = { ...record(node), attrs: isRecord(attrs) ? without(attrs, [CONDITION_ID, CONDITION_ATTR]) : attrs }
  }
  if (isPhpArray(at(next, "content"))) next = { ...record(next), content: list(at(next, "content")).map(withoutLogic) }
  return next
}

export function unanswered(node: PhpRecord): PhpRecord {
  let next = node
  if (at(node, "type") === RESPONSE_NODE) {
    next = { ...node, attrs: { ...record(node.attrs), value: emptyResponseValue(phpString(given(node.attrs, "kind"))) } }
  }
  if (isPhpArray(at(next, "content"))) next = { ...next, content: list(next.content).map((child) => unanswered(record(child))) }
  return next
}

export function foundResponses(node: unknown): unknown[] {
  if (!isPhpArray(node)) return []
  const found: unknown[] = at(node, "type") === RESPONSE_NODE ? [isPhpArray(at(node, "attrs")) ? at(node, "attrs") : []] : []
  for (const child of list(isPhpArray(at(node, "content")) ? at(node, "content") : [])) found.push(...foundResponses(child))
  return found
}

export function pendingResponses(document: unknown): { unanswered: number; without_options: number } {
  const pending = { unanswered: 0, without_options: 0 }
  for (const attrs of foundResponses(document)) {
    if (needsOptions(attrs)) pending.without_options++
    else if (!responseAnswered(attrs) && responseRequired(attrs)) pending.unanswered++
  }
  return pending
}

export function schemaDigits(schema: PhpRecord): [number, number] {
  const multiple = Number(schema.multipleOf)
  const decimals = multiple >= 1 ? 0 : Math.round(-Math.log10(multiple))
  return [String(Math.trunc(Math.floor(Number(schema.maximum)))).length, decimals]
}

function parseNumber(text: string): number {
  const value = Number.parseFloat(phpTrim(text).replace(",", "."))
  return Number.isFinite(value) ? value : 0
}

function isChoiceSchema(schema: PhpRecord): boolean {
  return schema.type === "string" && schema.oneOf !== undefined && schema.oneOf !== null
}

function emptyFor(schema: PhpRecord, props: PhpRecord): unknown {
  if (schema.type === "string") return isChoiceSchema(schema) ? null : ""
  if (schema.type === "number") return ""
  if (schema.type === "object") return schemaObject(record(schema.properties), {}, props, false)
  if (schema.type === "array") return []
  return null
}

function schemaValue(schema: PhpRecord, raw: unknown, props: PhpRecord, fresh: boolean): unknown {
  const label = typeof schema.title === "string" ? schema.title : "Una celda"
  const error = typeof schema.errorMessage === "string" ? schema.errorMessage : null
  if (schema.type === "string" && isChoiceSchema(schema)) {
    if (raw === null || raw === "") return null
    if (typeof raw !== "string" || optionTitle(schema.oneOf, raw) === "") fail(error ?? `La respuesta de «${label}» no es válida.`)
    return raw
  }
  if (schema.type === "string") {
    if (raw === null) return ""
    if (typeof raw !== "string" || mbStrlen(raw) > Number(schema.maxLength)) fail(error ?? `${label} supera los ${schema.maxLength} caracteres.`)
    return raw
  }
  if (schema.type === "number") {
    const text = phpTrim(typeof raw === "string" || typeof raw === "number" ? String(raw) : "")
    if (raw !== null && typeof raw !== "string" && typeof raw !== "number") fail(error ?? `${label} debe ser un número.`)
    const [digits, decimals] = schemaDigits(schema)
    const pattern = new RegExp(`^\\d{1,${digits}}${decimals > 0 ? `([.,]\\d{1,${decimals}})?` : ""}$`)
    if (text !== "" && (!pattern.test(text) || parseNumber(text) > Number(schema.maximum))) fail(error ?? `${label} debe ser un número.`)
    return text
  }
  if (schema.type === "object") return schemaObject(record(schema.properties), isRecord(raw) ? raw : {}, props, fresh)
  if (schema.type === "array") {
    const givenList = isList(raw)
    const items = givenList ? raw : []
    if (items.length > Number(schema.maxItems)) fail(error ?? `«${label}» admite hasta ${schema.maxItems} elementos.`)
    const count = !givenList && fresh ? Number(schema.initial) : Math.max(items.length, Number(schema.minItems))
    const clean: unknown[] = []
    for (let index = 0; index < count; index++) clean.push(schemaValue(record(schema.items), items[index] ?? null, props, !givenList && fresh))
    return clean
  }
  return null
}

function schemaObject(fields: PhpRecord, raw: PhpRecord, props: PhpRecord, fresh: boolean): PhpRecord {
  const clean: PhpRecord = {}
  for (const [key, schema] of Object.entries(fields)) {
    clean[key] = schemaValue(record(schema), raw[key] ?? null, props, fresh && !Object.prototype.hasOwnProperty.call(raw, key))
  }
  for (const [key, schema] of Object.entries(fields)) {
    const keepIf = record(schema).keep_if
    if (keepIf !== undefined && keepIf !== null && !holds(keepIf as Condition, new Scope(clean, props, {}))) clean[key] = emptyFor(record(schema), props)
  }
  return clean
}

function schemaProps(fields: PhpRecord, raw: unknown): PhpRecord {
  const values = isRecord(raw) ? raw : {}
  const clean: PhpRecord = {}
  for (const [key, field] of Object.entries(fields)) {
    const schema = record(field)
    const label = typeof schema.title === "string" ? schema.title : key
    const value = values[key]
    const text = phpTrim(isScalar(value) ? phpString(value) : "")
    const error = typeof schema.errorMessage === "string" ? schema.errorMessage : null
    if (Number(schema.minLength ?? 0) > 0 && text === "") fail(error ?? `«${label}» es obligatorio.`)
    if (mbStrlen(text) > Number(schema.maxLength)) fail(error ?? `«${label}» admite hasta ${schema.maxLength} caracteres.`)
    clean[key] = text
  }
  return clean
}

export function initialValue(fields: unknown, props: PhpRecord): PhpRecord {
  return schemaObject(record(fields), {}, props, true)
}

export function normalizeBlock(kind: string, block: PhpRecord, attrs: unknown, variables: Record<string, string> = {}): PhpRecord {
  const props = schemaProps(record(block.props), given(attrs, "props"))
  const rawValue = given(attrs, "value")
  const raw = isRecord(rawValue) ? rawValue : {}
  const value = schemaObject(record(block.value), raw, props, Object.keys(raw).length === 0)
  const failure = ruleFailures(list(block.rules) as BlockRule[], value, variables, "save")[0]
  if (failure) fail(failure.message)
  return { kind, props, value }
}

function normalizeDocumentBlock(attrs: unknown, definition: TemplateDefinition): PhpRecord {
  const kind = given(attrs, "kind")
  const block = typeof kind === "string" ? definition.blocks[kind] : undefined
  if (block === undefined || block === null || typeof kind !== "string") fail("El bloque no es de un tipo permitido.")
  return normalizeBlock(kind, record(block), attrs)
}

function isColor(value: unknown): boolean {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

function assertGrid(table: PhpRecord): void {
  const rows = list(table.content)
  if (rows.length > 100) fail("Una tabla admite hasta 100 filas de diseño.")
  const occupied: Map<number, number>[] = []
  let width: number | null = null
  rows.forEach((row, r) => {
    let column = 0
    for (const cell of list(at(row, "content"))) {
      while (occupied[r]?.has(column)) column++
      const span = Number(at(at(cell, "attrs"), "colspan"))
      const height = Number(at(at(cell, "attrs"), "rowspan"))
      if (r + height > rows.length || column + span > 24) fail("Una celda combinada sale de la tabla.")
      for (let y = r; y < r + height; y++) {
        for (let x = column; x < column + span; x++) {
          occupied[y] ??= new Map()
          if (occupied[y].has(x)) fail("Hay celdas combinadas superpuestas.")
          occupied[y].set(x, 1)
        }
      }
      column += span
    }
    const cells = occupied[r] ?? new Map<number, number>()
    const size = cells.size
    width ??= size
    const keys = new Set(cells.keys())
    const missing = Array.from({ length: Math.max(size, 0) }, (_, index) => index).some((index) => !keys.has(index))
    if (size !== width || size === 0 || missing) fail("Las filas deben cubrir el mismo ancho. Separe la combinación incompleta.")
  })
}

const CHILDREN: Record<string, string[]> = {
  "": ["doc"],
  doc: ["paragraph", "table", "bulletList", "orderedList", "documentBlock"],
  group: ["paragraph", "table", "bulletList", "orderedList", "group"],
  tableCell: ["paragraph", "table", "bulletList", "orderedList"],
  tableHeader: ["paragraph", "table", "bulletList", "orderedList"],
  paragraph: ["text", "hardBreak", "variable", RESPONSE_NODE],
  table: ["tableRow"],
  tableRow: ["tableCell", "tableHeader"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList"],
}

const LAYOUT_CHILDREN: Record<string, string[]> = {
  doc: ["paragraph", "table", "bulletList", "orderedList", "group"],
  paragraph: ["text", "hardBreak", "variable", "slot"],
}

const LAYOUT_DIRECTIVES = ["repeat", "when", "band"]

export type LayoutRules = { directives(attrs: unknown[] | PhpRecord, type: string): PhpRecord; slot(attrs: unknown[] | PhpRecord): PhpRecord }

function repeatsCells(table: PhpRecord): boolean {
  return list(table.content).some((row) => list(given(row, "content") ?? []).some((cell) => given(given(cell, "attrs"), "repeat") !== null))
}

export function normalizeTemplateDocument(document: unknown, variables: string[], definition: TemplateDefinition, layout: LayoutRules | null = null): PhpRecord {
  if (Buffer.byteLength(JSON.stringify(document)) > 2000000) fail("El diseño pasa el límite de 2 MB. Divida el contenido en varias secciones.")
  let count = 0
  const visit = (raw: unknown, parent: string, depth: number, insideTable: boolean): PhpRecord => {
    if (++count > 6000 || depth > 12 || !isPhpArray(raw)) fail("El diseño es demasiado grande o está mal formado.")
    const type = given(raw, "type") ?? ""
    const allowed = layout !== null && LAYOUT_CHILDREN[parent] !== undefined ? LAYOUT_CHILDREN[parent] : (CHILDREN[parent] ?? [])
    if (typeof type !== "string" || !allowed.includes(type)) fail("El diseño contiene un elemento no permitido.")
    const node: PhpRecord = { type }
    const attrs = isPhpArray(at(raw, "attrs")) ? (at(raw, "attrs") as unknown[] | PhpRecord) : []
    if (type === "text") {
      const text = at(raw, "text")
      if (typeof text !== "string" || mbStrlen(text) > 20000 || text === "") fail("El texto del diseño no es válido.")
      node.text = text
    }
    if (type === "documentBlock") node.attrs = normalizeDocumentBlock(attrs, definition)
    if (type === RESPONSE_NODE) node.attrs = responseAttrs(attrs)
    if (type === "slot") node.attrs = layout === null ? [] : layout.slot(attrs)
    if (type === "variable") {
      const key = given(attrs, "id")
      if (typeof key !== "string" || !variables.includes(key)) fail("Seleccione una variable del catálogo.")
      const variableAttrs: PhpRecord = { id: key, label: key }
      const listStyle = given(attrs, "listStyle")
      if (listStyle !== null) {
        if (listStyle !== "bullet" && listStyle !== "number") fail("El formato de lista del dato no es válido.")
        variableAttrs.listStyle = listStyle
      }
      node.attrs = variableAttrs
    }
    if (type === "paragraph") {
      const align = given(attrs, "textAlign") ?? "left"
      if (!["left", "center", "right", "justify"].includes(align as string)) fail("Alineación no permitida.")
      node.attrs = { textAlign: align }
    }
    if (type === "table" && given(attrs, "repeatKey") !== null) fail("La tabla usa filas que agrega el docente; use Texto libre para eso.")
    if (type === "tableRow" && !["fixed"].includes((given(attrs, "rowRole") ?? "fixed") as string)) {
      fail("La tabla usa filas que agrega el docente; use Texto libre para eso.")
    }
    const inTable = insideTable || type === "table"
    if (type === "tableCell" || type === "tableHeader") {
      const span = given(attrs, "colspan") ?? 1
      const rows = given(attrs, "rowspan") ?? 1
      if (!isInt(span) || span < 1 || span > 24 || !isInt(rows) || rows < 1 || rows > 100) {
        fail("Una combinación excede los límites de la tabla (24 columnas y 100 filas).")
      }
      const widths = given(attrs, "colwidth")
      if (widths !== null && (!isList(widths) || widths.length !== span)) fail("Anchos de columna no válidos.")
      for (const width of isList(widths) ? widths : []) {
        if (!isInt(width) || width < 0 || width > 1200) fail("Ancho de columna fuera del límite.")
      }
      const background = given(attrs, "backgroundColor")
      if (background !== null && !isColor(background)) fail("Color de celda no válido.")
      const textColor = given(attrs, "textColor")
      if (textColor !== null && !isColor(textColor)) fail("Color de texto de celda no válido.")
      const textAlign = given(attrs, "textAlign")
      if (textAlign !== null && !CELL_ALIGNMENTS.includes(textAlign as string)) fail("Alineación de celda no permitida.")
      const borderStyle = given(attrs, "borderStyle")
      if (borderStyle !== null && !CELL_BORDER_STYLES.includes(borderStyle as string)) fail("Borde de celda no permitido.")
      const bold = given(attrs, "bold")
      const italic = given(attrs, "italic")
      if ((bold !== null && typeof bold !== "boolean") || (italic !== null && typeof italic !== "boolean")) fail("Formato de celda no válido.")
      node.attrs = { colspan: span, rowspan: rows, colwidth: widths, backgroundColor: background, textColor, textAlign, bold, italic, borderStyle }
    }
    if (layout !== null && LAYOUT_DIRECTIVES.some((key) => hasKey(attrs, key))) node.attrs = { ...record(node.attrs), ...layout.directives(attrs, type) }
    const rawMarks = given(raw, "marks")
    if (rawMarks !== null) {
      if (!["text", "variable", "slot", RESPONSE_NODE].includes(type) || !isPhpArray(rawMarks) || phpCount(rawMarks) > 4) fail("Formato de texto no válido.")
      const marks: PhpRecord[] = []
      for (const mark of list(rawMarks)) {
        const markType = isPhpArray(mark) ? (given(mark, "type") ?? "") : ""
        if (!["bold", "italic", "underline", "textStyle"].includes(markType as string)) fail("Formato de texto no permitido.")
        const clean: PhpRecord = { type: markType }
        if (markType === "textStyle") {
          const style = isPhpArray(at(mark, "attrs")) ? at(mark, "attrs") : []
          const styleAttrs: PhpRecord = {}
          for (const property of ["fontFamily", "fontSize", "color"]) {
            if (property === "fontSize" || (inTable && property === "fontFamily")) continue
            const value = given(style, property)
            if (value === null) continue
            const valid = property === "fontFamily" ? FONTS.includes(value as string) : isColor(value)
            if (!valid) fail("Use las fuentes, tamaños y colores ofrecidos por el editor.")
            styleAttrs[property] = value
          }
          clean.attrs = styleAttrs
        }
        marks.push(clean)
      }
      node.marks = marks
    }
    const rawContent = given(raw, "content")
    if (rawContent !== null) {
      if (!isList(rawContent)) fail("Contenido del diseño no válido.")
      node.content = rawContent.map((child) => visit(child, type, depth + 1, inTable))
    }
    if (type === "tableRow") node.content ??= []
    const containers = ["doc", "table", "tableCell", "tableHeader", "bulletList", "orderedList", "listItem", "group"]
    if (containers.includes(type) && phpCount(node.content ?? []) === 0) fail("El diseño tiene una estructura vacía.")
    if (type === "table" && (layout === null || !repeatsCells(node))) assertGrid(node)
    return node
  }
  return visit(document, "", 0, false)
}

export function normalizeFieldDocument(value: unknown, definition: TemplateDefinition, attribute = "content"): PhpRecord {
  if (!isDocument(value)) fail("El contenido debe ser un documento de texto, listas o tablas.", attribute)
  try {
    return normalizeTemplateDocument(value, Object.keys(definition.variables), definition)
  } catch (error) {
    if (error instanceof TemplateValidationError) throw new TemplateValidationError({ [attribute]: Object.values(error.errors).flat() })
    throw error
  }
}

export function fieldDocumentIsEmpty(value: unknown, definition: TemplateDefinition): boolean {
  return !isDocument(value) || phpTrim(plainText(value, definition)) === ""
}

export function responsesEnabled(definition: TemplateDefinition): boolean {
  return definition.response_policy === "protected"
}

export function blank(node: unknown): boolean {
  if (!["paragraph", "tableCell", "doc"].includes(nodeType(node))) return false
  return content(node).every((child) => nodeType(child) === "paragraph" && blank(child))
}

function hasSlots(node: unknown): boolean {
  if (nodeType(node) === "tableHeader") return false
  return blank(node) || ["documentBlock", RESPONSE_NODE].includes(nodeType(node)) || content(node).some(hasSlots)
}

function spaces(node: unknown): boolean {
  if (nodeType(node) === "tableHeader") return false
  return blank(node) || nodeType(node) === RESPONSE_NODE || content(node).some(spaces)
}

export function responseTemplate(template: PhpRecord): PhpRecord {
  if (hasSlots(template)) return template
  return { ...template, content: [...content(template), { type: "paragraph" }] }
}

function responseSlot(cell: unknown): boolean {
  if (blank(cell)) return true
  const paragraphs = content(cell)
  const inlines = paragraphs.flatMap((child) => content(child))
  return nodeType(cell) === "tableCell" && inlines.length > 0 && paragraphs.every((child) => nodeType(child) === "paragraph") && inlines.every((inline) => nodeType(inline) === RESPONSE_NODE)
}

export function listTable(table: unknown): boolean {
  const rows = [...content(table)]
  const last = rows.pop()
  return (
    rows.length > 0 &&
    isPhpArray(last) &&
    content(last).length > 0 &&
    rows.every((row) => content(row).length > 0 && content(row).every((cell) => nodeType(cell) === "tableHeader")) &&
    content(last).every((cell) => responseSlot(cell) && (given(at(cell, "attrs"), "rowspan") ?? 1) === 1)
  )
}

function expandedRows(template: unknown, actual: unknown[]): unknown[] {
  const expected = [...content(template)]
  if (nodeType(template) === "table" && listTable(template)) {
    const row = expected[expected.length - 1]
    while (expected.length < actual.length) expected.push(row)
  }
  return expected
}

function careerOnly(node: unknown): boolean {
  return !["documentBlock", "variable"].includes(nodeType(node)) && content(node).every(careerOnly)
}

function answerOnly(node: unknown): boolean {
  return !["documentBlock", "variable", RESPONSE_NODE].includes(nodeType(node)) && content(node).every(answerOnly)
}

export function matches(template: unknown, value: unknown, mode: "answer" | "career"): boolean {
  if (nodeType(template) !== nodeType(value)) return false
  if (nodeType(template) === "tableHeader") return phpIdentical(template, value)
  if (nodeType(template) === RESPONSE_NODE) {
    if (!phpIdentical(given(template, "marks") ?? [], given(value, "marks") ?? [])) return false
    const templateAttrs = given(template, "attrs") ?? []
    const valueAttrs = given(value, "attrs") ?? []
    return mode === "answer" && responseAnswered(templateAttrs) ? sameAnswer(templateAttrs, valueAttrs) : sameQuestion(templateAttrs, valueAttrs, mode === "career")
  }
  if (nodeType(template) === "documentBlock") {
    return (
      phpIdentical(given(at(template, "attrs"), "kind") ?? "", given(at(value, "attrs"), "kind") ?? "") &&
      phpIdentical(given(at(template, "attrs"), "props") ?? [], given(at(value, "attrs"), "props") ?? [])
    )
  }
  const appendedSlot = nodeType(template) === "paragraph" && given(template, "attrs") === null && blank(template)
  if (!appendedSlot && !phpIdentical(given(template, "attrs") ?? [], given(value, "attrs") ?? [])) return false
  if (blank(template)) return mode === "career" ? careerOnly(value) : answerOnly(value)
  let expected = content(template)
  const actual = content(value)
  if (nodeType(template) === "table" && listTable(template)) {
    expected = [...expected]
    const row = expected.pop()
    if (actual.length < expected.length + 1) return false
    while (expected.length < actual.length) expected.push(row)
  }
  if (expected.length !== actual.length) return false
  if (expected.length === 0) return phpIdentical(template, value)
  return expected.every((child, index) => matches(child, actual[index], mode))
}

export function adopt(template: unknown, value: PhpRecord, saving: boolean): PhpRecord {
  const type = nodeType(template)
  if (type !== nodeType(value)) return value
  if (type === RESPONSE_NODE) {
    return { ...value, attrs: stampCondition(given(template, "attrs") ?? [], ownOptions(given(template, "attrs") ?? [], record(given(value, "attrs") ?? []), saving)) }
  }
  if (type === "tableHeader" || type === "documentBlock" || blank(template)) return value
  const actual = content(value)
  const expected = expandedRows(template, actual)
  if (expected.length === 0 || expected.length !== actual.length) return value
  return { ...value, content: expected.map((child, index) => adopt(child, record(actual[index]), saving)) }
}

function withoutBlankLines(node: PhpRecord): PhpRecord {
  const type = nodeType(node)
  if (!isPhpArray(node.content) || type === "paragraph") return node
  let children = list(node.content)
  const blankParagraph = (child: unknown) => nodeType(child) === "paragraph" && blank(child)
  if (type === "listItem") {
    if (children.every(blankParagraph)) return { ...node, content: [] }
    const [first, ...rest] = children
    children = [first, ...rest.filter((child) => !blankParagraph(child))]
  } else if (type !== "table" && type !== "tableRow") {
    children = children.filter((child) => !blankParagraph(child))
  }
  let cleaned = children
    .map((child) => withoutBlankLines(record(child)))
    .filter((child) => !["listItem", "bulletList", "orderedList"].includes(nodeType(child)) || phpCount(child.content ?? []) !== 0) as unknown[]
  if (cleaned.length === 0 && ["doc", "tableCell", "tableHeader"].includes(type)) cleaned = [{ type: "paragraph" }]
  return { ...node, content: cleaned }
}

function seal(template: unknown, value: PhpRecord): PhpRecord {
  const type = nodeType(template)
  if (["tableHeader", "documentBlock", RESPONSE_NODE].includes(type)) return value
  if (blank(template)) {
    if (blank(value)) return value
    return record(withoutLogic(unanswered(withoutBlankLines(value))))
  }
  const actual = content(value)
  const expected = expandedRows(template, actual)
  if (expected.length === 0 || expected.length !== actual.length) return value
  return { ...value, content: expected.map((child, index) => seal(child, record(actual[index]))) }
}

function within<T>(attribute: string, check: () => T): T {
  try {
    return check()
  } catch (error) {
    if (error instanceof TemplateValidationError) throw new TemplateValidationError({ [attribute]: Object.values(error.errors).flat() })
    throw error
  }
}

export function assertEnoughOptions(node: unknown): void {
  if (!isPhpArray(node)) return
  const attrs = at(node, "type") === RESPONSE_NODE && isPhpArray(at(node, "attrs")) ? at(node, "attrs") : null
  if (attrs !== null && hasOptions(typeof at(attrs, "kind") === "string" ? (at(attrs, "kind") as string) : "")) {
    const count = isPhpArray(at(attrs, "options")) ? phpCount(at(attrs, "options")) : 0
    const plural = (limit: number) => (limit === 1 ? "1 opción" : `${limit} opciones`)
    const min = given(attrs, "minChoices")
    const max = given(attrs, "maxChoices")
    if (typeof min === "number" && Number.isInteger(min) && min > count) fail(`Esta respuesta pide elegir al menos ${min}: deje al menos ${plural(min)}.`)
    if (typeof max === "number" && Number.isInteger(max) && max > count) fail(`Esta respuesta permite elegir hasta ${max}: deje al menos ${plural(max)}.`)
  }
  for (const child of isPhpArray(at(node, "content")) ? list(at(node, "content")) : []) assertEnoughOptions(child)
}

function sameResponse(template: unknown, value: unknown): boolean {
  return (
    given(template, "kind") === given(value, "kind") &&
    phpIdentical(chosenSettings(template), chosenSettings(value)) &&
    phpIdentical(given(template, CONDITION_ID), given(value, CONDITION_ID)) &&
    phpIdentical(given(template, CONDITION_ATTR), given(value, CONDITION_ATTR))
  )
}

function pairedResponses(source: unknown, document: PhpRecord, pair: (from: unknown, node: PhpRecord) => PhpRecord): PhpRecord {
  const candidates = foundResponses(source)
  const taken = new Set<number>()
  const visit = (node: PhpRecord): PhpRecord => {
    if (nodeType(node) === RESPONSE_NODE) {
      const attrs = given(node, "attrs") ?? []
      const found = candidates.findIndex((candidate, index) => !taken.has(index) && sameResponse(candidate, attrs))
      if (found >= 0) taken.add(found)
      return pair(found >= 0 ? candidates[found] : null, node)
    }
    return isList(node.content) ? { ...node, content: node.content.map((child) => visit(record(child))) } : node
  }
  return visit(document)
}

function fromTemplate(template: unknown, node: PhpRecord, saving: boolean): PhpRecord {
  return { ...node, attrs: stampCondition(template, ownOptions(template, record(given(node, "attrs") ?? []), saving)) }
}

function editedResponses(template: PhpRecord, document: PhpRecord, saving: boolean, sealing: boolean): PhpRecord {
  return pairedResponses(template, document, (from, node) => {
    if (from !== null) return fromTemplate(from, node, saving)
    return sealing ? record(withoutLogic(unanswered(node))) : node
  })
}

function blocksOf(node: unknown): unknown[] {
  if (nodeType(node) === "documentBlock") return [[given(at(node, "attrs"), "kind") ?? "", given(at(node, "attrs"), "props") ?? []]]
  return content(node).flatMap(blocksOf)
}

function variablesOf(node: unknown): unknown[] {
  if (nodeType(node) === "variable") return [given(at(node, "attrs"), "id")]
  return content(node).flatMap(variablesOf)
}

function trailingBlanks(node: unknown): number {
  const children = content(node)
  let count = 0
  while (count < children.length && nodeType(children[children.length - 1 - count]) === "paragraph" && blank(children[children.length - 1 - count])) count++
  return count
}

function withoutExtraTail(template: PhpRecord, document: PhpRecord): PhpRecord {
  const children = [...content(document)]
  for (let extra = trailingBlanks(document) - trailingBlanks(template); extra > 0 && children.length > 1; extra--) children.pop()
  return { ...document, content: children }
}

function tablesOf(node: unknown): unknown[] {
  if (nodeType(node) === "table") {
    return [content(node).map((row) => content(row).map((cell) => [nodeType(cell), given(at(cell, "attrs"), "colspan") ?? 1, given(at(cell, "attrs"), "rowspan") ?? 1]))]
  }
  return content(node).flatMap(tablesOf)
}

const TABLES_FIXED = "Las tablas de este campo las define Administración: escriba dentro de sus celdas, sin quitar ni agregar filas o columnas."
const BLOCKS_FIXED = "Los bloques de este campo los define Administración: no los agregue ni los quite."
const VARIABLES_FIXED = "Use solo los datos del sistema que ya trae este campo en la plantilla."

function assertCareerEdit(template: PhpRecord, document: PhpRecord, attribute: string, saving: boolean): void {
  if (!phpIdentical(blocksOf(template), blocksOf(document))) fail(BLOCKS_FIXED, attribute)
  if (!phpEquals(tablesOf(template), tablesOf(document))) fail(TABLES_FIXED, attribute)
  const known = variablesOf(template)
  if (saving && variablesOf(document).some((id) => !known.includes(id))) fail(VARIABLES_FIXED, attribute)
}

const EDITED = "edited"

function editedCopy(stored: unknown): boolean {
  return isPhpArray(stored) && at(at(stored, "attrs"), EDITED) === true
}

function slotsFrom(template: PhpRecord, value: PhpRecord): PhpRecord {
  const type = nodeType(template)
  if (type !== nodeType(value) || ["tableHeader", "documentBlock", RESPONSE_NODE].includes(type)) return template
  if (blank(template)) return careerOnly(value) && given(value, "content") !== null ? { ...template, content: value.content } : template
  const expected = [...content(template)]
  const actual = content(value)
  if (expected.length === 0) return template
  if (type === "table" && listTable(template)) {
    const row = expected.pop()
    while (expected.length < Math.max(actual.length, content(template).length)) expected.push(row)
    if (expected.length !== actual.length) return template
    return { ...template, content: expected.map((child, index) => slotsFrom(record(child), record(actual[index]))) }
  }
  const pairs = aligned(expected, actual)
  return { ...template, content: expected.map((child, index) => (pairs[index] === null ? child : slotsFrom(record(child), record(pairs[index])))) }
}

function fits(template: unknown, value: unknown): boolean {
  if (nodeType(template) !== nodeType(value)) return false
  if (blank(template)) return careerOnly(value)
  return ["paragraph", "tableHeader"].includes(nodeType(template)) ? matches(template, value, "career") : true
}

function aligned(expected: unknown[], actual: unknown[]): (unknown | null)[] {
  const lengths = Array.from({ length: expected.length + 1 }, () => new Array<number>(actual.length + 1).fill(0))
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= actual.length; j++) {
      lengths[i][j] = Math.max(lengths[i - 1][j], lengths[i][j - 1], fits(expected[i - 1], actual[j - 1]) ? lengths[i - 1][j - 1] + 1 : 0)
    }
  }
  const pairs: (unknown | null)[] = expected.map(() => null)
  let i = expected.length
  let j = actual.length
  while (i > 0 && j > 0) {
    if (fits(expected[i - 1], actual[j - 1]) && lengths[i][j] === lengths[i - 1][j - 1] + 1) {
      pairs[i - 1] = actual[j - 1]
      i--
      j--
    } else if (lengths[i][j - 1] >= lengths[i - 1][j]) j--
    else i--
  }
  return pairs
}

function followCurrent(template: PhpRecord, stored: PhpRecord): PhpRecord {
  const followed = pairedResponses(stored, slotsFrom(template, stored), (from, node) => (from === null ? node : fromTemplate(given(node, "attrs") ?? [], { ...node, attrs: from }, false)))
  return matches(template, followed, "career") ? followed : template
}

const SPACES_WITH_TEACHER_EDITS = "Quite los espacios de respuesta para que el docente pueda editar todo el texto."
const NO_NEW_SPACES = "No agregue espacios de respuesta: escriba directamente en el texto."

export function careerResponse(definitionContent: unknown, value: unknown, definition: TemplateDefinition, attribute = "value", saving = true): PhpRecord {
  const shaped = careerShape(definitionContent, value, definition, attribute, saving)
  if (!teacherEdits(value)) return shaped
  if (foundResponses(shaped).length === 0) return markTeacherEdits(shaped)
  if (saving) fail(SPACES_WITH_TEACHER_EDITS, attribute)
  return shaped
}

export function teacherOwnText(template: unknown, value: unknown, definition: TemplateDefinition, attribute = "value"): PhpRecord {
  const base = normalizeFieldDocument(template, definition, attribute)
  const document = normalizeFieldDocument(value, definition, attribute)
  if (phpEquals(withoutExtraTail(base, document), base)) return base
  if (foundResponses(document).length > 0) fail(NO_NEW_SPACES, attribute)
  assertCareerEdit(base, document, attribute, true)
  return markOwnText(document)
}

function ownTextStands(template: unknown, value: unknown, definition: TemplateDefinition): boolean {
  if (!hasOwnText(value)) return false
  try {
    teacherOwnText(template, value, definition)
    return true
  } catch (error) {
    if (error instanceof TemplateValidationError) return false
    throw error
  }
}

function careerShape(definitionContent: unknown, value: unknown, definition: TemplateDefinition, attribute: string, saving: boolean): PhpRecord {
  if (saving) within(attribute, () => assertEnoughOptions(value))
  const document = normalizeFieldDocument(value, definition, attribute)
  const template = responseTemplate(normalizeFieldDocument(definitionContent, definition))
  if (blank(document)) return template
  if (!responsesEnabled(definition)) {
    const written = withoutBlankLines(document)
    if (saving) assertCareerEdit(template, written, attribute, saving)
    return written
  }
  const shaped = saving ? record(withoutOwnOptions(document)) : document
  const adopted = within(attribute, () => adopt(template, shaped, saving))
  if (matches(template, adopted, "career")) return seal(template, adopted)
  if (!saving && !editedCopy(value)) return seal(template, followCurrent(template, shaped))
  assertCareerEdit(template, shaped, attribute, saving)
  const edited = withoutExtraTail(template, within(attribute, () => editedResponses(template, shaped, saving, true)))
  return saving ? { ...edited, attrs: { [EDITED]: true } } : edited
}

function careerDocument(definitionContent: unknown, value: unknown, definition: TemplateDefinition): PhpRecord {
  return careerResponse(definitionContent, value, definition, "value", false)
}

function carryDocument(template: PhpRecord, value: PhpRecord): PhpRecord {
  const type = nodeType(template)
  if (type !== nodeType(value) || type === "tableHeader") return template
  if (type === RESPONSE_NODE) {
    return responseAnswered(given(template, "attrs") ?? []) ? template : { ...template, attrs: carryResponse(record(given(template, "attrs") ?? []), given(value, "attrs") ?? []) }
  }
  if (type === "documentBlock") return matches(template, value, "answer") ? value : template
  if (blank(template)) return answerOnly(value) && given(value, "content") !== null ? { ...template, content: value.content } : template
  const expected = [...content(template)]
  const actual = content(value)
  if (type === "table" && listTable(template)) {
    const row = expected.pop()
    while (expected.length < Math.max(actual.length, content(template).length)) expected.push(row)
  }
  if (expected.length === 0 || expected.length !== actual.length) return template
  return { ...template, content: expected.map((child, index) => carryDocument(record(child), record(actual[index]))) }
}

export function fieldFits(template: unknown, value: unknown, definition: TemplateDefinition): boolean {
  try {
    if (teacherEdits(template)) {
      return hasOwnText(value)
        ? ownTextStands(template, value, definition)
        : phpEquals(normalizeFieldDocument(value, definition), normalizeFieldDocument(template, definition))
    }
    return matches(responseTemplate(normalizeFieldDocument(openShape(template), definition)), normalizeFieldDocument(writtenValue(template, value), definition), "answer")
  } catch (error) {
    if (error instanceof TemplateValidationError) return false
    throw error
  }
}

export function fieldCarried(source: unknown, held: unknown, definition: TemplateDefinition): unknown {
  const template = openShape(source)
  const value = writtenValue(source, held)
  if (teacherEdits(template)) {
    return isDocument(value) && ownTextStands(template, value, definition) ? teacherOwnText(template, value, definition) : normalizeFieldDocument(template, definition)
  }
  if (!isDocument(value)) return template
  let current: PhpRecord
  let document: PhpRecord
  try {
    current = responseTemplate(normalizeFieldDocument(template, definition))
    document = carryDocument(current, normalizeFieldDocument(value, definition))
  } catch (error) {
    if (error instanceof TemplateValidationError) return template
    throw error
  }
  const paired = pairedResponses(normalizeFieldDocument(value, definition), document, (from, node) =>
    from === null || responseAnswered(given(node, "attrs") ?? []) ? node : { ...node, attrs: carryResponse(record(given(node, "attrs") ?? []), from) },
  )
  if (matches(current, paired, "answer")) return paired
  return matches(current, document, "answer") ? document : template
}

export function responseOptionsOf(document: unknown): unknown[] {
  return foundResponses(document).map((attrs) => given(attrs, "options") ?? [])
}

export function responseWithin(document: unknown): boolean {
  return foundResponses(document).length > 0
}

export function templateFor(definitionContent: unknown, stored: unknown, definition: TemplateDefinition): unknown {
  if (!isDocument(stored)) return definitionContent
  try {
    return careerDocument(definitionContent, stored, definition)
  } catch (error) {
    if (error instanceof TemplateValidationError) return definitionContent
    throw error
  }
}

export function followTemplate(definitionContent: unknown, stored: unknown, definition: TemplateDefinition): PhpRecord | null {
  const followed = followShape(definitionContent, stored, definition)
  return followed !== null && teacherEdits(stored) && foundResponses(followed).length === 0 ? markTeacherEdits(followed) : followed
}

function followShape(definitionContent: unknown, stored: unknown, definition: TemplateDefinition): PhpRecord | null {
  if (!isDocument(stored)) return null
  const document = normalizeFieldDocument(stored, definition)
  if (!responsesEnabled(definition)) return document
  const template = responseTemplate(normalizeFieldDocument(definitionContent, definition))
  const adopted = adopt(template, document, false)
  if (matches(template, adopted, "career")) return adopted
  return editedCopy(stored) ? editedResponses(template, document, false, false) : followCurrent(template, document)
}

export function writable(definitionContent: unknown, definition: TemplateDefinition): boolean {
  return spaces(responseTemplate(normalizeFieldDocument(definitionContent, definition)))
}

export function openTemplate(template: unknown): boolean {
  const type = nodeType(template)
  if (type === "tableHeader") return false
  if (type === RESPONSE_NODE) return !responseAnswered(given(template, "attrs") ?? [])
  return blank(template) || type === "documentBlock" || content(template).some(openTemplate)
}

export function display(value: unknown, definition: TemplateDefinition): string {
  if (isDocument(value)) return plainText(value, definition)
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (isScalar(value)) return phpString(value)
  if (isPhpArray(value)) return list(value).map((item) => display(item, definition)).join(" · ")
  return ""
}

function listNode(node: PhpRecord, items: string[]): PhpRecord {
  const style = at(node.attrs, "listStyle")
  return {
    type: style === "number" ? "orderedList" : "bulletList",
    content: items
      .filter((item) => item.trim() !== "")
      .map((text) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text, marks: given(node, "marks") ?? [] }] }] })),
  }
}

function flattenItems(items: unknown[]): unknown[] {
  const flat: unknown[] = []
  for (const item of items) {
    const children = content(item)
    if (nodeType(item) === "listItem" && children.length === 1 && ["bulletList", "orderedList"].includes(nodeType(children[0]))) {
      flat.push(...content(children[0]))
      continue
    }
    flat.push(item)
  }
  return flat
}

export function resolveDocument(document: PhpRecord, variables: Record<string, string>, definition: TemplateDefinition, fields: PhpRecord[] = []): PhpRecord {
  const byKey = new Map(fields.map((field) => [phpString(field.key), field.hidden === true ? { ...field, value: null } : field]))
  const visit = (node: PhpRecord): PhpRecord[] => {
    const type = node.type
    const attrs = given(node, "attrs") ?? []
    if (type === "documentBlock") {
      return expandBlock(node, variables, definition).flatMap((expanded) => list(resolveDocument({ type: "doc", content: [expanded] }, variables, definition).content) as PhpRecord[])
    }
    if (type === RESPONSE_NODE) {
      const lines: PhpRecord[] = []
      for (const line of responseLines(attrs)) {
        if (lines.length > 0) lines.push({ type: "hardBreak" })
        lines.push({ type: "text", text: line, marks: given(node, "marks") ?? [] })
      }
      return lines
    }
    if (type === "variable" || type === "field") {
      let value = ""
      if (type === "variable") {
        value = variables[phpString(at(attrs, "id"))] ?? ""
        if (given(attrs, "listStyle") !== null) {
          return [listNode(node, splitLines(value).map((line) => line.replace(/^\p{Nd}+\.\s+/u, "")))]
        }
      } else {
        const field: PhpRecord = byKey.get(phpString(at(attrs, "key"))) ?? {}
        if ((field.type ?? given(attrs, "kind")) === "texto_libre") {
          return isDocument(field.value) ? (list(record(field.value).content ?? []).filter(isPhpArray) as PhpRecord[]) : []
        }
        if (given(attrs, "listStyle") !== null) return [listNode(node, splitLines(display(field.value ?? null, definition)))]
        value = display(field.value ?? null, definition)
        if (given(attrs, "choice") !== null) value = value === at(attrs, "choice") ? "X" : ""
      }
      return [{ type: "text", text: value, marks: given(node, "marks") ?? [] }]
    }
    if (hasKey(node, "content") && node.content !== null) {
      const children = list(node.content).flatMap((child) => visit(record(child)))
      let next: PhpRecord = { ...node, content: children }
      if (type === "bulletList" || type === "orderedList") next = { ...next, content: flattenItems(children) }
      if (type === "paragraph") {
        const parts: PhpRecord[] = []
        let inline: PhpRecord[] = []
        for (const child of children) {
          if (["bulletList", "orderedList", "table", "paragraph"].includes(nodeType(child))) {
            if (inline.length > 0) {
              parts.push({ ...next, content: inline })
              inline = []
            }
            parts.push(child)
          } else {
            inline.push(child)
          }
        }
        if (parts.length > 0) {
          if (inline.length > 0) parts.push({ ...next, content: inline })
          return parts
        }
      }
      return [next]
    }
    return [node]
  }
  return visit(document)[0]
}

export function upgradeSchema(schema: PhpRecord): PhpRecord {
  let next: PhpRecord = { ...schema }
  const rename = (old: string, name: string) => {
    if (Object.prototype.hasOwnProperty.call(next, old)) {
      if (next[name] === undefined || next[name] === null) next[name] = next[old]
      next = without(next, [old])
    }
  }
  rename("label", "title")
  rename("error", "errorMessage")
  next = without(next, ["from"])
  if (next.type === "text") {
    next.type = "string"
    rename("max", "maxLength")
    if (next.required === true && (next.minLength === undefined || next.minLength === null)) next.minLength = 1
    next = without(next, ["required"])
  } else if (next.type === "choice") {
    next.type = "string"
    const options = isPhpArray(next.options) ? next.options : []
    if (next.oneOf === undefined || next.oneOf === null) {
      next.oneOf = Object.entries(Array.isArray(options) ? Object.fromEntries(options.map((title, index) => [String(index), title])) : options).map(([key, title]) => ({ const: key, title }))
    }
    next = without(next, ["options"])
  } else if (next.type === "number") {
    if (hasKey(next, "digits") || hasKey(next, "decimals")) {
      const digits = isInt(next.digits) ? next.digits : 3
      const decimals = isInt(next.decimals) ? next.decimals : 2
      const round = (value: number) => Number(value.toFixed(decimals))
      if (next.multipleOf === undefined || next.multipleOf === null) next.multipleOf = decimals > 0 ? round(10 ** -decimals) : 1
      if (next.maximum === undefined || next.maximum === null) next.maximum = decimals > 0 ? round(10 ** digits - 10 ** -decimals) : 10 ** digits - 1
      next = without(next, ["digits", "decimals"])
    }
  } else if (next.type === "object") {
    rename("fields", "properties")
  } else if (next.type === "list") {
    next.type = "array"
    rename("item", "items")
    rename("min", "minItems")
    rename("max", "maxItems")
    if (isPhpArray(next.items) && given(next.items, "type") === null) next.items = { type: "object", properties: next.items }
  }
  if (isPhpArray(next.properties)) next.properties = upgradeAll(next.properties)
  if (isPhpArray(next.items)) next.items = upgradeSchema(record(next.items))
  return next
}

export function upgradeAll(fields: unknown[] | PhpRecord): unknown[] | PhpRecord {
  if (Array.isArray(fields)) return fields.map((schema) => (isPhpArray(schema) ? upgradeSchema(record(schema)) : schema))
  return Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, isPhpArray(schema) ? upgradeSchema(record(schema)) : schema]))
}

export function trustedDefinition(stored: PhpRecord): TemplateDefinition {
  const definition: PhpRecord = { ...stored }
  if (isRecord(stored.blocks)) {
    const blocks: PhpRecord = {}
    for (const [kind, block] of Object.entries(stored.blocks)) {
      let next = block
      for (const part of ["props", "value"]) {
        const fields = at(next, part)
        if (isPhpArray(fields)) next = { ...record(next), [part]: upgradeAll(fields) }
      }
      blocks[kind] = next
    }
    definition.blocks = blocks
  }
  return {
    ...definition,
    document: record(definition.document),
    variables: record(definition.variables) as Record<string, PhpRecord>,
    blocks: record(definition.blocks) as Record<string, PhpRecord>,
  } as TemplateDefinition
}

export function fieldConditions(definition: TemplateDefinition): Record<string, PhpRecord> {
  const conditions: Record<string, PhpRecord> = {}
  const raw = definition.field_conditions
  for (const [key, condition] of Object.entries(isPhpArray(raw) ? (Array.isArray(raw) ? { ...raw } : raw) : {})) {
    if (isPhpArray(condition) && typeof at(condition, "response") === "string" && isPhpArray(at(condition, "options"))) {
      conditions[key] = { response: at(condition, "response"), options: list(at(condition, "options")).filter((option) => typeof option === "string") }
    }
  }
  return conditions
}

export const FIELD_LIMIT_MIN = 1
export const FIELD_LIMIT_MAX = 50000

export function fieldLimits(definition: TemplateDefinition): Record<string, number> {
  const limits: Record<string, number> = {}
  const raw = definition.field_limits
  for (const [key, limit] of Object.entries(isPhpArray(raw) ? (Array.isArray(raw) ? { ...raw } : raw) : {})) {
    if (isInt(limit) && limit >= FIELD_LIMIT_MIN && limit <= FIELD_LIMIT_MAX) limits[key] = limit
  }
  return limits
}

export function limitAllowed(responsible: string): boolean {
  return (["docente", "coordinacion"].includes(responsible) ? CAREER : responsible) === CAREER
}

export function withoutOwnOptionsDocument(document: PhpRecord): PhpRecord {
  return record(withoutOwnOptions(document))
}

function answeredAgainst(template: unknown, value: unknown, definition: TemplateDefinition): boolean {
  if (nodeType(template) === RESPONSE_NODE) return !responseAnswered(given(template, "attrs") ?? []) && responseAnswered(given(value, "attrs") ?? [])
  if (blank(template) || nodeType(template) === "documentBlock") {
    return phpTrim(plainText({ type: "doc", content: [value] }, definition)) !== ""
  }
  const rows = content(template)
  const repeats = nodeType(template) === "table" && listTable(template)
  return content(value).some((child, index) => {
    const source = index < rows.length ? rows[index] : repeats && rows.length > 0 ? rows[rows.length - 1] : null
    return isPhpArray(source) && answeredAgainst(source, child, definition)
  })
}

export function responseIsEmpty(source: unknown, held: unknown, definition: TemplateDefinition): boolean {
  const templateContent = openShape(source)
  const value = writtenValue(source, held)
  if (!responsesEnabled(definition)) return !isDocument(value) || phpTrim(plainText(value, definition)) === ""
  if (!isDocument(value)) return true
  return !answeredAgainst(responseTemplate(record(templateContent)), value, definition)
}

function ownFrom(template: unknown, value: PhpRecord, own: unknown): PhpRecord {
  const type = nodeType(template)
  if (type !== nodeType(value) || type !== nodeType(own)) return value
  if (type === RESPONSE_NODE) {
    const attrs = given(value, "attrs") ?? []
    const ownAttrs = at(own, "attrs")
    if (at(ownAttrs, OWN_OPTIONS) !== true || !phpIdentical(given(attrs, "options") ?? [], given(at(template, "attrs"), "options") ?? [])) return value
    return { ...value, attrs: responseAttrs({ ...record(attrs), options: given(ownAttrs, "options") ?? [], [OWN_OPTIONS]: true }) }
  }
  if (type === "tableHeader" || type === "documentBlock" || blank(template)) return value
  const expected = [...content(template)]
  const actual = content(value)
  let mine = [...content(own)]
  if (type === "table" && listTable(template) && mine.length > 0) {
    const row = expected[expected.length - 1]
    const last = mine[mine.length - 1]
    while (expected.length < actual.length) expected.push(row)
    while (mine.length < actual.length) mine.push(last)
    mine = mine.slice(0, actual.length)
  }
  if (expected.length === 0 || expected.length !== actual.length || mine.length !== actual.length) return value
  return { ...value, content: expected.map((child, index) => ownFrom(child, record(actual[index]), mine[index])) }
}

export function keepOwnOptions(definitionContent: unknown, document: PhpRecord, stored: unknown, definition: TemplateDefinition, attribute = "value"): PhpRecord {
  if (!responsesEnabled(definition) || !isDocument(stored)) return document
  const template = responseTemplate(normalizeFieldDocument(definitionContent, definition, "value"))
  return within(attribute, () => ownFrom(template, document, templateFor(definitionContent, stored, definition)))
}
