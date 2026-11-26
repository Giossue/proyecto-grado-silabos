import { canonicalJson } from "../documents/canonicalJson"
import { BLOCK_KEYS, CATALOG_FIELDS, defineBlock, given, isInt, MULTIPLES } from "./blockDefinition"
import { documentLines } from "./documentHtml"
import { legacyUnitsBlock } from "./legacyUnits"
import officialJson from "./officialTemplate.json"
import { isList, isPhpArray, isRecord, list, phpCount, phpString, record, type PhpRecord } from "./phpValues"
import { TemplateValidationError } from "./templateRuntime"
import { definitionError } from "./templateStyle"

const SHORT_BLOCK_KEYS = ["titulo", "propiedades", "campos", "reglas", "catalogo", "diseño"]
const TEXT = "texto"
const LONG_TEXT = "texto largo"
const NUMBER = "número"
const HOURS = "horas"
const YES_NO = "sí/no"
const TYPES_HINT = "use «texto», «texto largo», «número», «horas» o «sí/no»."
const YES_NO_OPTIONS = [
  { const: "si", title: "Sí" },
  { const: "no", title: "No" },
]
const TEXT_MAX = 1000
const NUMBER_MAX = 999.99
const NUMBER_DECIMALS = 2
const SHARED: [string, string][] = [
  ["titulo", "title"],
  ["error", "errorMessage"],
  ["solo_si", "keep_if"],
]
const LEAF_KEYS: Record<string, string[]> = {
  [TEXT]: ["tipo", "max", "min"],
  [LONG_TEXT]: ["tipo", "max", "min"],
  [NUMBER]: ["tipo", "max", "decimales"],
  [HOURS]: ["tipo", "max", "decimales"],
  [YES_NO]: ["tipo"],
}
const CATALOG_NAMES: Record<string, string> = {
  author: "autor",
  title: "titulo",
  year: "anio",
  place: "ciudad",
  publisher: "editorial",
  isbn: "isbn",
  format: "codigo",
}
const CATALOG_FIELD_OF: Record<string, string> = Object.fromEntries(Object.entries(CATALOG_NAMES).map(([field, name]) => [name, field]))
const NAMES: Record<string, string> = {
  title: "titulo",
  errorMessage: "error",
  keep_if: "solo_si",
  maxLength: "max",
  maximum: "max",
  minLength: "min",
  multipleOf: "decimales",
  multiline: "tipo",
  type: "tipo",
  oneOf: "opciones",
  minItems: "filas",
  maxItems: "filas",
  initial: "al_empezar",
  items: "columnas",
  properties: "campos",
}

type RouteKind = "plain" | "full" | "leaf" | "list" | "object"
type Route = [internal: string, short: string, kind: RouteKind]

export const RULE_CATALOG: Record<string, PhpRecord> = Object.fromEntries(
  Object.values(officialJson.blocks as Record<string, unknown>)
    .flatMap((block) => list(given(block, "rules") ?? []))
    .map((rule) => [phpString(given(rule, "code")), record(rule)]),
)

function has(value: unknown, key: string): boolean {
  return given(value, key) !== null
}

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((_, index) => String(index))
  return isRecord(value) ? Object.keys(value) : []
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function sharedOf(schema: PhpRecord): PhpRecord {
  return Object.fromEntries(SHARED.filter(([, name]) => has(schema, name)).map(([short, name]) => [short, schema[name]]))
}

function leaf(type: string, extras: PhpRecord): unknown {
  if (Object.keys(extras).length === 0) return type
  return type === TEXT ? extras : { tipo: type, ...extras }
}

function shortFields(fields: unknown): PhpRecord {
  return Object.fromEntries(Object.entries(record(fields)).map(([key, schema]) => [key, shortSchema(record(schema))]))
}

function shortSchema(schema: PhpRecord): unknown {
  const shared = sharedOf(schema)
  if (schema.type === "string" && has(schema, "oneOf")) {
    if (same(schema.oneOf, YES_NO_OPTIONS)) return leaf(YES_NO, shared)
    return { ...shared, opciones: Object.fromEntries(list(schema.oneOf).map((option) => [phpString(given(option, "const")), given(option, "title")])) }
  }
  if (schema.type === "string") {
    return leaf(schema.multiline === true ? LONG_TEXT : TEXT, {
      ...shared,
      ...(schema.maxLength !== TEXT_MAX ? { max: schema.maxLength } : {}),
      ...(has(schema, "minLength") ? { min: schema.minLength } : {}),
    })
  }
  if (schema.type === "number") {
    if (schema.maximum === NUMBER_MAX && schema.multipleOf === MULTIPLES[NUMBER_DECIMALS]) return leaf(HOURS, shared)
    return leaf(NUMBER, {
      ...shared,
      ...(schema.maximum !== NUMBER_MAX ? { max: schema.maximum } : {}),
      ...(schema.multipleOf !== MULTIPLES[NUMBER_DECIMALS] ? { decimales: MULTIPLES.indexOf(Number(schema.multipleOf)) } : {}),
    })
  }
  if (schema.type === "object") return { ...shared, campos: shortFields(schema.properties) }
  const items = record(schema.items)
  if (schema.type === "array" && items.type === "object" && Object.keys(items).every((key) => key === "type" || key === "properties")) {
    return {
      ...(has(shared, "titulo") ? { titulo: shared.titulo } : {}),
      filas: `${phpString(schema.minItems)}-${phpString(schema.maxItems)}`,
      ...(schema.initial !== schema.minItems ? { al_empezar: schema.initial } : {}),
      ...shared,
      columnas: shortFields(items.properties),
    }
  }
  return schema
}

function shortRule(rule: unknown): unknown {
  const code = phpString(given(rule, "code"))
  return Object.prototype.hasOwnProperty.call(RULE_CATALOG, code) && same(rule, RULE_CATALOG[code]) ? code : rule
}

function shortCatalogColumns(map: unknown): unknown {
  if (!isRecord(map)) return map
  return Object.fromEntries(Object.entries(map).map(([field, column]) => [CATALOG_NAMES[field] ?? field, column]))
}

export function shortBlock(block: PhpRecord): PhpRecord {
  const catalog = given(block, "catalog")
  return {
    titulo: block.label,
    ...(phpCount(block.props ?? []) !== 0 ? { propiedades: shortFields(block.props) } : {}),
    ...(phpCount(block.value ?? []) !== 0 ? { campos: shortFields(block.value) } : {}),
    ...(phpCount(block.rules ?? []) !== 0 ? { reglas: list(block.rules).map(shortRule) } : {}),
    ...(catalog !== null ? { catalogo: { lista: given(catalog, "list"), columnas: shortCatalogColumns(given(catalog, "map")) } } : {}),
    diseño: documentLines({ type: "doc", content: block.layout }),
  }
}

export function isShortBlock(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  const keys = Object.keys(raw)
  return keys.some((key) => SHORT_BLOCK_KEYS.includes(key)) && !keys.some((key) => BLOCK_KEYS.includes(key))
}

function onlyKeys(raw: PhpRecord, allowed: string[], where: string): void {
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) definitionError(`${where}: clave desconocida «${unknown.join("», «")}».`)
}

function sharedFrom(raw: PhpRecord): PhpRecord {
  return Object.fromEntries(SHARED.filter(([short]) => has(raw, short)).map(([short, name]) => [name, raw[short]]))
}

function rows(raw: unknown, where: string): PhpRecord {
  if (raw === null || raw === undefined) return {}
  const match = typeof raw === "string" ? /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/.exec(raw) : null
  if (match === null) definitionError(`${where}: escriba el mínimo y el máximo de filas, por ejemplo «1-8».`)
  return { minItems: Number(match[1]), maxItems: Number(match[2]) }
}

function multipleOf(raw: unknown, where: string): number {
  if (!isInt(raw) || raw < 0 || raw >= MULTIPLES.length) definitionError(`${where}: use un número entero de 0 a ${MULTIPLES.length - 1}.`)
  return MULTIPLES[raw]
}

function leafSchema(type: unknown, raw: PhpRecord, where: string, typeWhere: string): PhpRecord {
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(LEAF_KEYS, type)) definitionError(`${typeWhere}: ${TYPES_HINT}`)
  onlyKeys(raw, [...SHARED.map(([short]) => short), ...LEAF_KEYS[type]], where)
  const shared = sharedFrom(raw)
  if (type === YES_NO) return { type: "string", ...shared, oneOf: structuredClone(YES_NO_OPTIONS) }
  if (type === NUMBER || type === HOURS) {
    return {
      type: "number",
      ...shared,
      ...(has(raw, "max") ? { maximum: raw.max } : {}),
      ...(has(raw, "decimales") ? { multipleOf: multipleOf(raw.decimales, `${where}.decimales`) } : {}),
    }
  }
  return {
    type: "string",
    ...shared,
    ...(has(raw, "max") ? { maxLength: raw.max } : {}),
    ...(has(raw, "min") ? { minLength: raw.min } : {}),
    multiline: type === LONG_TEXT,
  }
}

function expandSchema(raw: unknown, internal: string, short: string, routes: Route[]): unknown {
  if (typeof raw === "string") {
    routes.push([internal, short, "leaf"])
    return leafSchema(raw, {}, short, short)
  }
  if (!isRecord(raw)) definitionError(`${short}: ${TYPES_HINT}`)
  if (has(raw, "type")) {
    routes.push([internal, short, "full"])
    return raw
  }
  const shared = SHARED.map(([key]) => key)
  if (has(raw, "columnas") || has(raw, "filas")) {
    onlyKeys(raw, [...shared, "filas", "al_empezar", "columnas"], short)
    routes.push([internal, short, "list"])
    if (!has(raw, "columnas")) definitionError(`${short}.columnas: escriba las columnas de cada fila.`)
    return {
      type: "array",
      ...sharedFrom(raw),
      ...rows(given(raw, "filas"), `${short}.filas`),
      ...(has(raw, "al_empezar") ? { initial: raw.al_empezar } : {}),
      items: { type: "object", properties: expandFields(raw.columnas, `${internal}.items.properties`, `${short}.columnas`, routes) },
    }
  }
  if (has(raw, "campos")) {
    onlyKeys(raw, [...shared, "campos"], short)
    routes.push([internal, short, "object"])
    return { type: "object", ...sharedFrom(raw), properties: expandFields(raw.campos, `${internal}.properties`, `${short}.campos`, routes) }
  }
  if (has(raw, "opciones")) {
    onlyKeys(raw, [...shared, "opciones"], short)
    routes.push([internal, short, "leaf"])
    const options = raw.opciones
    if (!isRecord(options) || Object.keys(options).length === 0) definitionError(`${short}.opciones: escriba las opciones como {"clave": "Texto"}.`)
    return { type: "string", ...sharedFrom(raw), oneOf: Object.entries(options).map(([key, title]) => ({ const: key, title })) }
  }
  routes.push([internal, short, "leaf"])
  return leafSchema(given(raw, "tipo") ?? TEXT, raw, short, `${short}.tipo`)
}

function expandFields(raw: unknown, internal: string, short: string, routes: Route[]): PhpRecord | null {
  if (raw === null || raw === undefined) return null
  if (!isPhpArray(raw) || (isList(raw) && raw.length > 0)) definitionError(`${short}: debe ser un objeto con un dato por clave.`)
  routes.push([internal, short, "plain"])
  return Object.fromEntries(keysOf(raw).map((key) => [key, expandSchema(given(raw, key), `${internal}.${key}`, `${short}.${key}`, routes)]))
}

function expandRules(raw: unknown, where: string): unknown {
  if (raw === null || raw === undefined || !isList(raw)) return raw
  const names = Object.keys(RULE_CATALOG)
  return raw.map((rule, index) => {
    if (typeof rule !== "string") return rule
    if (!names.includes(rule)) {
      definitionError(`${where}.${index}: «${rule}» no es una regla conocida. Use ${names.slice(0, -1).join(", ")} o ${names[names.length - 1]}, o escriba la regla completa.`)
    }
    return structuredClone(RULE_CATALOG[rule])
  })
}

function expandCatalog(raw: unknown, where: string): unknown {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw) || Object.keys(raw).some((key) => key !== "lista" && key !== "columnas")) definitionError(`${where}: use «lista» y «columnas».`)
  return { list: given(raw, "lista"), map: catalogColumns(given(raw, "columnas"), `${where}.columnas`) }
}

function catalogColumns(raw: unknown, where: string): unknown {
  if (!isRecord(raw)) return raw
  const names = [...Object.values(CATALOG_NAMES), ...CATALOG_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(CATALOG_NAMES, field))]
  const map: PhpRecord = {}
  const written: Record<string, string> = {}
  for (const [key, column] of Object.entries(raw)) {
    const field = CATALOG_FIELD_OF[key] ?? key
    if (!CATALOG_FIELDS.includes(field)) definitionError(`${where}: «${key}» no es un dato del libro (${names.slice(0, -1).join(", ")} o ${names[names.length - 1]}).`)
    if (Object.prototype.hasOwnProperty.call(written, field)) definitionError(`${where}: «${written[field]}» y «${key}» son el mismo dato del libro.`)
    written[field] = key
    map[field] = column
  }
  return map
}

export function expandBlock(kind: string, raw: PhpRecord, routes: Route[] = []): PhpRecord {
  const where = `blocks.${kind}`
  const unknown = Object.keys(raw).filter((key) => !SHORT_BLOCK_KEYS.includes(key))
  if (unknown.length > 0) definitionError(`${where}: clave desconocida «${unknown.join("», «")}». Use titulo, propiedades, campos, reglas, catalogo y diseño.`)
  const pairs: [string, string][] = [
    ["label", "titulo"],
    ["layout", "diseño"],
    ["rules", "reglas"],
    ["catalog.list", "catalogo.lista"],
    ["catalog.map", "catalogo.columnas"],
    ["catalog", "catalogo"],
  ]
  for (const [internal, short] of pairs) routes.push([`${where}.${internal}`, `${where}.${short}`, "plain"])
  return {
    label: given(raw, "titulo"),
    props: expandFields(given(raw, "propiedades"), `${where}.props`, `${where}.propiedades`, routes),
    value: expandFields(given(raw, "campos"), `${where}.value`, `${where}.campos`, routes),
    rules: expandRules(given(raw, "reglas"), `${where}.reglas`),
    catalog: expandCatalog(given(raw, "catalogo"), `${where}.catalogo`),
    layout: given(raw, "diseño"),
  }
}

function translatedPath(path: string, routes: Route[]): string {
  let best: Route | null = null
  for (const route of routes) {
    if ((path === route[0] || path.startsWith(`${route[0]}.`)) && (best === null || route[0].length > best[0].length)) best = route
  }
  if (best === null) return path
  const rest = path.slice(best[0].length)
  if (rest === "" || best[2] === "plain" || best[2] === "full") return best[1] + rest
  let segments = rest.slice(1).split(".")
  if (best[2] === "list" && segments[0] === "items" && segments[1] === "properties") segments = ["columnas", ...segments.slice(2)]
  else segments[0] = NAMES[segments[0]] ?? segments[0]
  if (segments[0] === "opciones" || segments[0] === "tipo") segments = [segments[0]]
  return [best[1], ...segments].join(".")
}

function translated(message: string, routes: Route[]): string {
  const at = message.indexOf(": ")
  return at < 0 ? message : translatedPath(message.slice(0, at), routes) + message.slice(at)
}

export function defineAnyBlock(kind: string, input: unknown, variables: string[]): PhpRecord {
  const raw = legacyUnitsBlock(kind, input)
  if (!isShortBlock(raw)) return defineBlock(kind, raw, variables)
  const routes: Route[] = []
  const expanded = expandBlock(kind, record(raw), routes)
  try {
    return defineBlock(kind, expanded, variables)
  } catch (error) {
    if (!(error instanceof TemplateValidationError)) throw error
    throw new TemplateValidationError(Object.fromEntries(Object.entries(error.errors).map(([key, messages]) => [key, messages.map((message) => translated(message, routes))])))
  }
}
