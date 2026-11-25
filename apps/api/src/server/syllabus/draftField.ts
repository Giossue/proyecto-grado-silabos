import { fromController } from "../auth/controllerResponse"
import { HttpFailure, Missing, modelNotFoundResponse } from "../http/failures"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray, type PhpValue } from "../http/input"
import { expectsJson } from "../http/request"
import { forbidden, apiJson, validationError } from "../http/responses"
import { draftFieldSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { uuid7 } from "../http/uuid7"
import { phpIntCast, toRuntime } from "../configuration/templateDraft"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { fieldResponseNormalize, sameStructure } from "../configuration/templateRehearsal"
import { resolveVariables, teacherEditable, type TemplateField } from "../configuration/templatePresentation"
import { fieldLimitCount, fieldLimitMessage } from "../configuration/fieldLimit"
import { syllabusConditions } from "../configuration/responseConditions"
import {
  fieldConditions,
  fieldLimits,
  limitAllowed,
  normalizeFieldDocument,
  resolveDocument,
  TemplateValidationError,
  type TemplateDefinition,
} from "../configuration/templateRuntime"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import type { PhpRecord } from "../configuration/phpValues"
import { institutionToday } from "../dashboard/dashboardQueries"
import { identificationOf, type IdentificationSource } from "./identificationCard"
import { mayEdit, type SyllabusFacts } from "./policy"
import { createDraftFieldStore } from "./draftFieldStore"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export type DraftSyllabus = SyllabusFacts & { subjectId: string }
export type DraftFieldRecord = { id: string; templateId: string; responsible: string; content: unknown; key: string; live: boolean }
export type LockedSyllabus = { id: string; state: string; version: number; subjectId: string }

export interface DraftFieldTx {
  lockSyllabus(id: string): Promise<LockedSyllabus | null>
  templateStore: TemplateStore
  values(syllabusId: string): Promise<Map<string, unknown>>
  valueExists(syllabusId: string, fieldId: string): Promise<boolean>
  saveValue(syllabusId: string, fieldId: string, document: PhpRecord, newId: string): Promise<void>
  saveDraft(syllabusId: string, version: number, savedAt: number): Promise<void>
}

export interface DraftFieldStore {
  syllabus(id: string, userId: string): Promise<DraftSyllabus | null>
  field(id: string): Promise<DraftFieldRecord | null>
  transaction<T>(work: (tx: DraftFieldTx) => Promise<T>): Promise<T>
  storedValue(syllabusId: string, fieldId: string): Promise<unknown>
  identification(syllabusId: string): Promise<IdentificationSource>
}

export type DraftFieldDeps = {
  bridge: BridgeDeps
  store: DraftFieldStore
  templates: TemplateStore
  today: () => string
  now: () => number
  newId: () => string
}

export function defaultDraftFieldDeps(): DraftFieldDeps {
  return {
    bridge: defaultBridgeDeps(),
    store: createDraftFieldStore(),
    templates: createTemplateStore(),
    today: institutionToday,
    now: () => Math.floor(Date.now() / 1000),
    newId: uuid7,
  }
}

const CONFLICT = "El borrador cambió en otra sesión. Recarga antes de continuar."
const EMPTY_DOCUMENT: PhpRecord = { type: "doc", content: [{ type: "paragraph" }] }

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

function reject(attribute: string, message: string): never {
  throw new Rejected(validationError({ [attribute]: [message] }))
}

export function isoFromSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00")
}

type Bound = { session: AppSession; syllabus: DraftSyllabus; field: DraftFieldRecord }

async function bound(request: Request, syllabusId: string, fieldId: string, deps: DraftFieldDeps): Promise<Bound | Response> {
  let syllabus: DraftSyllabus | null = null
  let field: DraftFieldRecord | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
        if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
        field = isUuid(fieldId) ? await deps.store.field(fieldId) : null
        return field === null ? modelNotFound(MODELS.field, fieldId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
  if (field === null) return modelNotFound(MODELS.field, fieldId)
  return { session, syllabus, field }
}

function conflict(request: Request, version: number): Response {
  return expectsJson(request)
    ? apiJson({ message: CONFLICT, code: "conflicto_version_borrador", version_bloqueo_actual: version }, 409)
    : apiJson({ message: CONFLICT }, 409)
}

async function save(input: PhpArray, auth: Bound, deps: DraftFieldDeps, tx: DraftFieldTx, original: Request): Promise<{ version: number; savedAt: number; definition: TemplateDefinition }> {
  const locked = await tx.lockSyllabus(auth.syllabus.id)
  if (locked === null) throw new Missing(MODELS.syllabus, auth.syllabus.id)
  if (locked.version !== phpIntCast(input.version_bloqueo)) throw new Rejected(conflict(original, locked.version))
  if (!["borrador", "correccion_solicitada"].includes(locked.state)) reject("syllabus", "El expediente no está en estado editable.")
  const template = await tx.templateStore.template()
  if (template === null) throw new Missing(MODELS.template)
  const definition = template.definition
  const { field } = auth
  if (field.templateId !== template.id || (!field.live && !(await tx.valueExists(locked.id, field.id)))) reject("field", "El campo no pertenece a la plantilla vigente.")
  const templates = await profileTemplates({ template, definition, store: tx.templateStore }, locked.subjectId)
  const asTemplateField = { id: field.id, responsible: field.responsible } as TemplateField
  if (!teacherEditable(asTemplateField, templates)) reject("field", "Este campo pertenece a Coordinación o a la institución y el docente no puede cambiarlo.")
  const value = input.value === undefined || input.value === null ? EMPTY_DOCUMENT : input.value
  const document = fieldResponseNormalize(templates[field.id] ?? field.content, value, definition, "value")
  if (!sameStructure(normalizeFieldDocument(field.content, definition), document)) reject("value", "Los bloques de este campo los define la plantilla; el docente solo los responde.")
  const limit = limitAllowed(field.responsible) ? (fieldLimits(definition)[field.key] ?? null) : null
  const fieldTemplate = templates[field.id] ?? field.content
  const conditions = (values: Map<string, unknown>) => syllabusConditions(template, fieldConditions(definition), values, templates)
  const storedValues = limit === null ? null : await tx.values(locked.id)
  const before = storedValues === null ? 0 : fieldLimitCount(fieldTemplate, storedValues.get(field.id) ?? null, conditions(storedValues).answers, definition)
  await tx.saveValue(locked.id, field.id, document, deps.newId())
  if (limit !== null && storedValues !== null) {
    const after = conditions(new Map([...storedValues, [field.id, document]]))
    const written = after.hidden.has(field.id) ? 0 : fieldLimitCount(fieldTemplate, document, after.answers, definition)
    if (written > limit && written > before) reject("value", fieldLimitMessage(limit))
  }
  const version = locked.version + 1
  const savedAt = deps.now()
  await tx.saveDraft(locked.id, version, savedAt)
  return { version, savedAt, definition }
}

function documentErrors(value: PhpValue | undefined, definition: TemplateDefinition): Record<string, string[]> | null {
  if (value === undefined || value === null) return null
  try {
    normalizeFieldDocument(value, definition, "value")
    return null
  } catch (error) {
    if (error instanceof TemplateValidationError) return error.errors
    throw error
  }
}

export async function updateDraftField(request: Request, syllabusId: string, fieldId: string, deps: DraftFieldDeps = defaultDraftFieldDeps()): Promise<Response> {
  const original = request.clone()
  const auth = await bound(original, syllabusId, fieldId, deps)
  if (auth instanceof Response) return auth
  if (!mayEdit(auth.session, auth.syllabus, deps.today())) return forbidden()
  const current = await deps.templates.template()
  if (current === null) return fromController(modelNotFoundResponse(MODELS.template))
  const definition = current.definition
  const input = toRuntime(await requestInput(request)) as PhpArray
  const errors = documentErrors(input.value, definition) ?? (await validateSchema(draftFieldSchema, input)).errors
  if (errors !== null) return validationError(errors)
  let saved: Awaited<ReturnType<typeof save>>
  try {
    saved = await deps.store.transaction((tx) => save(input, auth, deps, tx, original))
  } catch (error) {
    if (error instanceof Rejected) return error.response
    if (error instanceof HttpFailure) return error.response
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
  const stored = await deps.store.storedValue(auth.syllabus.id, auth.field.id)
  const variables = resolveVariables(saved.definition, { identification: identificationOf(await deps.store.identification(auth.syllabus.id)) })
  return apiJson({
    message: "Borrador guardado.",
    version_bloqueo: saved.version,
    guardado_en: isoFromSeconds(saved.savedAt),
    document: resolveDocument(normalizeFieldDocument(stored ?? auth.field.content, saved.definition), variables, saved.definition),
  })
}
