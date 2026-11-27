import { z } from "zod"
import { RESPONSE_TEXT_LENGTH, responseHasOptions, responseSettingNames, type ResponseDisplay, type ResponseSettings } from "../lib/responseKinds"
import {
  addFailures,
  checkItems,
  childItems,
  field,
  fieldFailures,
  is,
  itemsAt,
  nestedItems,
  nullableField,
  prohibitedField,
  requiredField,
  sizeOf,
  sometimesField,
  valueAt,
  type Check,
  type ItemPath,
} from "./fields"
import { messages } from "./messages"
import { phpIsNumeric, phpLooseEquals } from "./php"

export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/
export const RESPONSIBLES = ["carrera", "institucional"]
export const ORIENTATIONS = ["portrait", "landscape"]
export const KEY_MAX = 100
export const TITLE_MAX = 180

type Failures = (value: unknown, attribute: string) => string[] | Promise<string[]>

export const officialFormatSchema = z.object({ official: sometimesField("formato oficial", [is.boolean()]) })

export const aiReadPermissionSchema = z.object({ readable: requiredField("lectura de la IA", [is.boolean()]) })

export const aiReadPermissionBody = z.object({ readable: z.boolean().describe("La IA del docente puede leer el campo.") })

const SECTION_KEY_TAKEN = "La clave ya está siendo utilizada por otra sección."

export function sectionSchema(takenKeys: readonly string[] | null) {
  return z.object({
    title: requiredField("título", [is.string(), is.max(TITLE_MAX)]),
    orientation: sometimesField("orientación", [is.oneOf(ORIENTATIONS)]),
    position: sometimesField("posición", [is.integer(), is.min(1)]),
    ...(takenKeys === null
      ? {}
      : {
          key: requiredField("código de referencia", [
            is.string(),
            is.matches(KEY_PATTERN),
            is.max(KEY_MAX),
            is.refined((value) => (takenKeys.includes(value as string) ? [SECTION_KEY_TAKEN] : [])),
          ]),
        }),
  })
}

export function sectionOrderSchema(sectionIds: readonly string[]) {
  return z
    .object({ section_ids: requiredField("secciones", [is.array(), is.min(1)]) })
    .superRefine(async (input, context) => {
      await checkItems(context, itemsAt(input.section_ids, ["section_ids"]), "sección", [
        is.uuid(),
        is.distinct(),
        is.refined((value) => (typeof value !== "string" || !sectionIds.includes(value) ? ["La sección seleccionada no pertenece a la plantilla."] : [])),
      ], { required: true })
    })
}

export const fieldOrderSchema = z
  .object({ field_ids: requiredField("campos", [is.array(), is.min(1)]) })
  .superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.field_ids, ["field_ids"]), "campo", [is.uuid(), is.distinct()], { required: true })
  })

export function templateFieldSchema({ creating, keyAvailable }: { creating: boolean; keyAvailable?: (value: unknown) => Promise<boolean> }) {
  return z.object({
    label: nullableField("título", [is.string(), is.max(TITLE_MAX)]),
    quien_llena: field("quién lo llena", [is.oneOf(RESPONSIBLES)], creating ? { required: true } : { sometimes: true }),
    content: field("contenido", [is.array()], creating ? { required: true } : { sometimes: true }),
    type: prohibitedField("tipo retirado"),
    config: prohibitedField("configuración retirada"),
    ...(creating
      ? {
          position: sometimesField("posición", [is.integer(), is.min(1)]),
          key: requiredField("clave", [is.string(), is.matches(KEY_PATTERN), is.max(KEY_MAX), ...(keyAvailable ? [is.unique(keyAvailable)] : [])]),
        }
      : {}),
  })
}

const TABLE_KEY = /^[a-z][a-z0-9_]{0,40}\n?$/
export const COLUMN_TYPES = ["text", "choice", "number"]
export const TABLE_COLUMNS_MAX = 24
export const TABLE_OPTIONS_MAX = 30
export const TABLE_ROWS_MAX = 100

const TYPED_COLUMN_FIELDS: Record<string, string> = {
  max_length: "text",
  multiline: "text",
  options: "choice",
  maximum: "number",
  decimals: "number",
}

function columnType(input: unknown, index: string): unknown {
  return valueAt(valueAt(valueAt(input, "columns"), index), "type")
}

export function excludedColumnPath(input: unknown, path: string): boolean {
  const match = /^columns\.([^.]+)\.([^.]+)/.exec(path)
  if (match === null || TYPED_COLUMN_FIELDS[match[2]] === undefined) return false
  return !phpLooseEquals(columnType(input, match[1]) ?? null, TYPED_COLUMN_FIELDS[match[2]])
}

function normalizedLabel(label: unknown): string {
  return typeof label === "string" ? label.replace(/\s+/gu, " ").replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, "").toLowerCase() : ""
}

function repeatedOption(input: unknown): Failures {
  return (value, attribute) => {
    const match = /^columns\.(\d+)\.options\.(\d+)\.label$/.exec(attribute)
    if (match === null || typeof value !== "string") return []
    const options = valueAt(valueAt(valueAt(input, "columns"), match[1]), "options")
    const entries = typeof options === "object" && options !== null ? Object.entries(options) : options === undefined || options === null ? [] : [["0", options] as const]
    const repeated = entries.some(
      ([position, option]) => Number.parseInt(position, 10) < Number(match[2]) && typeof option === "object" && option !== null && normalizedLabel((option as Record<string, unknown>).label) === normalizedLabel(value),
    )
    return repeated ? ["La opción está repetida."] : []
  }
}

function comparedTo(operator: "gte" | "lte", input: unknown, key: string, message: string): Check {
  return {
    test: (value) => {
      const other = valueAt(input, key) ?? null
      if (phpIsNumeric(value) && phpIsNumeric(other)) {
        const left = Number(String(value).trim())
        const right = Number(String(other).trim())
        return (operator === "gte" ? left >= right : left <= right) ? null : message
      }
      const type = (item: unknown) => (item === undefined || item === null ? "null" : typeof item === "object" ? "array" : typeof item)
      if (type(value) !== type(other)) return message
      const left = sizeOf(value, "numeric")
      const right = sizeOf(other, "numeric")
      return (operator === "gte" ? left >= right : left <= right) ? null : message
    },
  }
}

function bounded(operator: "gt" | "lt", limit: number): Check {
  return {
    test: (value, { label }) => {
      const passes = phpIsNumeric(value) && (operator === "gt" ? sizeOf(value, "numeric") > limit : sizeOf(value, "numeric") < limit)
      return passes ? null : operator === "gt" ? messages.gt(label, limit) : messages.lt(label, limit)
    },
  }
}

const BETWEEN_LIMITS = "«Al empezar» debe estar entre el mínimo y el máximo."
const ADD_COLUMN = "Agregue al menos una columna."
const ADD_OPTION = "Agregue al menos una opción."

export function tableDesignSchema(input: unknown) {
  const tableKey = is.matches(TABLE_KEY)
  return z
    .object({
      kind: requiredField("nombre interno de la tabla", [is.string(), tableKey]),
      new: sometimesField("tabla nueva", [is.boolean()]),
      label: requiredField("título de la tabla", [is.string(), is.max(120)]),
      list: nullableField("nombre interno de las filas", [is.string(), tableKey]),
      item: requiredField("nombre de cada fila", [is.string(), is.max(60)]),
      min: requiredField("mínimo de filas", [is.integer(), is.min(0), is.max(TABLE_ROWS_MAX)]),
      max: requiredField("máximo de filas", [is.integer(), is.min(1), is.max(TABLE_ROWS_MAX), comparedTo("gte", input, "min", "El máximo de filas no puede ser menor que el mínimo.")]),
      initial: requiredField("filas al empezar", [is.integer(), comparedTo("gte", input, "min", BETWEEN_LIMITS), comparedTo("lte", input, "max", BETWEEN_LIMITS)]),
      band: nullableField("color de filas alternas", [is.string(), is.matches(/^#[0-9a-fA-F]{6}\n?$/)]),
      columns: requiredField("columnas", [is.array(), is.min(1, ADD_COLUMN), is.max(TABLE_COLUMNS_MAX, "La tabla admite hasta 24 columnas.")], { requiredMessage: ADD_COLUMN }),
      extras: sometimesField("datos guardados de la tabla", [is.array()]),
    })
    .superRefine(async (values, context) => {
      const columns = itemsAt(values.columns, ["columns"])
      const kept = (items: [ItemPath, unknown][]) => items.filter(([path]) => !excludedColumnPath(input, path.map(String).join(".")))
      const check = async (key: string, label: string, checks: Check[], options: Parameters<typeof checkItems>[4] = {}) =>
        checkItems(context, kept(nestedItems(columns, key)), label, checks, options)
      await check("key", "nombre interno de la columna", [is.string(), tableKey, is.distinct()], { nullable: true })
      await check("title", "nombre de la columna", [is.string(), is.max(300)], { required: true, requiredMessage: "Escriba el nombre de la columna." })
      await check("type", "tipo de celda", [is.oneOf(COLUMN_TYPES)], { required: true })
      await check("max_length", "máximo de caracteres", [is.integer(), is.min(1), is.max(20000)], { required: true })
      await check("multiline", "varias líneas", [is.boolean()], { sometimes: true })
      await check("options", "opciones", [is.array(), is.min(1, ADD_OPTION), is.max(TABLE_OPTIONS_MAX)], { required: true, requiredMessage: ADD_OPTION })
      const options = kept(childItems(columns, "options"))
      await checkItems(context, kept(nestedItems(options, "label")), "texto de la opción", [is.string(), is.max(300), is.refined(repeatedOption(input))], {
        required: true,
        requiredMessage: "Escriba el texto de la opción.",
      })
      await checkItems(context, kept(nestedItems(options, "value")), "clave de la opción", [is.string(), tableKey], { nullable: true })
      await check("maximum", "número máximo", [is.numeric(), bounded("gt", 0), bounded("lt", 1000000000)], { required: true })
      await check("decimals", "decimales", [is.integer(), is.min(0), is.max(6)], { required: true })
      await check("width", "ancho", [is.integer(), is.min(20), is.max(1200)], { nullable: true })
      await check("required", "obligatoria", [is.boolean()], { sometimes: true })
    })
}

export const FIELD_LIMIT_MIN = 1
export const FIELD_LIMIT_MAX = 50000
export const FIELD_LIMIT_INVALID = "El límite de caracteres debe ser un número entero entre 1 y 50 000."

export const DRAFT_ROOT_KEYS = ["document", "variables", "blocks", "required_sections", "library_sections", "presets", "response_policy"]

const ROOT_LABELS: Record<string, string> = {
  document: "documento",
  variables: "datos del sistema",
  blocks: "bloques",
  response_policy: "política de respuestas",
  required_sections: "secciones obligatorias",
  library_sections: "secciones de biblioteca",
  presets: "plantillas listas",
}

type DraftOptions = {
  formatVersion: number
  choices: (key: string) => string[]
  repeatedFieldKey: (value: unknown) => string[]
  contentFailures: Failures
}

const validLimit = (value: unknown) => (typeof value !== "number" || !Number.isInteger(value) || value < FIELD_LIMIT_MIN || value > FIELD_LIMIT_MAX ? [FIELD_LIMIT_INVALID] : [])

export function templateDraftSchema(options: DraftOptions) {
  const roots = Object.fromEntries(
    DRAFT_ROOT_KEYS.map((key) => [key, key === "response_policy" ? sometimesField(ROOT_LABELS[key], [is.oneOf(["protected"])]) : sometimesField(ROOT_LABELS[key], [is.array()])]),
  )
  const layout: [string, string, Check, string][] = [
    ["margin_cm", "margen", is.numeric(), "margin_cm"],
    ["title_font_size", "tamaño del título", is.integer(), "title"],
    ["section_font_size", "tamaño de las secciones", is.integer(), "section"],
    ["body_font_size", "tamaño del contenido", is.integer(), "body"],
  ]
  return z
    .object({
      version: requiredField("versión", [is.integer(), is.oneOf(["1", String(options.formatVersion)])]),
      title: sometimesField("título del documento", [is.string(), is.max(TITLE_MAX)], { nullable: true }),
      layout: sometimesField("diseño", [is.array()]),
      lists: sometimesField("listas", [is.array(), is.max(20)]),
      block_changes: sometimesField("tablas cambiadas", [is.array(), is.max(20)]),
      ...roots,
      sections: field("secciones", [is.array(), is.max(60)], { present: true }),
    })
    .meta({ errorOrder: ["version", "title", "layout", ...layout.map(([key]) => `layout.${key}`), "lists", "block_changes", ...DRAFT_ROOT_KEYS, "sections"] })
    .superRefine(async (input, context) => {
      for (const [key, label, type, choice] of layout) {
        addFailures(context, ["layout", key], await fieldFailures(valueAt(input.layout, key), label, [type, is.oneOf(options.choices(choice))], { sometimes: true }))
      }
      const lists = itemsAt(input.lists, ["lists"])
      await checkItems(context, nestedItems(lists, "block"), "bloque de la lista", [is.string(), is.max(40)], { required: true })
      await checkItems(context, nestedItems(lists, "path"), "lista", [is.string(), is.max(200)], { required: true })
      await checkItems(context, nestedItems(lists, "min"), "mínimo", [is.integer(), is.min(0), is.max(100)], { required: true })
      await checkItems(context, nestedItems(lists, "max"), "máximo", [is.integer(), is.min(1), is.max(100)], { required: true })
      await checkItems(context, nestedItems(lists, "initial"), "al empezar", [is.integer(), is.min(0), is.max(100)], { required: true })
      const sections = itemsAt(input.sections, ["sections"])
      await checkItems(context, nestedItems(sections, "key"), "clave de la sección", [is.string(), is.matches(KEY_PATTERN), is.max(KEY_MAX), is.distinct()], { required: true })
      await checkItems(context, nestedItems(sections, "title"), "título de la sección", [is.string(), is.max(TITLE_MAX)], { required: true })
      await checkItems(context, nestedItems(sections, "orientation"), "orientación", [is.oneOf(ORIENTATIONS)], { sometimes: true })
      await checkItems(context, nestedItems(sections, "fields"), "campos", [is.array(), is.max(60)], { sometimes: true })
      const fields = childItems(sections, "fields")
      await checkItems(context, nestedItems(fields, "key"), "clave del campo", [is.string(), is.matches(KEY_PATTERN), is.max(KEY_MAX), is.refined(options.repeatedFieldKey)], { required: true })
      await checkItems(context, nestedItems(fields, "label"), "nombre del campo", [is.string(), is.max(TITLE_MAX)], { nullable: true })
      await checkItems(context, nestedItems(fields, "quien_llena"), "quién lo llena", [is.oneOf(RESPONSIBLES)], { required: true })
      await checkItems(context, nestedItems(fields, "show_if"), "mostrar solo si", [is.array()], { sometimes: true, nullable: true })
      await checkItems(context, nestedItems(fields, "max_length"), "límite de caracteres", [is.refined(validLimit)], { sometimes: true, nullable: true })
      await checkItems(context, nestedItems(fields, "content"), "contenido", [is.refined(options.contentFailures)], { required: true })
    })
}

export function assistantRequestSchema({ messageCharacters, readable, unreadable }: { messageCharacters: number; readable: (value: unknown) => boolean; unreadable: string }) {
  return z
    .object({
      message: requiredField("pedido", [is.string(), is.max(messageCharacters)]),
      idempotency_key: requiredField("clave del pedido", [is.uuid()]),
      draft_version: requiredField("versión del borrador", [is.string(), is.max(100)]),
      draft: field("borrador", [is.array(), is.max(60)], { present: true }),
    })
    .superRefine(async (input, context) => {
      const sections = itemsAt(input.draft, ["draft"])
      await checkItems(context, nestedItems(sections, "key"), "clave de la sección", [is.string(), is.matches(KEY_PATTERN), is.max(KEY_MAX), is.distinct()], { required: true })
      await checkItems(context, nestedItems(sections, "title"), "título de la sección", [is.string(), is.max(TITLE_MAX)], { present: true, nullable: true })
      await checkItems(context, nestedItems(sections, "orientation"), "orientación", [is.oneOf(ORIENTATIONS)], { required: true })
      await checkItems(context, nestedItems(sections, "fields"), "campos", [is.array(), is.max(60)], { present: true })
      const fields = childItems(sections, "fields")
      await checkItems(context, nestedItems(fields, "key"), "clave del campo", [is.string(), is.matches(KEY_PATTERN), is.max(KEY_MAX)], { required: true })
      await checkItems(context, nestedItems(fields, "label"), "nombre del campo", [is.string(), is.max(TITLE_MAX)], { present: true, nullable: true })
      await checkItems(context, nestedItems(fields, "quien_llena"), "quién lo llena", [is.oneOf(RESPONSIBLES)], { required: true })
      await checkItems(context, nestedItems(fields, "content"), "contenido", [is.array(), is.satisfying(readable, unreadable)], { required: true })
      await checkItems(context, nestedItems(fields, "show_if"), "mostrar solo si", [is.array()], { sometimes: true, nullable: true })
      await checkItems(context, nestedItems(fields, "max_length"), "límite de caracteres", [is.integer(), is.min(FIELD_LIMIT_MIN), is.max(FIELD_LIMIT_MAX)], { sometimes: true, nullable: true })
    })
}

export const assistantMessageSchema = (messageCharacters: number) =>
  z.object({ message: requiredField<string>("pedido", [is.string(), is.max(messageCharacters)]) })

export const fieldLimitFormSchema = (message: string) =>
  z.object({
    limit: z
      .string()
      .trim()
      .refine((value) => /^\d+$/.test(value) && Number(value) >= FIELD_LIMIT_MIN && Number(value) <= FIELD_LIMIT_MAX, message),
  })

export const CONDITION_OPTIONS_REQUIRED = "Elija al menos una opción"

export const conditionChoiceSchema = z
  .object({ source: z.string(), options: z.array(z.string()) })
  .superRefine((choice, context) => {
    if (choice.source && choice.options.length === 0) context.addIssue({ code: "custom", path: ["options"], message: CONDITION_OPTIONS_REQUIRED })
  })

export const RESPONSE_OPTIONS_REQUIRED = "Escriba al menos una opción."
const RESPONSE_CONDITION_REQUIRED = "Elija al menos una opción para «Mostrar solo si»"

const responseOptionSchema = z.object({ const: z.string(), title: z.string() })
const wholeOrNull = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)
const inRange = (text: string, max: number): boolean => text.trim() === "" || ((wholeOrNull(text) ?? 0) >= 1 && (wholeOrNull(text) ?? 0) <= max)
const optionCount = (count: number): string => (count === 1 ? "1 opción" : `${count} opciones`)

type ResponseToolContext = { fixed: boolean; conditional: boolean; current: Pick<ResponseSettings, "minChoices" | "maxChoices"> | null }
type ResponseToolValues = { kind: string; options: unknown[]; maxLength: string; minChoices: string; maxChoices: string }

function responseSettingsError({ kind, options, maxLength, minChoices, maxChoices }: ResponseToolValues, { fixed, current }: ResponseToolContext): string {
  const count = options.length
  if (fixed) {
    const min = current?.minChoices
    const max = current?.maxChoices
    if (min && min > count) return `Esta respuesta pide elegir al menos ${min}: deje al menos ${optionCount(min)}.`
    if (max && max > count) return `Esta respuesta permite elegir hasta ${max}: deje al menos ${optionCount(max)}.`
    return ""
  }
  const names = responseSettingNames(kind)
  if (names.includes("maxLength") && !inRange(maxLength, RESPONSE_TEXT_LENGTH)) return `El límite de caracteres va de 1 a ${RESPONSE_TEXT_LENGTH}.`
  if (names.includes("minChoices") && (minChoices.trim() || maxChoices.trim())) {
    if (count === 0) return "Escriba las opciones antes de fijar cuántas elegir."
    if (!inRange(minChoices, count) || !inRange(maxChoices, count)) return `Cuántas elegir va de 1 a ${count}, el número de opciones.`
    const min = wholeOrNull(minChoices)
    const max = wholeOrNull(maxChoices)
    if (min !== null && max !== null && min > max) return "El mínimo para elegir no puede superar el máximo."
  }
  return ""
}

export function responseToolSchema(context: ResponseToolContext) {
  return z
    .object({
      kind: z.string(),
      options: z.array(responseOptionSchema),
      required: z.boolean(),
      help: z.string(),
      maxLength: z.string(),
      minChoices: z.string(),
      maxChoices: z.string(),
      display: z.enum(["lista", "desplegable"]),
      condition: z.object({ source: z.string(), options: z.array(z.string()) }),
    })
    .superRefine((values, issues) => {
      if (context.fixed && responseHasOptions(values.kind) && values.options.length === 0) issues.addIssue({ code: "custom", path: ["options"], message: RESPONSE_OPTIONS_REQUIRED })
      const settings = responseSettingsError(values, context)
      if (settings) issues.addIssue({ code: "custom", path: ["settings"], message: settings })
      if (context.conditional && values.condition.source && values.condition.options.length === 0) issues.addIssue({ code: "custom", path: ["condition"], message: RESPONSE_CONDITION_REQUIRED })
    })
    .transform((values) => ({
      ...values,
      settings: {
        required: values.required,
        help: values.help,
        maxLength: wholeOrNull(values.maxLength) ?? undefined,
        minChoices: wholeOrNull(values.minChoices) ?? undefined,
        maxChoices: wholeOrNull(values.maxChoices) ?? undefined,
        display: values.display as ResponseDisplay,
      } satisfies ResponseSettings,
    }))
}

export type ResponseToolValuesInput = z.input<ReturnType<typeof responseToolSchema>>

const designerColumnSchema = z.object({
  key: z.string().optional(),
  title: z.string(),
  type: z.enum(["text", "choice", "number"]),
  max_length: z.string(),
  multiline: z.boolean().optional(),
  options: z.array(z.object({ value: z.string().optional(), label: z.string() })).optional(),
  maximum: z.string(),
  decimals: z.string(),
  width: z.string(),
  required: z.boolean(),
})

const wholeOrText = (value: string): number | string => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : value.trim())
const decimalOrText = (value: string): number | string => (/^\d+([.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : value.trim())

function designerColumn(column: z.output<typeof designerColumnSchema>) {
  const base = { ...(column.key ? { key: column.key } : {}), title: column.title.trim(), type: column.type, width: column.width.trim() === "" ? null : wholeOrText(column.width), required: column.required }
  if (column.type === "choice") return { ...base, options: (column.options ?? []).map((option) => ({ ...(option.value ? { value: option.value } : {}), label: option.label })) }
  if (column.type === "number") return { ...base, maximum: decimalOrText(column.maximum), decimals: wholeOrText(column.decimals) }
  return { ...base, max_length: wholeOrText(column.max_length), multiline: column.multiline ?? false }
}

export const tableDesignerSchema = z
  .object({
    kind: z.string(),
    label: z.string(),
    list: z.string(),
    item: z.string(),
    min: z.string(),
    max: z.string(),
    initial: z.string(),
    band: z.string().nullable(),
    columns: z.array(designerColumnSchema),
    extras: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((draft) => ({
    kind: draft.kind,
    label: draft.label.trim(),
    list: draft.list,
    item: draft.item.trim(),
    min: wholeOrText(draft.min),
    max: wholeOrText(draft.max),
    initial: wholeOrText(draft.initial),
    band: draft.band,
    columns: draft.columns.map(designerColumn),
    ...(draft.extras ? { extras: draft.extras } : {}),
  }))

export type TableDesignerValues = z.input<typeof tableDesignerSchema>
