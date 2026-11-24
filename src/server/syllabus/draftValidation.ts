import "server-only"
import { ruleFailures } from "@/lib/blocks/rules"
import type { BlockRule } from "@/lib/blocks/types"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { aborted, laravelJson } from "../laravel/responses"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { fieldLimitCount, fieldLimitExceeded } from "../configuration/fieldLimit"
import { isPhpArray, list, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { clearHidden, shownResponses, syllabusConditions, type Answers } from "../configuration/responseConditions"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { documentIsEmpty, fieldResponseNormalize } from "../configuration/templateRehearsal"
import { resolveVariables, teacherEditable, type TemplateField } from "../configuration/templatePresentation"
import {
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
import type { TemplateStore } from "../configuration/templateStore"
import { institutionToday } from "../dashboard/dashboardQueries"
import type { DraftSyllabus, LockedSyllabus } from "./draftField"
import { identificationOf, type IdentificationSource } from "./identificationCard"
import { mayEdit } from "./policy"
import { createDraftValidationStore } from "./draftValidationQueries"
import { modelNotFound } from "../laravel/router"
import { MODELS } from "../laravel/models"

export type ValidationField = { id: string; key: string; responsible: string; content: unknown; displayName: string }
export type ValidationTeacher = { id: string; name: string; formation: string | null }
export type ValidationIssue = { field_id: string | null; code: string; severity: string; message: string }

export interface DraftValidationTx {
  lockSyllabus(id: string): Promise<LockedSyllabus | null>
  templateStore: TemplateStore
  hasArchivedValues(id: string): Promise<boolean>
  liveFields(): Promise<ValidationField[]>
  values(id: string): Promise<Map<string, unknown>>
  identification(id: string): Promise<IdentificationSource>
  teachers(id: string): Promise<ValidationTeacher[]>
  recordAudit(event: AuditEventInput): Promise<void>
}

export interface DraftValidationStore {
  syllabus(id: string, userId: string): Promise<DraftSyllabus | null>
  transaction<T>(work: (tx: DraftValidationTx) => Promise<T>): Promise<T>
}

export type DraftValidationDeps = { bridge: BridgeDeps; store: DraftValidationStore; today: () => string; now: () => number }

export function defaultDraftValidationDeps(): DraftValidationDeps {
  return { bridge: defaultBridgeDeps(), store: createDraftValidationStore(), today: institutionToday, now: () => Math.floor(Date.now() / 1000) }
}

const RULE_VERSION = "field-document-v13"

class Missing extends Error {}

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
  const template = clearHidden(original, answers, true)
  const shown = clearHidden(stored, answers, true)
  const empty = responseIsEmpty(template, shown, definition) && (!responsesEnabled(definition) || asksForAnswer(responseTemplate(record(template))))
  const shownAnswers = shownResponses(isDocument(stored) ? stored : original, answers)
  const pending = pendingResponses(shownAnswers)
  const name = field.displayName
  if (empty) issue("campo_obligatorio_faltante", `«${name}» está vacío. Complétalo antes de enviar.`)
  if (pending.without_options > 0) issue("respuesta_sin_opciones", `«${name}» tiene una respuesta sin opciones para elegir: pídalas al coordinador.`)
  if (!empty && pending.unanswered > 0) issue("respuesta_faltante", `«${name}» tiene una respuesta sin contestar. Elija una opción o escriba la respuesta antes de enviar.`)
  for (const violation of violations(shownAnswers)) issue("respuesta_fuera_de_limite", `«${name}»: ${violation}`)
  if (responsesEnabled(definition) && isPhpArray(stored)) {
    try {
      fieldResponseNormalize(original, stored, definition)
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error
      issue("estructura_respuesta_modificada", "El formato de este campo cambió. Complete las respuestas en la estructura vigente.")
    }
  }
  const written = limit === null ? 0 : fieldLimitCount(original, stored, answers, definition)
  if (limit !== null && written > limit) issue("campo_supera_limite", fieldLimitExceeded(name, limit, written))
  return [...issues, ...blockIssues(field, stored, variables, definition)]
}

async function runValidation(tx: DraftValidationTx, session: LaravelSession, syllabusId: string, now: () => number) {
  const locked = await tx.lockSyllabus(syllabusId)
  if (locked === null) throw new Missing()
  const template = await tx.templateStore.template()
  if (template === null || template.definition === null || (await tx.hasArchivedValues(locked.id))) throw new Missing()
  const definition = template.definition
  const values = await tx.values(locked.id)
  const variables = resolveVariables(definition, { identification: identificationOf(await tx.identification(locked.id)) })
  const templates = await profileTemplates({ template, definition, store: tx.templateStore }, locked.subjectId)
  const conditions = syllabusConditions(template, fieldConditions(definition), values, templates)
  const limits = fieldLimits(definition)
  const issues: ValidationIssue[] = []
  for (const field of await tx.liveFields()) {
    if (!teacherEditable({ id: field.id, responsible: field.responsible } as TemplateField, templates) || conditions.hidden.has(field.id)) continue
    const limit = limitAllowed(field.responsible) ? (limits[field.key] ?? null) : null
    issues.push(...fieldIssues(field, templates[field.id] ?? field.content, values.get(field.id) ?? null, conditions.answers, limit, variables, definition))
  }
  if (Object.values(definition.variables).some((variable) => variable.source === "identification.formation")) {
    for (const teacher of await tx.teachers(locked.id)) {
      if (phpTrim(teacher.formation ?? "") !== "") continue
      issues.push({
        field_id: null,
        code: "formacion_docente_faltante",
        severity: "error",
        message:
          teacher.id === session.user.id
            ? "Falta su formación y experiencia académica-investigativa. Complétela antes de enviar."
            : `Falta la formación y experiencia académica-investigativa de ${teacher.name}.`,
      })
    }
  }
  await tx.recordAudit({
    actorId: session.user.id,
    roleAssignmentId: session.activeRole?.id ?? null,
    action: "silabo.validado",
    resourceType: "silabo",
    resourceId: locked.id,
    result: "exito",
    metadata: { rule_version: RULE_VERSION, blocking_errors: issues.length },
    occurredAt: now(),
  })
  return { version: locked.version, issues }
}

export async function validateDraft(request: Request, syllabusId: string, deps: DraftValidationDeps = defaultDraftValidationDeps()): Promise<Response> {
  const original = request.clone()
  let syllabus: DraftSyllabus | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
        return syllabus === null ? modelNotFound(MODELS.syllabus, syllabusId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
  if (!mayEdit(session, syllabus, deps.today())) return aborted(403)
  let result: Awaited<ReturnType<typeof runValidation>>
  try {
    result = await deps.store.transaction((tx) => runValidation(tx, session, (syllabus as DraftSyllabus).id, deps.now))
  } catch (error) {
    if (error instanceof Missing) return deps.bridge.forward(original)
    throw error
  }
  const blocking = result.issues.filter((issue) => issue.severity === "error").length
  return laravelJson({
    message: blocking === 0 ? "Validación completada sin errores bloqueantes." : "Validación completada. Revise los campos señalados.",
    validation: { version_bloqueo: result.version, blocking_errors: blocking, warnings: result.issues.length - blocking, results: result.issues },
  })
}
