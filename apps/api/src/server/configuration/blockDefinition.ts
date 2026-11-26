import { segments } from "@silabos/shared/lib/blocks/scope"
import { documentFromHtml } from "./documentHtml"
import { isList, isPhpArray, isRecord, isScalar, list, mbStrlen, phpCount, phpString, phpTrim, record, type PhpRecord } from "./phpValues"
import { definitionError } from "./templateStyle"
import { normalizeTemplateDocument, TemplateValidationError, upgradeSchema, type LayoutRules as DocumentLayoutRules, type TemplateDefinition } from "./templateRuntime"

const KEY = /^[a-z][a-z0-9_]{0,40}$/
const KIND = /^[a-z][a-z0-9_]{0,40}$/
const CODE = /^[a-z][a-z0-9_]{0,60}$/
const NAME = /^[a-z][a-z0-9_]{0,40}$/
const PATH = /^(\{[a-z][a-z0-9_.]*\}|[a-z][a-z0-9_]*|\*)(\.(\{[a-z][a-z0-9_.]*\}|[a-z][a-z0-9_]*|\*))*$/
const TYPES = ["string", "number", "object", "array"]
export const MULTIPLES = [1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001]
const SLOT_SOURCES = ["value", "prop", "item", "counter", "sum", "count", "index"]
const CONDITION_SOURCES = ["value", "prop", "item", "variable"]
const CONDITION_TESTS = ["equals", "empty", "zero"]
const CATALOG_FIELDS = ["author", "title", "year", "place", "publisher", "isbn", "call_number", "format"]
export const BLOCK_KEYS = ["label", "props", "value", "rules", "layout", "catalog"]
const LAYOUT_ONLY: TemplateDefinition = { document: {}, variables: {}, blocks: {} }

export function pcreMatch(pattern: RegExp, subject: string): RegExpExecArray | null {
  return pattern.exec(subject) ?? (subject.endsWith("\n") ? pattern.exec(subject.slice(0, -1)) : null)
}

function at(value: unknown, key: string): unknown {
  if (isRecord(value)) return value[key]
  if (Array.isArray(value) && /^(0|[1-9]\d*)$/.test(key)) return value[Number(key)]
  return undefined
}

export function given(value: unknown, key: string): unknown {
  const found = at(value, key)
  return found === undefined ? null : found
}

function isset(value: unknown, key: string): boolean {
  return given(value, key) !== null
}

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((_, index) => String(index))
  return isRecord(value) ? Object.keys(value) : []
}

export function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

function text(value: unknown, where: string, max: number): string {
  if (typeof value !== "string" || phpTrim(value) === "" || mbStrlen(value) > max) definitionError(`${where}: escriba un texto de hasta ${max} caracteres.`)
  return value
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!isInt(value) || value < min || value > max) definitionError(`${where}: debe ser un número entero entre ${min} y ${max}.`)
  return value
}

function boolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") definitionError(`${where}: debe ser true o false.`)
  return value
}

export function defineBlockCondition(raw: unknown, where: string): PhpRecord {
  if (!isRecord(raw)) definitionError(`${where}: escriba la condición como objeto.`)
  const keys = Object.keys(raw)
  const sources = CONDITION_SOURCES.filter((source) => keys.includes(source))
  const tests = CONDITION_TESTS.filter((test) => keys.includes(test))
  if (sources.length !== 1 || tests.length !== 1 || keys.length !== 2) {
    definitionError(`${where}: use una fuente (${CONDITION_SOURCES.join(", ")}) y una prueba (${CONDITION_TESTS.join(", ")}).`)
  }
  const [source, test] = [sources[0], tests[0]]
  const path = raw[source]
  if (typeof path !== "string" || phpTrim(path) === "") definitionError(`${where}.${source}: escriba una ruta o una clave.`)
  if (test !== "equals" && typeof raw[test] !== "boolean") definitionError(`${where}.${test}: debe ser true o false.`)
  if (test === "equals" && !isScalar(raw[test]) && raw[test] !== null) definitionError(`${where}.equals: debe ser un texto, un número o null.`)
  return { [source]: path, [test]: raw[test] }
}

function options(raw: unknown, where: string): PhpRecord[] {
  if (!isPhpArray(raw) || phpCount(raw) === 0 || !isList(raw)) definitionError(`${where}: escriba las opciones como [{"const": "clave", "title": "Texto"}].`)
  const seen = new Set<string>()
  return list(raw).map((option, index) => {
    const key = isPhpArray(option) ? given(option, "const") : null
    if (typeof key !== "string" || !pcreMatch(KEY, key) || seen.has(key)) definitionError(`${where}.${index}.const: use una clave única con minúsculas, números y _.`)
    seen.add(key)
    return { const: key, title: text(given(option, "title"), `${where}.${index}.title`, 120) }
  })
}

function numberSchema(schema: PhpRecord, where: string): PhpRecord {
  const multiple = given(schema, "multipleOf") ?? 0.01
  if (typeof multiple !== "number" || !MULTIPLES.includes(multiple)) definitionError(`${where}.multipleOf: use 1, 0.1, 0.01… hasta 0.000001.`)
  const maximum = given(schema, "maximum") ?? 999.99
  if (typeof maximum !== "number" || maximum <= 0 || maximum >= 1_000_000_000) {
    definitionError(`${where}.maximum: debe ser un número mayor que 0 y menor que 1 000 000 000.`)
  }
  return { multipleOf: multiple, maximum }
}

function arraySchema(schema: PhpRecord, where: string): PhpRecord {
  const min = integer(given(schema, "minItems") ?? 0, `${where}.minItems`, 0, 100)
  const max = integer(given(schema, "maxItems") ?? 100, `${where}.maxItems`, Math.max(1, min), 100)
  const items = given(schema, "items")
  if (!isPhpArray(items)) definitionError(`${where}.items: falta el esquema de cada elemento.`)
  return {
    minItems: min,
    maxItems: max,
    initial: integer(given(schema, "initial") ?? min, `${where}.initial`, min, max),
    items: schemaOf(items, `${where}.items`, false),
  }
}

function schemaOf(schema: unknown, where: string, props: boolean): PhpRecord {
  const type = isPhpArray(schema) ? given(schema, "type") : null
  if (!isPhpArray(schema) || typeof type !== "string" || !TYPES.includes(type)) definitionError(`${where}: «type» debe ser uno de ${TYPES.join(", ")}.`)
  const raw = record(schema)
  if (props && (type !== "string" || isset(raw, "oneOf"))) definitionError(`${where}: las propiedades solo admiten texto («string»).`)
  const clean: PhpRecord = { type }
  for (const name of ["title", "errorMessage"]) {
    if (isset(raw, name)) clean[name] = text(raw[name], `${where}.${name}`, 300)
  }
  if (isset(raw, "keep_if")) clean.keep_if = defineBlockCondition(raw.keep_if, `${where}.keep_if`)
  if (type === "string") {
    if (isset(raw, "oneOf")) return { ...clean, oneOf: options(raw.oneOf, `${where}.oneOf`) }
    return {
      ...clean,
      maxLength: integer(given(raw, "maxLength") ?? 1000, `${where}.maxLength`, 1, 20000),
      ...(isset(raw, "minLength") ? { minLength: integer(raw.minLength, `${where}.minLength`, 0, 1) } : {}),
      multiline: boolean(given(raw, "multiline") ?? false, `${where}.multiline`),
    }
  }
  if (type === "number") return { ...clean, ...numberSchema(raw, where) }
  if (type === "object") return { ...clean, properties: defineValueSchema(given(raw, "properties"), `${where}.properties`) }
  return { ...clean, ...arraySchema(raw, where) }
}

export function defineValueSchema(fields: unknown, where: string, props = false): PhpRecord {
  if (fields === null || fields === undefined) return {}
  if (!isPhpArray(fields) || (isList(fields) && fields.length > 0)) definitionError(`${where}: debe ser un objeto con un esquema por clave.`)
  const clean: PhpRecord = {}
  for (const key of keysOf(fields)) {
    if (!pcreMatch(KEY, key)) definitionError(`${where}: la clave «${key}» debe usar minúsculas, números y _.`)
    const schema = at(fields, key)
    clean[key] = schemaOf(isPhpArray(schema) ? upgradeSchema(record(schema)) : schema, `${where}.${key}`, props)
  }
  return clean
}

export function valueSchemaAt(fields: unknown, path: string): PhpRecord | null {
  let schema: PhpRecord = { type: "object", properties: fields }
  for (const segment of segments(path)) {
    if (segment === "*") {
      if (schema.type !== "array") return null
      schema = record(schema.items)
      continue
    }
    if (schema.type !== "object" || !isset(schema.properties, segment)) return null
    schema = record(at(schema.properties, segment))
  }
  return schema
}

export function schemaOptionTitle(schema: unknown, value: unknown): string {
  for (const option of list(given(schema, "oneOf") ?? [])) {
    if (given(option, "const") === value) return phpString(given(option, "title"))
  }
  return ""
}

function ruleCheck(raw: unknown, where: string, value: PhpRecord, variables: string[]): PhpRecord {
  if (!isPhpArray(raw)) definitionError(`${where}: escriba la comprobación como objeto.`)
  const keys = keysOf(raw)
  const measures = ["count", "filled", "sum"].filter((key) => keys.includes(key))
  const comparisons = ["equals", "max", "min"].filter((key) => keys.includes(key))
  if (measures.length !== 1 || comparisons.length !== 1) definitionError(`${where}: use «count», «filled» o «sum» y una comparación: equals, max o min.`)
  const path = at(raw, measures[0])
  if (typeof path !== "string" || valueSchemaAt(value, path) === null) {
    definitionError(`${where}.${measures[0]}: «${typeof path === "string" ? path : ""}» no existe en el valor del bloque.`)
  }
  const target = at(raw, comparisons[0])
  if (isPhpArray(target)) {
    const variable = given(target, "variable")
    const counted = given(target, "count")
    const byVariable = typeof variable === "string" && variables.includes(variable)
    const byCount = typeof counted === "string" && valueSchemaAt(value, counted) !== null
    if (phpCount(target) !== 1 || (!byVariable && !byCount)) {
      definitionError(`${where}.${comparisons[0]}: use un número, {"variable": "clave"} del catálogo o {"count": "lista"} del valor.`)
    }
  } else if (typeof target !== "number") {
    definitionError(`${where}.${comparisons[0]}: use un número, {"variable": "clave"} o {"count": "lista"}.`)
  }
  const check: PhpRecord = { [measures[0]]: path, [comparisons[0]]: target }
  if (isset(raw, "label")) {
    const label = at(raw, "label")
    if (typeof label !== "string" || phpTrim(label) === "" || mbStrlen(label) > 60) definitionError(`${where}.label: escriba un nombre corto.`)
    check.label = label
  }
  return check
}

export function defineBlockRules(raw: unknown, where: string, value: PhpRecord, variables: string[]): PhpRecord[] {
  if (raw === null || raw === undefined) return []
  if (!isPhpArray(raw) || !isList(raw)) definitionError(`${where}: las reglas son una lista.`)
  const codes: string[] = []
  return list(raw).map((rule, index) => {
    const where_ = `${where}.${index}`
    const code = isPhpArray(rule) ? given(rule, "code") : null
    if (typeof code !== "string" || !pcreMatch(CODE, code) || codes.includes(code)) definitionError(`${where_}.code: escriba un código único en minúsculas.`)
    codes.push(code)
    const on = given(rule, "on")
    if (on !== "save" && on !== "submit") definitionError(`${where_}.on: use «save» (se rechaza al guardar) o «submit» (impide enviar).`)
    const message = given(rule, "message")
    if (typeof message !== "string" || phpTrim(message) === "" || mbStrlen(message) > 500) definitionError(`${where_}.message: escriba el mensaje (hasta 500 caracteres).`)
    const checks = given(rule, "checks")
    if (!isPhpArray(checks) || !isList(checks) || phpCount(checks) === 0) definitionError(`${where_}.checks: escriba al menos una comprobación.`)
    const hint = given(rule, "hint")
    return {
      code,
      on,
      message,
      checks: list(checks).map((check, position) => ruleCheck(check, `${where_}.checks.${position}`, value, variables)),
      ...(typeof hint === "string" && phpTrim(hint) !== "" ? { hint } : {}),
    }
  })
}

export function defineBlockCatalog(raw: unknown, where: string, value: PhpRecord): PhpRecord | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw) || Object.keys(raw).some((key) => key !== "list" && key !== "map")) definitionError(`${where}: use «list» y «map».`)
  const listKey = given(raw, "list")
  const items = typeof listKey === "string" ? given(value, listKey) : null
  if (given(items, "type") !== "array" || given(given(items, "items"), "type") !== "object") definitionError(`${where}.list: debe ser una lista de filas del bloque.`)
  const map = given(raw, "map")
  if (!isRecord(map)) definitionError(`${where}.map: indique qué dato del libro va a cada columna.`)
  for (const [field, column] of Object.entries(map)) {
    if (!CATALOG_FIELDS.includes(field)) definitionError(`${where}.map: «${field}» no es un dato del libro (${CATALOG_FIELDS.join(", ")}).`)
    const schema = typeof column === "string" ? given(given(given(items, "items"), "properties"), column) : null
    if (given(schema, "type") !== "string" || isset(schema, "oneOf")) definitionError(`${where}.map.${field}: debe ser una columna de texto de la lista.`)
  }
  return { list: listKey, map }
}

class LayoutRules implements DocumentLayoutRules {
  constructor(readonly where: string) {}

  directives(attrs: unknown[] | PhpRecord, type: string): PhpRecord {
    const clean: PhpRecord = {}
    if (isset(attrs, "repeat")) clean.repeat = this.repeat(at(attrs, "repeat"))
    if (isset(attrs, "when")) clean.when = defineBlockCondition(at(attrs, "when"), `${this.where}.when`)
    if (isset(attrs, "band")) {
      const band = at(attrs, "band")
      if (type !== "tableRow" || typeof band !== "string" || !/^#[0-9a-fA-F]{6}$/.test(band)) {
        definitionError(`${this.where}: «band» solo va en una fila (tr) y es un color #RRGGBB.`)
      }
      clean.band = band.toUpperCase()
    }
    return clean
  }

  private repeat(raw: unknown): PhpRecord {
    if (!isRecord(raw)) definitionError(`${this.where}.repeat: escriba {"value": "lista"}.`)
    if (!isset(raw, "value") || Object.keys(raw).some((key) => !["value", "as", "at_least"].includes(key))) {
      definitionError(`${this.where}.repeat: use «value», y opcionalmente «as» y «at_least».`)
    }
    const path = raw.value
    if (typeof path !== "string" || !pcreMatch(PATH, path) || path.includes("*")) definitionError(`${this.where}.repeat: «value» debe ser una ruta sin *.`)
    const clean: PhpRecord = { value: path }
    if (isset(raw, "as")) {
      if (typeof raw.as !== "string" || !pcreMatch(NAME, raw.as)) definitionError(`${this.where}.repeat.as: use minúsculas, números y _.`)
      clean.as = raw.as
    }
    if (isset(raw, "at_least")) {
      if (!isInt(raw.at_least) || raw.at_least < 0 || raw.at_least > 100) definitionError(`${this.where}.repeat.at_least: debe ser un entero entre 0 y 100.`)
      clean.at_least = raw.at_least
    }
    return clean
  }

  slot(attrs: unknown[] | PhpRecord): PhpRecord {
    const keys = keysOf(attrs)
    const sources = SLOT_SOURCES.filter((source) => keys.includes(source))
    if (sources.length !== 1) definitionError(`${this.where}: cada dato usa una sola fuente: ${SLOT_SOURCES.join(", ")}.`)
    const source = sources[0]
    const extra = keys.filter((key) => key !== source && key !== "option" && key !== "mark")
    if (extra.length > 0 || ((isset(attrs, "option") || isset(attrs, "mark")) && source !== "value")) {
      definitionError(`${this.where}: «option» y «mark» solo acompañan a «value».`)
    }
    if (source === "index") {
      if (at(attrs, "index") !== true) definitionError(`${this.where}: escriba "index": true.`)
      return { index: true }
    }
    const path = at(attrs, source)
    const pattern = source === "counter" ? NAME : PATH
    if (typeof path !== "string" || !pcreMatch(pattern, path) || (path.includes("*") && source !== "sum" && source !== "count")) {
      definitionError(`${this.where}: la ruta del dato «${source}» no es válida.`)
    }
    const clean: PhpRecord = { [source]: path }
    for (const key of ["option", "mark"]) {
      if (!isset(attrs, key)) continue
      const value = at(attrs, key)
      if (typeof value !== "string" || value === "" || mbStrlen(value) > 40) definitionError(`${this.where}: «${key}» debe ser un texto corto.`)
      clean[key] = value
    }
    return clean
  }
}

function layoutSchemaAt(schema: PhpRecord, path: string): PhpRecord | null {
  return schema.type === "object" ? valueSchemaAt(schema.properties, path) : null
}

function checkSlot(attrs: unknown, schema: PhpRecord, props: PhpRecord, aliases: Set<string>, where: string): void {
  const source = given(attrs, "value") ?? given(attrs, "sum") ?? given(attrs, "count") ?? ""
  for (const segment of segments(phpString(source))) {
    if (segment.startsWith("{") && !aliases.has(segment.slice(1, -1).split(".")[0])) definitionError(`${where}: «${segment}» usa un nombre que no se definió con «as».`)
  }
  if (isset(attrs, "value")) {
    const value = phpString(given(attrs, "value"))
    const target = layoutSchemaAt(schema, value)
    if (target === null || target.type === "object" || target.type === "array") definitionError(`${where}: «${value}» no es un dato del valor del bloque.`)
    if (isset(attrs, "option") && schemaOptionTitle(target, given(attrs, "option")) === "") {
      definitionError(`${where}: «${phpString(given(attrs, "option"))}» no es una opción de «${value}».`)
    }
  }
  const prop = given(attrs, "prop")
  if (prop !== null && !isset(props, phpString(prop))) definitionError(`${where}: «${phpString(prop)}» no es una propiedad del bloque.`)
  const item = given(attrs, "item")
  if (item !== null && !aliases.has(phpString(item).split(".")[0])) definitionError(`${where}: «${phpString(item)}» usa un nombre que no se definió con «as».`)
  for (const aggregate of ["sum", "count"]) {
    const path = given(attrs, aggregate)
    if (path !== null && layoutSchemaAt(schema, phpString(path)) === null) definitionError(`${where}: «${phpString(path)}» no existe en el valor del bloque.`)
  }
}

function checkLayout(nodes: unknown[], schema: PhpRecord, props: PhpRecord, aliases: Set<string>, where: string): void {
  for (const node of nodes) {
    const attrs = given(node, "attrs") ?? []
    let inner = schema
    let innerAliases = aliases
    const repeat = given(attrs, "repeat")
    if (repeat !== null) {
      const value = phpString(given(repeat, "value"))
      const listSchema = layoutSchemaAt(schema, value)
      if (given(listSchema, "type") !== "array") definitionError(`${where}: «${value}» no es una lista del valor.`)
      const type = given(node, "type")
      if (Number(given(listSchema, "minItems")) < Number(given(listSchema, "maxItems")) && type !== "tableRow" && type !== "group") {
        definitionError(`${where}: la lista «${value}» cambia de tamaño y por eso se repite en una fila de tabla (tr) o en una sección (section).`)
      }
      inner = record(given(listSchema, "items"))
      const alias = given(repeat, "as")
      if (alias !== null) innerAliases = new Set([...aliases, phpString(alias)])
    }
    if (given(node, "type") === "slot") checkSlot(attrs, schema, props, aliases, where)
    const content = given(node, "content")
    if (content !== null) checkLayout(list(content), inner, props, innerAliases, where)
  }
}

export function defineBlockLayout(raw: unknown, where: string, value: PhpRecord, props: PhpRecord, variables: string[]): unknown[] {
  let document: PhpRecord
  if (typeof raw === "string" || (isList(raw) && raw.length > 0 && typeof raw[0] === "string")) document = documentFromHtml(raw, true)
  else if (isList(raw)) document = { type: "doc", content: raw }
  else definitionError(`${where}: el diseño es una lista de líneas HTML o de nodos.`)
  let normalized: PhpRecord
  try {
    normalized = normalizeTemplateDocument(document, variables, LAYOUT_ONLY, new LayoutRules(where))
  } catch (error) {
    if (error instanceof TemplateValidationError) definitionError(`${where}: ${Object.values(error.errors).flat()[0] ?? ""}`)
    throw error
  }
  checkLayout(list(normalized.content), { type: "object", properties: value }, props, new Set(), where)
  return list(normalized.content)
}

export function defineBlock(kind: string, raw: unknown, variables: string[]): PhpRecord {
  const where = `blocks.${kind}`
  if (!pcreMatch(KIND, kind)) definitionError(`${where}: el nombre del bloque usa minúsculas, números y _.`)
  if (!isRecord(raw)) definitionError(`${where}: escriba la definición del bloque como objeto.`)
  const unknown = Object.keys(raw).filter((key) => !BLOCK_KEYS.includes(key))
  if (unknown.length > 0) definitionError(`${where}: clave desconocida «${unknown.join("», «")}».`)
  const label = raw.label
  if (typeof label !== "string" || phpTrim(label) === "" || mbStrlen(label) > 120) definitionError(`${where}.label: escriba el nombre del bloque (hasta 120 caracteres).`)
  const props = defineValueSchema(given(raw, "props"), `${where}.props`, true)
  const value = defineValueSchema(given(raw, "value"), `${where}.value`)
  const catalog = defineBlockCatalog(given(raw, "catalog"), `${where}.catalog`, value)
  return {
    label,
    props,
    value,
    rules: defineBlockRules(given(raw, "rules"), `${where}.rules`, value, variables),
    layout: defineBlockLayout(given(raw, "layout"), `${where}.layout`, value, props, variables),
    ...(catalog === null ? {} : { catalog }),
  }
}
