import { defineBlock, given, isInt, pcreMatch, schemaOptionTitle } from "./blockDefinition"
import { isList, isPhpArray, isRecord, list, phpCount, phpIdentical, phpIntCast, phpString, phpToBool, record, type PhpRecord } from "./phpValues"
import { inheritsRows, withoutRowIds } from "./templateInheritance"
import { schemaDigits, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { definitionError } from "./templateStyle"

export { COLUMN_TYPES } from "@silabos/shared/schemas/template"
const LEGACY_HEADER_STYLE = "background:#C3D4EA;font-weight:bold"
const JSON_POINTER = "Para cambiarla use Más → Editar JSON."
const KEY = /^[a-z][a-z0-9_]{0,40}$/
const UNSUPPORTED_PIECES = "El diseño usa piezas que este editor no maneja (celdas combinadas, totales, contadores, condiciones o filas extra). "

const TRANSLITERATION: Record<string, string> = {
  ß: "ss", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ø: "o", Ø: "O", ł: "l", Ł: "L", đ: "d", Đ: "D", ħ: "h", Ħ: "H", ı: "i", ŉ: "n", ĳ: "ij", Ĳ: "IJ",
  ŀ: "l", Ŀ: "L", ſ: "s", þ: "th", Þ: "TH", ð: "d", Ð: "D", ﬀ: "ff", ﬁ: "fi", ﬂ: "fl", ﬃ: "ffi", ﬄ: "ffl", ﬅ: "st", ﬆ: "st", º: "o", ª: "a",
  "¹": "1", "²": "2", "³": "3",
}

export type TableDesign = { design: PhpRecord | null; reason: string | null }

function ascii(text: string): string {
  return [...text.normalize("NFD")]
    .map((character) => TRANSLITERATION[character] ?? character)
    .join("")
    .replace(/[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[^\x00-\x7F]/g, "")
}

function slug(title: string): string {
  return ascii(title)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/-+/g, "_")
    .replace(/@/g, "_at_")
    .toLowerCase()
    .replace(/[^_A-Za-z0-9\s]+/g, "")
    .replace(/[_\s]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function tableKey(name: string, fallback: string, used: unknown[]): string {
  let base = slug(name).replace(/^[0-9_]+/, "").slice(0, 36)
  if (base === "" || !pcreMatch(KEY, base)) base = fallback
  let key = base
  for (let number = 2; used.includes(key); number++) key = `${base}_${number}`
  return key
}

function multiple(decimals: number): number {
  return decimals <= 0 ? 1 : Number((10 ** -decimals).toFixed(decimals))
}

function canonical(value: unknown): unknown {
  if (!isPhpArray(value)) return value
  if (isList(value)) return value.map(canonical)
  const sorted = Object.keys(value).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  return Object.fromEntries(sorted.map((key) => [key, canonical(value[key])]))
}

function signature(column: PhpRecord): unknown {
  return canonical(Object.fromEntries(Object.entries(column).filter(([key]) => key !== "width" && key !== "required")))
}

function savedSignature(saved: unknown): unknown {
  const raw = given(saved, "signature")
  return canonical(isPhpArray(raw) ? raw : [])
}

function columnSchema(column: PhpRecord, index: number): PhpRecord {
  const base = { type: column.type === "number" ? "number" : "string", title: column.title }
  if (column.type === "choice") return { ...base, oneOf: list(given(column, "options") ?? []).map((option) => ({ const: given(option, "value"), title: given(option, "label") })) }
  if (column.type === "number") return { ...base, maximum: given(column, "maximum") ?? 999.99, multipleOf: multiple(phpIntCast(given(column, "decimals") ?? 2)) }
  if (column.type === "text") return { ...base, maxLength: given(column, "max_length") ?? 1000, multiline: phpToBool(given(column, "multiline") ?? false) }
  throw new TemplateValidationError({ [`columns.${index}.type`]: ["Elija el tipo de la columna."] })
}

function requiredColumn(rule: unknown, listKey: string): string | null {
  if (!isPhpArray(rule)) throw new Error("RepeatableTable::requiredColumn(): Argument #1 ($rule) must be of type array")
  const checks = given(rule, "checks")
  if (given(rule, "on") !== "submit" || !isPhpArray(checks) || phpCount(checks) !== 1) return null
  const check = given(checks, "0")
  if (!isPhpArray(check)) throw new Error("array_keys(): Argument #1 ($array) must be of type array")
  const extra = Object.keys(check).filter((key) => key !== "filled" && key !== "equals" && key !== "label")
  const filled = given(check, "filled")
  if (extra.length > 0 || !phpIdentical(given(check, "equals"), { count: listKey }) || typeof filled !== "string") return null
  const escaped = listKey.replace(/[.\\+*?[^\]$(){}=!<>|:\-#/]/g, "\\$&")
  return pcreMatch(new RegExp(`^${escaped}\\.\\*\\.([a-z][a-z0-9_]*)$`), filled)?.[1] ?? null
}

function tableRules(design: PhpRecord, extras: PhpRecord): unknown[] {
  const listKey = phpString(design.list)
  const required = new Map<string, PhpRecord>()
  for (const column of list(design.columns)) {
    if (phpToBool(given(column, "required") ?? false)) required.set(phpString(given(column, "key")), record(column))
  }
  const rules: unknown[] = []
  const covered = new Set<string>()
  for (const rule of isPhpArray(extras.rules) ? list(extras.rules) : []) {
    const column = isPhpArray(rule) ? requiredColumn(rule, listKey) : null
    if (column !== null) {
      if (required.has(column) && !covered.has(column)) {
        rules.push(rule)
        covered.add(column)
      }
      continue
    }
    rules.push(rule)
  }
  const codes = rules.map((rule) => {
    if (!isPhpArray(rule)) throw new Error("RepeatableTable::rules(): Argument #1 ($rule) must be of type array")
    return given(rule, "code")
  })
  for (const [key, column] of required) {
    if (covered.has(key)) continue
    const code = tableKey(`${key} obligatoria`, "columna_obligatoria", codes.filter((item) => typeof item === "string"))
    codes.push(code)
    const title = phpString(column.title)
    rules.push({
      code,
      on: "submit",
      message: `Llene «${title}» en cada ${design.item !== "" ? phpString(design.item) : "fila"}: {detail}.`,
      checks: [{ label: [...title].slice(0, 60).join(""), filled: `${listKey}.*.${key}`, equals: { count: listKey } }],
    })
  }
  return rules
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function tableLayout(design: PhpRecord, legacyHeaders = false): string[] {
  const style = legacyHeaders ? ` style="${LEGACY_HEADER_STYLE}"` : ""
  let headers = ""
  let cells = ""
  for (const raw of list(design.columns)) {
    const column = record(raw)
    const width = isInt(column.width) ? ` data-width="${column.width}"` : ""
    headers += `<th${width}${style}>${escapeHtml(phpString(column.title))}</th>`
    cells += `<td${width}><span data-slot='{"value":"${phpString(column.key)}"}'></span></td>`
  }
  const band = typeof design.band === "string" && design.band !== "" ? ` data-band="${design.band.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"` : ""
  return ["<table>", `<tr>${headers}</tr>`, `<tr data-repeat='{"value":"${phpString(design.list)}"}'${band}>${cells}</tr>`, "</table>"]
}

export function drawnLayout(listKey: string, columns: { key: string; title: string }[]): string[] {
  return tableLayout({ list: listKey, columns, band: null })
}

export function buildTable(raw: PhpRecord, legacyHeaders = false): PhpRecord {
  const design = designWithKeys(raw)
  const listKey = phpString(design.list)
  const extras = isPhpArray(design.extras) ? record(design.extras) : {}
  const columnErrors = isPhpArray(extras.column_errors) ? extras.column_errors : []
  const properties: PhpRecord = {}
  list(design.columns).forEach((raw, index) => {
    const column = record(raw)
    const schema = columnSchema(column, index)
    const saved = given(columnErrors, phpString(column.key))
    const message = given(saved, "message")
    if (isPhpArray(saved) && phpIdentical(savedSignature(saved), signature(column)) && typeof message === "string") schema.errorMessage = message
    properties[phpString(column.key)] = schema
  })
  const array: PhpRecord = { type: "array", minItems: design.min, maxItems: design.max, initial: design.initial, title: design.item }
  const listError = isPhpArray(extras.list_error) ? extras.list_error : null
  const listMessage = given(listError, "message")
  if (listError !== null && phpIdentical(savedSignature(listError), canonical([design.min, design.max, design.item])) && typeof listMessage === "string") array.errorMessage = listMessage
  array.items = { type: "object", properties }
  return {
    label: design.label,
    value: { [listKey]: array },
    rules: tableRules(design, extras),
    ...(isPhpArray(extras.catalog) ? { catalog: extras.catalog } : {}),
    layout: tableLayout(design, legacyHeaders),
  }
}

export function designWithKeys(raw: PhpRecord, taken: string[] = []): PhpRecord {
  const design: PhpRecord = { ...raw }
  const columns = list(raw.columns).map((column) => (isRecord(column) ? { ...column } : column))
  const used: unknown[] = []
  for (const column of columns) {
    const key = given(column, "key")
    if (typeof key === "string" && key !== "") used.push(key)
  }
  columns.forEach((column, index) => {
    const current = record(column)
    const key = given(current, "key")
    if (typeof key !== "string" || key === "") {
      const generated = tableKey(phpString(given(current, "title") ?? ""), "columna", used)
      used.push(generated)
      current.key = generated
    }
    if (given(current, "type") === "choice") {
      const values: unknown[] = []
      if (isPhpArray(current.options)) current.options = list(current.options).map((raw) => {
        const option: PhpRecord = { ...record(raw) }
        const value = given(option, "value")
        if (typeof value !== "string" || value === "") option.value = tableKey(phpString(given(option, "label") ?? ""), "opcion", values)
        values.push(option.value)
        return option
      })
    }
    columns[index] = current
  })
  design.columns = columns
  if (typeof design.list !== "string" || design.list === "") design.list = "filas"
  if (typeof design.kind !== "string" || design.kind === "") design.kind = tableKey(`tabla ${phpString(design.label ?? "")}`, "tabla", taken)
  return design
}

function unsupported(definition: PhpRecord): string | null {
  const props = given(definition, "props") ?? []
  if (!(isPhpArray(props) && phpCount(props) === 0)) return "La tabla usa propiedades que se llenan en cada aparición."
  const value = given(definition, "value") ?? []
  if (inheritsRows(value)) return "La tabla toma sus filas de otra tabla («filas_desde») y este editor todavía no puede cambiar esa relación."
  if (isPhpArray(value) && phpCount(value) === 0) return "No tiene datos que llene el docente: es una tabla fija."
  const only = phpCount(value) === 1 ? list(value)[0] : null
  if (!isPhpArray(only) || given(only, "type") !== "array" || given(given(only, "items"), "type") !== "object") return "No es una sola lista de filas."
  if (given(only, "keep_if") !== null) return "La lista usa condiciones."
  for (const schema of list(given(given(only, "items"), "properties") ?? [])) {
    const type = given(schema, "type")
    if (type !== "string" && type !== "number") return "Tiene listas o grupos dentro de cada fila."
    if (given(schema, "keep_if") !== null) return "Una columna usa condiciones."
    if (given(schema, "minLength") !== null) return "Una columna usa un mínimo de caracteres."
  }
  return null
}

function widths(layout: unknown, listKey: string): Map<string, number> {
  const found = new Map<string, number>()
  for (const row of list(given(given(layout, "0"), "content") ?? [])) {
    if (given(given(given(row, "attrs"), "repeat"), "value") !== listKey) continue
    for (const cell of list(given(row, "content") ?? [])) {
      const slot = given(given(given(given(given(given(cell, "content"), "0"), "content"), "0"), "attrs"), "value")
      const width = given(given(given(cell, "attrs"), "colwidth"), "0")
      if (typeof slot === "string" && isInt(width)) found.set(slot, width)
    }
  }
  return found
}

function band(layout: unknown): string | null {
  for (const row of list(given(given(layout, "0"), "content") ?? [])) {
    if (given(given(row, "attrs"), "repeat") !== null) {
      const value = given(given(row, "attrs"), "band")
      return typeof value === "string" ? value : null
    }
  }
  return null
}

function extract(kind: string, definition: PhpRecord): PhpRecord {
  const value = record(definition.value)
  const listKey = Object.keys(value)[0] ?? ""
  const listSchema = record(value[listKey])
  const columnWidths = widths(given(definition, "layout") ?? [], listKey)
  const rules = isPhpArray(definition.rules) ? definition.rules : []
  const required = new Set<string>()
  for (const rule of list(rules)) {
    const column = requiredColumn(rule, listKey)
    if (column !== null) required.add(column)
  }
  const columns: PhpRecord[] = []
  const columnErrors: PhpRecord = {}
  for (const [key, raw] of Object.entries(record(given(listSchema.items, "properties")))) {
    const schema = record(raw)
    let column: PhpRecord = { key, title: given(schema, "title") ?? key }
    if (schema.type === "string" && given(schema, "oneOf") !== null) {
      column = { ...column, type: "choice", options: list(schema.oneOf).map((option) => ({ value: given(option, "const"), label: given(option, "title") })) }
    } else if (schema.type === "number") {
      column = { ...column, type: "number", maximum: schema.maximum, decimals: schemaDigits(schema)[1] }
    } else {
      column = { ...column, type: "text", max_length: schema.maxLength, multiline: given(schema, "multiline") ?? false }
    }
    column = { ...column, width: columnWidths.get(key) ?? null, required: required.has(key) }
    if (given(schema, "errorMessage") !== null) columnErrors[key] = { message: schema.errorMessage, signature: signature(column) }
    columns.push(column)
  }
  const extras: PhpRecord = {
    rules,
    ...(Object.keys(columnErrors).length === 0 ? {} : { column_errors: columnErrors }),
    ...(given(listSchema, "errorMessage") !== null
      ? { list_error: { message: listSchema.errorMessage, signature: [listSchema.minItems, listSchema.maxItems, given(listSchema, "title") ?? ""] } }
      : {}),
    ...(given(definition, "catalog") !== null ? { catalog: definition.catalog } : {}),
  }
  return {
    kind,
    label: definition.label,
    list: listKey,
    item: given(listSchema, "title") ?? "",
    min: listSchema.minItems,
    max: listSchema.maxItems,
    initial: listSchema.initial,
    band: band(given(definition, "layout") ?? []),
    columns,
    extras,
  }
}

function comparable(definition: PhpRecord): PhpRecord {
  return {
    label: given(definition, "label"),
    props: given(definition, "props") ?? [],
    value: withoutRowIds(given(definition, "value") ?? []),
    rules: given(definition, "rules") ?? [],
    layout: given(definition, "layout") ?? [],
    ...(given(definition, "catalog") !== null ? { catalog: definition.catalog } : {}),
  }
}

export function readTable(kind: string, definition: PhpRecord, variables: string[]): TableDesign {
  const reason = unsupported(definition)
  if (reason !== null) return { design: null, reason: `${reason} ${JSON_POINTER}` }
  const design = extract(kind, definition)
  const rebuildsAs = (legacyHeaders: boolean): boolean => {
    try {
      return phpIdentical(defineBlock(kind, buildTable(design, legacyHeaders), variables), comparable(definition))
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error
      return false
    }
  }
  if (!rebuildsAs(false) && !rebuildsAs(true)) return { design: null, reason: `${UNSUPPORTED_PIECES}${JSON_POINTER}` }
  return { design, reason: null }
}

export function lockedTable(kind: string, stored: PhpRecord | null, variables: string[]): string | null {
  if (stored === null || readTable(kind, stored, variables).design !== null) return null
  return `La tabla «${phpString(given(stored, "label") ?? kind)}» no se puede cambiar desde el editor. ${JSON_POINTER}`
}

export function guardTable(kind: string, stored: PhpRecord | null, changed: PhpRecord, variables: string[]): void {
  if (stored !== null && phpIdentical(comparable(stored), comparable(changed))) return
  const locked = lockedTable(kind, stored, variables) ?? lockedTable(kind, changed, variables)
  if (locked !== null) definitionError(locked)
}

export function blockDesigns(definition: TemplateDefinition): Record<string, TableDesign> {
  const variables = Object.keys(definition.variables)
  return Object.fromEntries(Object.entries(definition.blocks).map(([kind, block]) => [kind, readTable(kind, record(block), variables)]))
}

export { schemaOptionTitle }
