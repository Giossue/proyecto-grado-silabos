import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import { requestInput, type PhpArray } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { dataGet, validateAttributes, type Rule } from "../http/validation"
import { defineBlock } from "./blockDefinition"
import { defaultFacultyUrl, institutionUrl } from "./institutionalLogos"
import { isPhpArray, list, phpIntCast, phpShape, phpToBool, record, type PhpRecord } from "./phpValues"
import { blockDesigns, buildTable, COLUMN_TYPES, designWithKeys, lockedTable, readTable } from "./repeatableTable"
import { createTemplateLockStore } from "./templateLockQueries"
import { documentAppearance, presentDefinition, presentSections, variableCatalog, type SyllabusTemplate } from "./templatePresentation"
import { boundTemplate, FORBIDDEN, managesTemplates, type TemplateReadDeps } from "./templateReads"
import { initialValue, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { toRuntime } from "./templateDraft"
import { createTemplateStore } from "./templateStore"

export type TemplateLock = { period: string | null; deliveryOn: string | null }

export interface TemplateLockStore {
  processLock(): Promise<TemplateLock | null>
  changedDuringPause(templateId: string): Promise<boolean>
}

export type TemplateBuilderDeps = TemplateReadDeps & { locks: TemplateLockStore }

export function defaultTemplateBuilderDeps(): TemplateBuilderDeps {
  return { bridge: defaultBridgeDeps(), store: createTemplateStore(), locks: createTemplateLockStore() }
}

const PROCESS_LOCK = "Proceso activo"
const INSTITUTIONAL_NAME = "Plantilla institucional de sílabo"
const INSTITUTION_SIZE = { width: 1012, height: 190 }
const FACULTY_SIZE = { width: 600, height: 180 }
const KEY_RULE: Rule = { regex: /^[a-z][a-z0-9_]{0,40}\n?$/ }
const TEXT = { excludeUnless: "columns.*.type", equals: "text" }
const CHOICE = { excludeUnless: "columns.*.type", equals: "choice" }
const NUMBER = { excludeUnless: "columns.*.type", equals: "number" }
const DESIGN_KEYS = ["kind", "label", "list", "item", "min", "max", "initial", "band", "columns", "extras"]
const COLUMN_KEYS = ["key", "title", "type", "max_length", "multiline", "options", "maximum", "decimals", "width", "required"]
const OPTION_KEYS = ["label", "value"]

const DESIGN_MESSAGES: Record<string, string> = {
  "columns.required": "Agregue al menos una columna.",
  "columns.min": "Agregue al menos una columna.",
  "columns.max": "La tabla admite hasta 24 columnas.",
  "columns.*.title.required": "Escriba el nombre de la columna.",
  "columns.*.options.required": "Agregue al menos una opción.",
  "columns.*.options.min": "Agregue al menos una opción.",
  "columns.*.options.*.label.required": "Escriba el texto de la opción.",
  "max.gte": "El máximo de filas no puede ser menor que el mínimo.",
  "initial.gte": "«Al empezar» debe estar entre el mínimo y el máximo.",
  "initial.lte": "«Al empezar» debe estar entre el mínimo y el máximo.",
}

const DESIGN_ATTRIBUTES: Record<string, string> = {
  kind: "nombre interno de la tabla",
  new: "tabla nueva",
  columns: "columnas",
  "columns.*.options": "opciones",
  "columns.*.options.*.label": "texto de la opción",
  extras: "datos guardados de la tabla",
  label: "título de la tabla",
  list: "nombre interno de las filas",
  item: "nombre de cada fila",
  min: "mínimo de filas",
  max: "máximo de filas",
  initial: "filas al empezar",
  band: "color de filas alternas",
  "columns.*.key": "nombre interno de la columna",
  "columns.*.title": "nombre de la columna",
  "columns.*.type": "tipo de celda",
  "columns.*.max_length": "máximo de caracteres",
  "columns.*.multiline": "varias líneas",
  "columns.*.options.*.value": "clave de la opción",
  "columns.*.maximum": "número máximo",
  "columns.*.decimals": "decimales",
  "columns.*.width": "ancho",
  "columns.*.required": "obligatoria",
}

function lockDetail(lock: TemplateLock | null): PhpRecord | null {
  return lock === null ? null : { scope: "process", period: lock.period, institutional_pause: false, delivery_on: lock.deliveryOn }
}

function numberFormat(value: number): string {
  return value.toFixed(1).replace(".", ",")
}

function layoutOptions(document: PhpRecord): PhpRecord {
  const choices = record(document.choices)
  const points = (values: unknown) => list(values).map((value) => ({ value: phpIntCast(value), label: `${phpIntCast(value)} pt` }))
  return {
    body_sizes: points(choices.body),
    title_sizes: points(choices.title),
    section_sizes: points(choices.section),
    margins: list(choices.margin_cm).map((value) => ({ value: Number(value), label: `${numberFormat(Number(value))} cm` })),
  }
}

function documentLayout(document: PhpRecord): PhpRecord {
  const sizes = record(document.sizes)
  return { margin_cm: Number(document.margin_cm), title_font_size: phpIntCast(sizes.title), section_font_size: phpIntCast(sizes.section), body_font_size: phpIntCast(sizes.body) }
}

function presets(definition: TemplateDefinition): PhpRecord[] {
  return list(definition.presets).map((raw) => {
    const preset = record(raw)
    return { key: preset.key, field_key: preset.field, label: preset.label, quien_llena: preset.quien_llena, content: preset.content }
  })
}

async function builderProps(request: Request, template: SyllabusTemplate, definition: TemplateDefinition, deps: TemplateBuilderDeps): Promise<PhpRecord> {
  const lock = await deps.locks.processLock()
  const document = definition.document
  return {
    processLock: lock === null ? null : PROCESS_LOCK,
    processLockDetail: lockDetail(lock),
    templateChangedDuringPause: await deps.locks.changedDuringPause(template.id),
    variables: variableCatalog(definition),
    presets: presets(definition),
    definition: presentDefinition(definition),
    blockDesigns: blockDesigns(definition),
    logos: { institution: await institutionUrl(request), faculty: await defaultFacultyUrl(request), institution_size: INSTITUTION_SIZE, faculty_size: FACULTY_SIZE },
    template: {
      id: template.id,
      name: INSTITUTIONAL_NAME,
      appearance: documentAppearance(document),
      layout: documentLayout(document),
      layoutOptions: layoutOptions(document),
      titleBlock: { text: record(document.title).text ?? null },
      sections: presentSections(template, definition),
    },
  }
}

export async function templateIndex(request: Request, deps: TemplateBuilderDeps = defaultTemplateBuilderDeps()): Promise<Response> {
  let template: SyllabusTemplate | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        template = await deps.store.template()
        return null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  const found = template as SyllabusTemplate | null
  if (found === null) {
    const lock = await deps.locks.processLock()
    return apiJson({ processLock: lock === null ? null : PROCESS_LOCK, processLockDetail: lockDetail(lock), template: null })
  }
  return apiJson(phpShape(await builderProps(request, found, found.definition, deps)))
}

export async function templateShow(request: Request, templateId: string, deps: TemplateBuilderDeps = defaultTemplateBuilderDeps()): Promise<Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  const { template } = bound
  return apiJson(phpShape(await builderProps(request, template, template.definition, deps)))
}

function normalizedLabel(label: unknown): string {
  return typeof label === "string" ? label.replace(/\s+/gu, " ").replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, "").toLowerCase() : ""
}

function distinctInColumn(input: PhpArray): Rule {
  return {
    fails: (value, attribute) => {
      const match = /^columns\.(\d+)\.options\.(\d+)\.label$/.exec(attribute)
      if (match === null || typeof value !== "string") return []
      const options = dataGet(input, `columns.${match[1]}.options`)
      const entries = isPhpArray(options) ? Object.entries(options) : options === undefined || options === null ? [] : [["0", options] as const]
      const repeated = entries.some(([position, option]) => phpIntCast(position) < Number(match[2]) && isPhpArray(option) && normalizedLabel(record(option).label) === normalizedLabel(value))
      return repeated ? ["La opción está repetida."] : []
    },
  }
}

function designRules(input: PhpArray): Record<string, Rule[]> {
  return {
    kind: ["required", "string", KEY_RULE],
    new: ["sometimes", "boolean"],
    label: ["required", "string", { max: 120 }],
    list: ["nullable", "string", KEY_RULE],
    item: ["required", "string", { max: 60 }],
    min: ["required", "integer", { min: 0 }, { max: 100 }],
    max: ["required", "integer", { min: 1 }, { max: 100 }, { compare: "gte", than: "min" }],
    initial: ["required", "integer", { compare: "gte", than: "min" }, { compare: "lte", than: "max" }],
    band: ["nullable", "string", { regex: /^#[0-9a-fA-F]{6}\n?$/ }],
    columns: ["required", "array", { min: 1 }, { max: 24 }],
    "columns.*.key": ["nullable", "string", KEY_RULE, "distinct"],
    "columns.*.title": ["required", "string", { max: 300 }],
    "columns.*.type": ["required", { in: COLUMN_TYPES }],
    "columns.*.max_length": [TEXT, "required", "integer", { min: 1 }, { max: 20000 }],
    "columns.*.multiline": [TEXT, "sometimes", "boolean"],
    "columns.*.options": [CHOICE, "required", "array", { min: 1 }, { max: 30 }],
    "columns.*.options.*.label": [CHOICE, "required", "string", { max: 300 }, distinctInColumn(input)],
    "columns.*.options.*.value": [CHOICE, "nullable", "string", KEY_RULE],
    "columns.*.maximum": [NUMBER, "required", "numeric", { compare: "gt", than: 0 }, { compare: "lt", than: 1000000000 }],
    "columns.*.decimals": [NUMBER, "required", "integer", { min: 0 }, { max: 6 }],
    "columns.*.width": ["nullable", "integer", { min: 20 }, { max: 1200 }],
    "columns.*.required": ["sometimes", "boolean"],
    extras: ["sometimes", "array"],
  }
}

function present(input: PhpArray, path: string, excluded: Set<string>): boolean {
  return !excluded.has(path) && dataGet(input, path) !== undefined
}

function validatedDesign(input: PhpArray, excluded: Set<string>): PhpRecord {
  const design: PhpRecord = {}
  for (const key of DESIGN_KEYS) {
    if (!present(input, key, excluded)) continue
    if (key !== "columns") {
      design[key] = toRuntime(dataGet(input, key))
      continue
    }
    const columns = record(dataGet(input, "columns"))
    design.columns = Object.keys(columns).map((index) => {
      const column: PhpRecord = {}
      for (const field of COLUMN_KEYS) {
        const path = `columns.${index}.${field}`
        if (!present(input, path, excluded)) continue
        if (field !== "options") {
          column[field] = toRuntime(dataGet(input, path))
          continue
        }
        const options = record(dataGet(input, path))
        column.options = Object.keys(options).map((position) => {
          const option: PhpRecord = {}
          for (const name of OPTION_KEYS) {
            const optionPath = `${path}.${position}.${name}`
            if (present(input, optionPath, excluded)) option[name] = toRuntime(dataGet(input, optionPath))
          }
          return option
        })
      }
      return column
    })
  }
  return design
}

export async function designTemplateTable(request: Request, templateId: string, deps: TemplateBuilderDeps = defaultTemplateBuilderDeps()): Promise<Response> {
  const original = request.clone()
  const input = await requestInput(request)
  const bound = await boundTemplate(original, templateId, deps)
  if (bound instanceof Response) return bound
  const definition = bound.template.definition
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  const { errors, excluded } = await validateAttributes(input, designRules(input), DESIGN_ATTRIBUTES, { messages: DESIGN_MESSAGES })
  if (Object.keys(errors).length > 0) return validationError(errors)
  try {
    const design = designWithKeys(validatedDesign(input, excluded))
    const kind = String(design.kind)
    const stored = Object.prototype.hasOwnProperty.call(definition.blocks, kind) ? record(definition.blocks[kind]) : null
    if (phpToBool(dataGet(input, "new") ?? false) && stored !== null) return validationError({ kind: ["Ya existe una tabla con ese nombre interno."] })
    const variables = Object.keys(definition.variables)
    const locked = lockedTable(kind, stored, variables)
    if (locked !== null) return validationError({ kind: [locked] })
    const block = defineBlock(kind, buildTable(design), variables)
    const read = readTable(kind, block, variables)
    return apiJson(phpShape({ kind, definition: block, design: read.design ?? design, initial: initialValue(block.value, {}) }))
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}
