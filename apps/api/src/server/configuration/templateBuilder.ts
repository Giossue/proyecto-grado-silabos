import { requireSession } from "../auth/requireSession"
import { inputValue, requestInput, type PhpArray } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { excludedColumnPath, tableDesignSchema } from "@silabos/shared/schemas/template"
import { validateSchema } from "../http/schemaValidation"
import { defineBlock } from "./blockDefinition"
import { defaultFacultyUrl, institutionUrl } from "./institutionalLogos"
import { list, phpIntCast, phpShape, phpToBool, record, type PhpRecord } from "./phpValues"
import { blockDesigns, buildTable, designWithKeys, lockedTable, readTable } from "./repeatableTable"
import { documentAppearance, presentDefinition, presentSections, variableCatalog, type SyllabusTemplate } from "./templatePresentation"
import { boundTemplate, FORBIDDEN, managesTemplates, type TemplateReadDeps } from "./templateReads"
import { initialValue, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { toRuntime } from "./templateDraft"

export type TemplateLock = { period: string | null; deliveryOn: string | null }

export interface TemplateLockStore {
  processLock(): Promise<TemplateLock | null>
  changedDuringPause(templateId: string): Promise<boolean>
}

export type TemplateBuilderDeps = TemplateReadDeps & { locks: TemplateLockStore }


const PROCESS_LOCK = "Proceso activo"
const INSTITUTIONAL_NAME = "Plantilla institucional de sílabo"
const INSTITUTION_SIZE = { width: 1012, height: 190 }
const FACULTY_SIZE = { width: 600, height: 180 }
const DESIGN_KEYS = ["kind", "label", "list", "item", "min", "max", "initial", "band", "columns", "extras"]
const COLUMN_KEYS = ["key", "title", "type", "max_length", "multiline", "options", "maximum", "decimals", "width", "required"]
const OPTION_KEYS = ["label", "value"]

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

async function builderProps(request: Request, template: SyllabusTemplate, definition: TemplateDefinition, deps: Pick<TemplateBuilderDeps, "locks">): Promise<PhpRecord> {
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

export async function templateIndex(request: Request, deps: TemplateBuilderDeps): Promise<Response> {
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
  return templateIndexOf(request, template as SyllabusTemplate | null, deps)
}

export async function templateIndexOf(request: Request, found: SyllabusTemplate | null, deps: Pick<TemplateBuilderDeps, "locks">): Promise<Response> {
  if (found === null) {
    const lock = await deps.locks.processLock()
    return apiJson({ processLock: lock === null ? null : PROCESS_LOCK, processLockDetail: lockDetail(lock), template: null })
  }
  return apiJson(phpShape(await builderProps(request, found, found.definition, deps)))
}

export async function templateShow(request: Request, templateId: string, deps: TemplateBuilderDeps): Promise<Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return templateShowOf(request, bound.template, deps)
}

export async function templateShowOf(request: Request, template: SyllabusTemplate, deps: Pick<TemplateBuilderDeps, "locks">): Promise<Response> {
  return apiJson(phpShape(await builderProps(request, template, template.definition, deps)))
}

function present(input: PhpArray, path: string): boolean {
  return !excludedColumnPath(input, path) && inputValue(input, path) !== undefined
}

function validatedDesign(input: PhpArray): PhpRecord {
  const design: PhpRecord = {}
  for (const key of DESIGN_KEYS) {
    if (!present(input, key)) continue
    if (key !== "columns") {
      design[key] = toRuntime(inputValue(input, key))
      continue
    }
    const columns = record(inputValue(input, "columns"))
    design.columns = Object.keys(columns).map((index) => {
      const column: PhpRecord = {}
      for (const field of COLUMN_KEYS) {
        const path = `columns.${index}.${field}`
        if (!present(input, path)) continue
        if (field !== "options") {
          column[field] = toRuntime(inputValue(input, path))
          continue
        }
        const options = record(inputValue(input, path))
        column.options = Object.keys(options).map((position) => {
          const option: PhpRecord = {}
          for (const name of OPTION_KEYS) {
            const optionPath = `${path}.${position}.${name}`
            if (present(input, optionPath)) option[name] = toRuntime(inputValue(input, optionPath))
          }
          return option
        })
      }
      return column
    })
  }
  return design
}

export async function designTemplateTable(request: Request, templateId: string, deps: TemplateBuilderDeps): Promise<Response> {
  const original = request.clone()
  const input = await requestInput(request)
  const bound = await boundTemplate(original, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return designTemplateTableOf(input, bound.template)
}

export async function designTemplateTableOf(input: PhpArray, template: SyllabusTemplate): Promise<Response> {
  const definition = template.definition
  const { errors } = await validateSchema(tableDesignSchema(input), input)
  if (errors !== null) return validationError(errors)
  try {
    const design = designWithKeys(validatedDesign(input)) 
    const kind = String(design.kind)
    const stored = Object.prototype.hasOwnProperty.call(definition.blocks, kind) ? record(definition.blocks[kind]) : null
    if (phpToBool(inputValue(input, "new") ?? false) && stored !== null) return validationError({ kind: ["Ya existe una tabla con ese nombre interno."] })
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
