import { fromController } from "../auth/controllerResponse"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { HttpFailure, Missing } from "../http/failures"
import { randomUUID } from "node:crypto"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray, type PhpValue } from "../http/input"
import { aborted, apiJson, serverError, validationError } from "../http/responses"
import { uuid7 } from "../http/uuid7"
import { isBlank } from "@/schemas/rules"
import { fieldOrderSchema, sectionOrderSchema, sectionSchema, templateFieldSchema } from "@/schemas/template"
import { validateSchema } from "../http/schemaValidation"
import { phpIdentical, phpShape, phpString, phpTrim, type PhpRecord } from "./phpValues"
import { contentForField, phpIntCast, toRuntime } from "./templateDraft"
import { boundTemplate, FORBIDDEN, managesTemplates, type TemplateReadDeps } from "./templateReads"
import { normalizeFieldDocument, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import type { SyllabusTemplate } from "./templatePresentation"
import { createStructureStore } from "./templateStructureStore"
import { createTemplateStore } from "./templateStore"

export type DocumentBlock = { id: string; key: string; title: string; position: number }
export type DocumentSection = { id: string; key: string; title: string; orientation: string; position: number; blocks: DocumentBlock[] }
export type StoredField = { id: string; templateId: string; blockId: string; responsible: string; content: PhpRecord }
export type FieldRecord = { id: string; templateId: string; blockId: string; responsible: string; content: unknown; key?: string; label?: string }
export type FieldChanges = { responsible?: string; content?: PhpRecord }

export interface StructureTx {
  lockTemplate(templateId: string): Promise<SyllabusTemplate | null>
  syncDocument(templateId: string, sections: DocumentSection[]): Promise<void>
  insertField(field: StoredField): Promise<void>
  updateField(id: string, changes: FieldChanges): Promise<void>
  reload?(templateId: string): Promise<SyllabusTemplate | null>
}

export interface StructureStore {
  templateLocked(): Promise<boolean>
  field(id: string): Promise<FieldRecord | null>
  liveKeyTaken(templateId: string, key: string): Promise<boolean>
  liveFieldBlocks(templateId: string, fieldIds: string[]): Promise<Map<string, string>>
  transaction<T>(work: (tx: StructureTx) => Promise<T>): Promise<T>
}

export type StructureDeps = TemplateReadDeps & { structure: StructureStore; newId: () => string; newFieldId: () => string }

export function defaultStructureDeps(): StructureDeps {
  return {
    bridge: defaultBridgeDeps(),
    store: createTemplateStore(),
    structure: createStructureStore(),
    newId: randomUUID,
    newFieldId: uuid7,
  }
}

const INVALID_ORDER = "El nuevo orden no es válido. Recargue la página e intente otra vez."

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

type Authorized = { session: AppSession; template: SyllabusTemplate; definition: TemplateDefinition; field: FieldRecord | null; original: Request }

async function authorized(request: Request, templateId: string, deps: StructureDeps, fieldId?: string): Promise<Authorized | Response> {
  const original = request.clone()
  let field: FieldRecord | null = null
  const bound = await boundTemplate(original, templateId, deps, async () => {
    if (fieldId === undefined) return null
    field = isUuid(fieldId) ? await deps.structure.field(fieldId) : null
    return field === null ? modelNotFound(MODELS.field, fieldId) : null
  })
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return { ...bound, definition: bound.template.definition, field, original }
}

async function jsonInput(request: Request): Promise<PhpArray | Response> {
  return toRuntime(await requestInput(request)) as PhpArray
}

export function documentOf(template: SyllabusTemplate): DocumentSection[] {
  return template.sections.map((section) => ({
    id: section.id,
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    position: section.position,
    blocks: section.blocks.map((block) => ({ id: block.id, key: block.key, title: block.title, position: block.position })),
  }))
}

function sortedByPosition<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ item, index })).sort((left, right) => left.item.position - right.item.position || left.index - right.index).map(({ item }) => item)
}

function placed<T extends { id: string; position: number }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  return ids.map((id, index) => ({ ...(byId.get(id) as T), position: index + 1 }))
}

function sameIds(current: string[], requested: string[]): boolean {
  const order = (ids: string[]) => [...ids].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
  return current.length === requested.length && order(current).every((id, index) => id === order(requested)[index])
}

async function reloaded(tx: StructureTx, templateId: string): Promise<SyllabusTemplate> {
  const template = await (tx.reload ?? tx.lockTemplate)(templateId)
  if (template === null) throw new Missing(MODELS.template)
  return template
}

async function locked(tx: StructureTx, templateId: string): Promise<SyllabusTemplate> {
  const template = await tx.lockTemplate(templateId)
  if (template === null) throw new Missing(MODELS.template)
  return template
}

async function write(original: Request, deps: StructureDeps, work: (tx: StructureTx) => Promise<Response>): Promise<Response> {
  if (await deps.structure.templateLocked()) return validationError({ process: ["Proceso activo"] })
  try {
    return await deps.structure.transaction(work)
  } catch (error) {
    if (error instanceof HttpFailure) return fromController(error.response)
    if (error instanceof Rejected) return error.response
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

function sectionKeys(template: SyllabusTemplate | null): string[] | null {
  return template === null ? null : template.sections.map((section) => section.key)
}

function requestedPosition(input: PhpArray, count: number): number {
  const given = input.position === undefined || input.position === null ? count + 1 : phpIntCast(input.position)
  return Math.min(Math.max(1, given), count + 1)
}

export async function storeSection(request: Request, templateId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps)
  if (auth instanceof Response) return auth
  const input = await jsonInput(request)
  if (input instanceof Response) return input
  const { errors } = await validateSchema(sectionSchema(sectionKeys(auth.template)), input)
  if (errors !== null) return validationError(errors)
  let sectionId = ""
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    const count = document.length
    sectionId = deps.newId()
    const section: DocumentSection = {
      id: sectionId,
      key: phpString(input.key),
      title: phpString(input.title),
      orientation: input.orientation === undefined || input.orientation === null ? "portrait" : phpString(input.orientation),
      position: count + 1,
      blocks: [],
    }
    await tx.syncDocument(template.id, [...document, section])
    const position = requestedPosition(input, count)
    if (position <= count) {
      const current = documentOf(await reloaded(tx, template.id))
      const ids = sortedByPosition(current).map((entry) => entry.id).filter((id) => id !== sectionId)
      ids.splice(position - 1, 0, sectionId)
      await tx.syncDocument(template.id, placed(current, ids))
    }
    return apiJson({ message: "Sección agregada a la plantilla.", section_id: sectionId }, 201)
  })
}

export async function updateSection(request: Request, templateId: string, sectionId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps)
  if (auth instanceof Response) return auth
  const input = await jsonInput(request)
  if (input instanceof Response) return input
  const { errors } = await validateSchema(sectionSchema(null), input)
  if (errors !== null) return validationError(errors)
  const section = auth.template.sections.find((candidate) => candidate.id === sectionId)
  if (!section) return fromController(modelNotFound(MODELS.template, sectionId))
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    if (!document.some((entry) => entry.id === section.id)) throw new Missing(MODELS.template, section.id)
    const orientation = input.orientation === undefined || input.orientation === null ? section.orientation : phpString(input.orientation)
    await tx.syncDocument(
      template.id,
      document.map((entry) => (entry.id === section.id ? { ...entry, title: phpString(input.title), orientation } : entry)),
    )
    return apiJson({ message: "Sección actualizada." })
  })
}

export async function reorderSections(request: Request, templateId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps)
  if (auth instanceof Response) return auth
  const input = await jsonInput(request)
  if (input instanceof Response) return input
  const { errors } = await validateSchema(sectionOrderSchema(auth.template.sections.map((section) => section.id)), input)
  if (errors !== null) return validationError(errors)
  const ids = Object.values(input.section_ids as PhpArray).filter((id): id is string => typeof id === "string")
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    if (!sameIds(document.map((section) => section.id), ids)) throw new Rejected(validationError({ sections: [INVALID_ORDER] }))
    await tx.syncDocument(template.id, placed(document, ids))
    return apiJson({ message: "Orden de secciones actualizado." })
  })
}

export async function destroySection(request: Request, templateId: string, sectionId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps)
  if (auth instanceof Response) return auth
  const section = auth.template.sections.find((candidate) => candidate.id === sectionId)
  if (!section) return fromController(modelNotFound(MODELS.template, sectionId))
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    if (!document.some((entry) => entry.id === section.id)) throw new Missing(MODELS.template, section.id)
    await tx.syncDocument(
      template.id,
      document.filter((entry) => entry.id !== section.id),
    )
    return apiJson({ message: "Sección eliminada." })
  })
}

function contentErrors(content: PhpValue | undefined, definition: TemplateDefinition, checked: boolean): Record<string, string[]> | null {
  if (!checked) return null
  try {
    normalizeFieldDocument(content, definition, "content")
    return null
  } catch (error) {
    if (error instanceof TemplateValidationError) return error.errors
    throw error
  }
}

function fieldPayload(id: string, key: string, label: string, responsible: string, content: unknown): PhpRecord {
  return { id, key, label, quien_llena: responsible, content: phpShape(content) }
}

export async function storeField(request: Request, templateId: string, sectionId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps)
  if (auth instanceof Response) return auth
  const input = await jsonInput(request)
  if (input instanceof Response) return input
  const errors =
    contentErrors(input.content, auth.definition, !isBlank(input.content)) ??
    (await validateSchema(templateFieldSchema({ creating: true, keyAvailable: async (value) => !(await deps.structure.liveKeyTaken(auth.template.id, phpString(value as PhpValue))) }), input)).errors
  if (errors !== null) return validationError(errors)
  if (!auth.template.sections.some((section) => section.id === sectionId)) return fromController(modelNotFound(MODELS.template, sectionId))
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    const section = document.find((entry) => entry.id === sectionId)
    if (!section) throw new Missing(MODELS.template, sectionId)
    const responsible = phpString(input.quien_llena)
    const content = contentForField(responsible, normalizeFieldDocument(input.content, template.definition ?? auth.definition))
    const label = phpTrim(input.label === undefined || input.label === null ? "" : phpString(input.label))
    const count = section.blocks.length
    const blockId = deps.newId()
    const block: DocumentBlock = { id: blockId, key: phpString(input.key), title: label, position: count + 1 }
    await tx.syncDocument(
      template.id,
      document.map((entry) => (entry.id === section.id ? { ...entry, blocks: [...entry.blocks, block] } : entry)),
    )
    const position = requestedPosition(input, count)
    if (position <= count) {
      const current = documentOf(await reloaded(tx, template.id))
      const target = current.find((entry) => entry.id === section.id)
      if (!target) throw new Missing(MODELS.template, section.id)
      const ids = sortedByPosition(target.blocks).map((entry) => entry.id).filter((id) => id !== blockId)
      ids.splice(position - 1, 0, blockId)
      await tx.syncDocument(
        template.id,
        current.map((entry) => (entry.id === section.id ? { ...entry, blocks: placed(entry.blocks, ids) } : entry)),
      )
    }
    const fieldId = deps.newFieldId()
    await tx.insertField({ id: fieldId, templateId: template.id, blockId, responsible, content })
    return apiJson({ message: "Campo agregado a la sección.", field: fieldPayload(fieldId, block.key, label, responsible, content) }, 201)
  })
}

export async function updateField(request: Request, templateId: string, fieldId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps, fieldId)
  if (auth instanceof Response) return auth
  const field = auth.field as FieldRecord
  const input = await jsonInput(request)
  if (input instanceof Response) return input
  const errors = contentErrors(input.content, auth.definition, input.content !== undefined) ?? (await validateSchema(templateFieldSchema({ creating: false }), input)).errors
  if (errors !== null) return validationError(errors)
  if (field.templateId !== auth.template.id) return fromController(aborted(404))
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key)
    const label = has("label") ? phpTrim(phpString(input.label as PhpValue)) : (field.label ?? "")
    const responsible = input.quien_llena === undefined || input.quien_llena === null ? field.responsible : phpString(input.quien_llena)
    const source = has("content") ? normalizeFieldDocument(input.content, template.definition ?? auth.definition) : field.content
    const content = contentForField(responsible, source as PhpRecord)
    const changes: FieldChanges = {}
    if (responsible !== field.responsible) changes.responsible = responsible
    if (!phpIdentical(content, field.content)) changes.content = content
    if (Object.keys(changes).length > 0) await tx.updateField(field.id, changes)
    const document = documentOf(template)
    if (!document.some((section) => section.blocks.some((block) => block.id === field.blockId))) throw new Missing(MODELS.template, field.blockId)
    await tx.syncDocument(
      template.id,
      document.map((section) => ({ ...section, blocks: section.blocks.map((block) => (block.id === field.blockId ? { ...block, title: label } : block)) })),
    )
    const key = document.flatMap((section) => section.blocks).find((block) => block.id === field.blockId)?.key ?? field.key ?? ""
    return apiJson({ message: "Campo actualizado.", field: fieldPayload(field.id, key, label, responsible, content) })
  })
}

export async function reorderFields(request: Request, templateId: string, sectionId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps)
  if (auth instanceof Response) return auth
  const input = await jsonInput(request)
  if (input instanceof Response) return input
  const { errors } = await validateSchema(fieldOrderSchema, input)
  if (errors !== null) return validationError(errors)
  if (!auth.template.sections.some((section) => section.id === sectionId)) return fromController(modelNotFound(MODELS.template, sectionId))
  const ids = Object.values(input.field_ids as PhpArray).filter((id): id is string => typeof id === "string")
  const blockIds = await deps.structure.liveFieldBlocks(auth.template.id, ids)
  if (blockIds.size !== ids.length) return validationError({ field_ids: [INVALID_ORDER] })
  if (ids.some((id) => !blockIds.has(id))) return fromController(serverError())
  const requested = ids.map((id) => blockIds.get(id) as string)
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    const section = document.find((entry) => entry.id === sectionId)
    if (!section) throw new Missing(MODELS.template, sectionId)
    if (!sameIds(section.blocks.map((block) => block.id), requested)) throw new Rejected(validationError({ blocks: [INVALID_ORDER] }))
    await tx.syncDocument(
      template.id,
      document.map((entry) => (entry.id === section.id ? { ...entry, blocks: placed(entry.blocks, requested) } : entry)),
    )
    return apiJson({ message: "Orden de campos actualizado." })
  })
}

export async function destroyField(request: Request, templateId: string, fieldId: string, deps: StructureDeps = defaultStructureDeps()): Promise<Response> {
  const auth = await authorized(request, templateId, deps, fieldId)
  if (auth instanceof Response) return auth
  const field = auth.field as FieldRecord
  if (field.templateId !== auth.template.id) return fromController(aborted(404))
  if (!auth.template.sections.some((section) => section.blocks.some((block) => block.id === field.blockId))) return fromController(modelNotFound(MODELS.template, field.blockId))
  return write(auth.original, deps, async (tx) => {
    const template = await locked(tx, auth.template.id)
    const document = documentOf(template)
    if (!document.some((section) => section.blocks.some((block) => block.id === field.blockId))) throw new Missing(MODELS.template, field.blockId)
    await tx.syncDocument(
      template.id,
      document.map((section) => ({ ...section, blocks: section.blocks.filter((block) => block.id !== field.blockId) })),
    )
    return apiJson({ message: "Campo eliminado." })
  })
}
