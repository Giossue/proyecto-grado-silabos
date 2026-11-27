import { addsNothing, openShape, teacherDefault, teacherEdits, writtenValue } from "../configuration/teacherText"
import { HttpFailure, Missing } from "../http/failures"
import type { PrismaService } from "../../prisma/prisma.service"
import { ruleFailures } from "@silabos/shared/lib/blocks/rules"
import type { BlockRule } from "@silabos/shared/lib/blocks/types"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { aborted, apiJson } from "../http/responses"
import { fieldLimitCount, fieldLimitExceeded } from "../configuration/fieldLimit"
import { isPhpArray, list, record, type PhpRecord } from "../configuration/phpValues"
import { clearHidden, shownResponses, syllabusConditions, type Answers } from "../configuration/responseConditions"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { documentIsEmpty, fieldResponseNormalize } from "../configuration/templateRehearsal"
import { resolveVariables, teacherEditable, type TemplateField } from "../configuration/templatePresentation"
import {
  awaitsRows,
  normalizeFieldDocument,
  fieldDocumentIsEmpty,
  blank,
  fieldConditions,
  fieldLimits,
  foundResponses,
  isDocument,
  limitAllowed,
  listTable,
  pendingResponses,
  RESPONSE_NODE,
  responseAnswered,
  responseAttrs,
  responseRequired,
  responsesEnabled,
  responseTemplate,
  TemplateValidationError,
  type TemplateDefinition,
} from "../configuration/templateRuntime"
import type { TemplateStore } from "../shared/templateStore"
import { institutionToday } from "../shared/clock"
import type { DraftSyllabus, LockedSyllabus } from "./draftField"
import { identificationOf, type IdentificationSource } from "./identificationCard"
import { mayEdit } from "./policy"
import { createDraftValidationStore } from "./draftValidationQueries"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "./boundSession"

export type ValidationField = { id: string; key: string; responsible: string; content: unknown; displayName: string }
export type ValidationIssue = { field_id: string | null; code: string; severity: string; message: string }

export interface DraftValidationTx {
  lockSyllabus(id: string): Promise<LockedSyllabus | null>
  templateStore: TemplateStore
  documentFields(id: string): Promise<ValidationField[]>
  values(id: string): Promise<Map<string, unknown>>
  identification(id: string): Promise<IdentificationSource>
}

export interface DraftValidationStore {
  syllabus(id: string, userId: string): Promise<DraftSyllabus | null>
  transaction<T>(work: (tx: DraftValidationTx) => Promise<T>): Promise<T>
}

export type DraftValidationDeps = { bridge: BridgeDeps; store: DraftValidationStore; today: () => string }

export function defaultDraftValidationDeps(prisma: PrismaService): DraftValidationDeps {
  return { bridge: defaultBridgeDeps(), store: createDraftValidationStore(prisma), today: institutionToday }
}

function answered(template: PhpRecord, value: PhpRecord, definition: TemplateDefinition): boolean {
  if (template.type === RESPONSE_NODE) return !responseAnswered(template.attrs ?? []) && responseAnswered(value.attrs ?? [])
  if (blank(template) || template.type === "documentBlock") return !documentIsEmpty({ type: "doc", content: [value] }, definition)
  const rows = list(template.content ?? [])
  const repeats = template.type === "table" && listTable(template)
  return list(value.content ?? []).some((child, index) => {
    const source = rows[index] ?? (repeats ? (rows[rows.length - 1] ?? null) : null)
    return isPhpArray(source) && answered(record(source), record(child), definition)
  })
}

function responseIsEmpty(template: unknown, value: unknown, definition: TemplateDefinition): boolean {
  if (!responsesEnabled(definition)) return documentIsEmpty(value, definition)
  if (!isDocument(value)) return true
  return !answered(responseTemplate(record(template)), record(value), definition)
}

function asksForAnswer(template: PhpRecord): boolean {
  const type = template.type ?? ""
  if (type === "tableHeader") return false
  if (type === RESPONSE_NODE) {
    const attrs = template.attrs ?? []
    return responseRequired(attrs) && !responseAnswered(attrs)
  }
  return blank(template) || type === "documentBlock" || list(template.content ?? []).some((child) => asksForAnswer(record(child)))
}

function violations(document: unknown): string[] {
  const messages: string[] = []
  for (const attrs of foundResponses(document)) {
    try {
      responseAttrs(attrs)
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error
      const message = Object.values(error.errors).flat()[0]
      if (message !== undefined && !messages.includes(message)) messages.push(message)
    }
  }
  return messages
}

function blockIssues(field: ValidationField, value: unknown, variables: Record<string, string>, definition: TemplateDefinition): ValidationIssue[] {
  if (!isDocument(value)) return []
  const content = record(value).content
  return list(isPhpArray(content) ? content : []).flatMap((node) => {
    if (!isPhpArray(node) || record(node).type !== "documentBlock") return []
    const attrs = isPhpArray(record(node).attrs) ? record(record(node).attrs) : {}
    const kind = attrs.kind
    const block = typeof kind === "string" ? definition.blocks[kind] : undefined
    if (block === undefined || block === null) return []
    const rules = list(record(block).rules ?? []) as BlockRule[]
    const blockValue = isPhpArray(attrs.value) ? record(attrs.value) : {}
    return ruleFailures(rules, blockValue, variables, "submit").map((failure) => ({ field_id: field.id, code: failure.code, severity: "error", message: failure.message }))
  })
}

function fieldIssues(
  field: ValidationField,
  original: unknown,
  stored: unknown,
  answers: Answers,
  limit: number | null,
  variables: Record<string, string>,
  definition: TemplateDefinition,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const issue = (code: string, message: string) => issues.push({ field_id: field.id, code, severity: "error", message })
  const rewritable = teacherEdits(original)
  const template = clearHidden(original, answers, true)
  const shown = clearHidden(stored, answers, true)
  const unfilledRows = rewritable && teacherDefault(original) && awaitsRows(original, definition) && (!isDocument(stored) || addsNothing(normalizeFieldDocument(original, definition), normalizeFieldDocument(stored, definition)))
  const empty = rewritable
    ? unfilledRows || fieldDocumentIsEmpty(isDocument(stored) ? stored : original, definition)
    : responseIsEmpty(template, shown, definition) && (!responsesEnabled(definition) || asksForAnswer(responseTemplate(record(template))))
  const shownAnswers = shownResponses(isDocument(stored) ? stored : original, answers)
  const pending = pendingResponses(shownAnswers)
  const name = field.displayName
  if (empty) issue("campo_obligatorio_faltante", `«${name}» está vacío. Complétalo antes de enviar.`)
  if (pending.without_options > 0) issue("respuesta_sin_opciones", `«${name}» tiene una respuesta sin opciones para elegir: pídalas al coordinador.`)
  if (!empty && pending.unanswered > 0) issue("respuesta_faltante", `«${name}» tiene una respuesta sin contestar. Elija una opción o escriba la respuesta antes de enviar.`)
  for (const violation of violations(shownAnswers)) issue("respuesta_fuera_de_limite", `«${name}»: ${violation}`)
  if (responsesEnabled(definition) && isPhpArray(stored)) {
    try {
      fieldResponseNormalize(original, stored, definition, "value", field.content)
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error
      issue("estructura_respuesta_modificada", "El formato de este campo cambió. Complete las respuestas en la estructura vigente.")
    }
  }
  const written = limit === null ? 0 : fieldLimitCount(original, stored, answers, definition)
  if (limit !== null && written > limit) issue("campo_supera_limite", fieldLimitExceeded(name, limit, written))
  return [...issues, ...blockIssues(field, stored, variables, definition)]
}

async function runValidation(tx: DraftValidationTx, syllabusId: string) {
  const locked = await tx.lockSyllabus(syllabusId)
  if (locked === null) throw new Missing(MODELS.syllabus, syllabusId)
  const template = await tx.templateStore.template()
  if (template === null) throw new Missing(MODELS.template)
  const definition = template.definition
  const values = await tx.values(locked.id)
  const variables = resolveVariables(definition, { identification: identificationOf(await tx.identification(locked.id)) })
  const templates = await profileTemplates({ template, definition, store: tx.templateStore }, locked.subjectId)
  const conditions = syllabusConditions(template, fieldConditions(definition), values, templates)
  const limits = fieldLimits(definition)
  const issues: ValidationIssue[] = []
  for (const field of await tx.documentFields(locked.id)) {
    if (!teacherEditable({ id: field.id, responsible: field.responsible } as TemplateField, templates) || conditions.hidden.has(field.id)) continue
    const limit = limitAllowed(field.responsible) && !teacherEdits(templates[field.id]) ? (limits[field.key] ?? null) : null
    const source = templates[field.id] ?? field.content
    const held = writtenValue(source, values.get(field.id) ?? null)
    issues.push(...fieldIssues(field, openShape(source), held, conditions.answers, limit, variables, definition))
  }
  return { version: locked.version, issues }
}

export function draftValidationBinder(syllabusId: string, deps: Pick<DraftValidationDeps, "store">): Binder<DraftSyllabus> {
  return async (user) => {
    const syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
    return syllabus === null ? modelNotFound(MODELS.syllabus, syllabusId) : syllabus
  }
}

export async function validateDraft(request: Request, syllabusId: string, deps: DraftValidationDeps): Promise<Response> {
  const bound = await requireBound(request, draftValidationBinder(syllabusId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return validateDraftFor(bound.session, bound.bound, deps)
}

export async function validateDraftFor(session: AppSession, syllabus: DraftSyllabus, deps: DraftValidationDeps): Promise<Response> {
  if (!mayEdit(session, syllabus, deps.today())) return aborted(403)
  let result: Awaited<ReturnType<typeof runValidation>>
  try {
    result = await deps.store.transaction((tx) => runValidation(tx, (syllabus as DraftSyllabus).id))
  } catch (error) {
    if (error instanceof HttpFailure) return error.response
    throw error
  }
  const blocking = result.issues.filter((issue) => issue.severity === "error").length
  return apiJson({
    message: blocking === 0 ? "Validación completada sin errores bloqueantes." : "Validación completada. Revise los campos señalados.",
    validation: { version_bloqueo: result.version, blocking_errors: blocking, warnings: result.issues.length - blocking, results: result.issues },
  })
}
