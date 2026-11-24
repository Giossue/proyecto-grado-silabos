import "server-only"
import { randomUUID } from "node:crypto"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isJsonRequest, laravelInput } from "../laravel/input"
import { laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { uuid7 } from "../laravel/uuid7"
import { laravelBoolean } from "../syllabus/inProgressWork"
import { Missing, Rejected, settle } from "../syllabus/reviewDecisions"
import officialJson from "./officialTemplate.json"
import type { PhpRecord } from "./phpValues"
import { contentForField, DraftRequest, fieldDocument, prepareDraft, toRuntime, validatedSections, type DraftSection } from "./templateDraft"
import { DEFINITION_KEYS, defineTemplate } from "./templateDefinition"
import type { SyllabusTemplate } from "./templatePresentation"
import { boundTemplate, FORBIDDEN, managesTemplates } from "./templateReads"
import { normalizeFieldDocument, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { createTemplateStore, type TemplateStore } from "./templateStore"
import type { DocumentSection, StoredField } from "./templateStructure"

export const PROCESS_LOCK_REASON = "Proceso activo"
export const TEMPLATE_EXISTS = "La plantilla institucional ya existe. Edítela en lugar de crear otra."

export interface ProvisionTx {
  anyTemplate(): Promise<boolean>
  lockTemplate(templateId: string): Promise<SyllabusTemplate | null>
  insertTemplate(templateId: string, definition: TemplateDefinition): Promise<void>
  hasStructure(templateId: string): Promise<boolean>
  syncDocument(templateId: string, sections: DocumentSection[]): Promise<void>
  suffixRetiredSections(templateId: string): Promise<void>
  insertField(field: StoredField): Promise<void>
  saveDefinition(templateId: string, definition: TemplateDefinition): Promise<void>
  coordinationFields(templateId: string): Promise<Map<string, string>>
  moveSubjectValues(from: string, to: string): Promise<void>
}

export interface ProvisionStore {
  templateLocked(): Promise<boolean>
  transaction<T>(work: (tx: ProvisionTx) => Promise<T>): Promise<T>
}

export type ProvisionDeps = {
  bridge: BridgeDeps
  store: TemplateStore
  provision: ProvisionStore
  newTemplateId: () => string
  newBlockId: () => string
  newFieldId: () => string
}

export function defaultProvisionDeps(provision: ProvisionStore): ProvisionDeps {
  return { bridge: defaultBridgeDeps(), store: createTemplateStore(), provision, newTemplateId: uuid7, newBlockId: randomUUID, newFieldId: uuid7 }
}

type OfficialSection = (typeof officialJson.sections)[number]

export function officialSections(): DraftSection[] {
  return (structuredClone(officialJson.sections) as OfficialSection[]).map((section) => ({
    key: section.key,
    title: section.title,
    orientation: (section as { orientation?: string }).orientation ?? "portrait",
    fields: section.fields.map((field) => ({
      key: field.key,
      label: (field as { label?: string | null }).label ?? null,
      responsible: field.quien_llena,
      content: fieldDocument(field.content) as PhpRecord,
    })),
  }))
}

let official: TemplateDefinition | null = null

export function officialDefinition(): TemplateDefinition {
  if (official !== null) return official
  const raw = structuredClone(officialJson) as Record<string, unknown>
  const picked = Object.fromEntries(Object.entries(raw).filter(([key]) => DEFINITION_KEYS.includes(key)))
  const sources = officialSections().map((section) => ({ key: section.key, fields: section.fields.map((field) => ({ key: field.key, quien_llena: field.responsible, content: field.content })) }))
  official = defineTemplate(picked, sources)
  return official
}

async function buildStructure(tx: ProvisionTx, deps: ProvisionDeps, templateId: string, structure: DraftSection[], definition: TemplateDefinition): Promise<void> {
  const sections: DocumentSection[] = []
  const fields: Omit<StoredField, "id">[] = []
  structure.forEach((section, sectionIndex) => {
    const blocks = section.fields.map((field, fieldIndex) => {
      const blockId = deps.newBlockId()
      fields.push({ templateId, blockId, responsible: field.responsible, content: contentForField(field.responsible, normalizeFieldDocument(fieldDocument(field.content), definition)) })
      return { id: blockId, key: field.key, title: field.label ?? "", position: fieldIndex + 1 }
    })
    sections.push({ id: deps.newBlockId(), key: section.key, title: section.title, orientation: section.orientation ?? "portrait", position: sectionIndex + 1, blocks })
  })
  await tx.syncDocument(templateId, sections)
  for (const field of fields) await tx.insertField({ id: deps.newFieldId(), ...field })
}

async function retireStructure(tx: ProvisionTx, templateId: string): Promise<void> {
  if (!(await tx.hasStructure(templateId))) return
  await tx.syncDocument(templateId, [])
  await tx.suffixRetiredSections(templateId)
}

async function lockedTemplate(tx: ProvisionTx, templateId: string): Promise<SyllabusTemplate> {
  const template = await tx.lockTemplate(templateId)
  if (template === null) throw new Missing()
  return template
}

async function guarded(original: Request, deps: ProvisionDeps, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof TemplateValidationError) return validationError(error.errors)
      throw error
    }
  })
}

async function processLock(deps: ProvisionDeps): Promise<Response | null> {
  return (await deps.provision.templateLocked()) ? validationError({ process: [PROCESS_LOCK_REASON] }) : null
}

export async function createTemplate(request: Request, deps: ProvisionDeps): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const input = await laravelInput(request.clone())
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!managesTemplates(session)) return laravelJson({ message: FORBIDDEN }, 403)
  const errors = await validateInput(input, { official: ["sometimes", "boolean"] }, { official: "formato oficial" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const isOfficial = laravelBoolean(input.official)
  const locked = await processLock(deps)
  if (locked !== null) return locked
  return guarded(original, deps, async () => {
    const templateId = await deps.provision.transaction(async (tx) => {
      if (await tx.anyTemplate()) throw new Rejected(validationError({ template: [TEMPLATE_EXISTS] }))
      const id = deps.newTemplateId()
      await tx.insertTemplate(id, officialDefinition())
      await tx.syncDocument(id, [])
      if (isOfficial) await buildStructure(tx, deps, id, officialSections(), officialDefinition())
      return id
    })
    return laravelJson({ message: isOfficial ? "Plantilla creada con el formato oficial." : "Plantilla vacía creada.", template_id: templateId }, 201)
  })
}

async function managed(request: Request, templateId: string, deps: ProvisionDeps): Promise<{ session: LaravelSession; template: SyllabusTemplate } | Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return laravelJson({ message: FORBIDDEN }, 403)
  return bound
}

export async function formatTemplate(request: Request, templateId: string, deps: ProvisionDeps): Promise<Response> {
  const original = request.clone()
  const bound = await managed(request, templateId, deps)
  if (bound instanceof Response) return bound
  const locked = await processLock(deps)
  if (locked !== null) return locked
  return guarded(original, deps, async () => {
    await deps.provision.transaction(async (tx) => {
      const template = await lockedTemplate(tx, bound.template.id)
      await retireStructure(tx, template.id)
      await buildStructure(tx, deps, template.id, officialSections(), template.definition ?? officialDefinition())
      await tx.saveDefinition(template.id, officialDefinition())
    })
    return laravelJson({ message: "Plantilla restablecida al formato oficial." })
  })
}

export async function clearTemplate(request: Request, templateId: string, deps: ProvisionDeps): Promise<Response> {
  const original = request.clone()
  const bound = await managed(request, templateId, deps)
  if (bound instanceof Response) return bound
  const locked = await processLock(deps)
  if (locked !== null) return locked
  return guarded(original, deps, async () => {
    await deps.provision.transaction(async (tx) => {
      const template = await lockedTemplate(tx, bound.template.id)
      await retireStructure(tx, template.id)
    })
    return laravelJson({ message: "Plantilla vaciada." })
  })
}

export async function importTemplateJson(request: Request, templateId: string, deps: ProvisionDeps): Promise<Response> {
  const original = request.clone()
  if (!isJsonRequest(request)) return deps.bridge.forward(original)
  const input = toRuntime(await laravelInput(request.clone())) as PhpRecord
  const bound = await managed(request, templateId, deps)
  if (bound instanceof Response) return bound
  const current = bound.template.definition
  if (current === null) return deps.bridge.forward(original)
  return guarded(original, deps, async () => {
    const draft = new DraftRequest(prepareDraft(input), current)
    const errors = await draft.errors()
    if (Object.keys(errors).length > 0) return validationError(errors)
    const locked = await processLock(deps)
    if (locked !== null) return locked
    const sections = validatedSections(draft.input)
    const definition = draft.definition()
    await deps.provision.transaction(async (tx) => {
      const template = await lockedTemplate(tx, bound.template.id)
      const previous = await tx.coordinationFields(template.id)
      await retireStructure(tx, template.id)
      await tx.saveDefinition(template.id, definition)
      await buildStructure(tx, deps, template.id, sections, definition)
      for (const [key, fieldId] of await tx.coordinationFields(template.id)) {
        const old = previous.get(key)
        if (old !== undefined && old !== fieldId) await tx.moveSubjectValues(old, fieldId)
      }
    })
    return laravelJson({ message: "Plantilla importada desde el JSON." })
  })
}
