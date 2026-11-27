import { BULK_NO_OPTIONS, BULK_UNDECIDED, subjectProfileBulkSchema } from "@silabos/shared/schemas/imports"
import { activeCareerId, resolveCareerScope } from "../academic/careerScope"
import { fromController } from "../auth/controllerResponse"
import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { modelNotFoundResponse } from "../http/failures"
import { requestInput, type PhpArray } from "../http/input"
import { MODELS } from "../http/models"
import { apiJson, jsonError, validationError } from "../http/responses"
import { routeAllows, unmatchedRoute } from "../http/router"
import { validateSchema } from "../http/schemaValidation"
import { requestBoolean } from "../syllabus/inProgressWorkHelpers"
import { Rejected, settle } from "../syllabus/reviewDecisions"
import { phpEquals, phpShape, phpObject } from "./phpValues"
import { careerProfileLockReason, profileContext, writableProfileContext } from "./subjectProfile"
import { fieldPending, presentedProfileFields, profileFields, subjectKeepsWork } from "./subjectProfileFields"
import { careerFieldDocument, FIELD_GONE, lockCareerSubject, usedProfileOptions, type SubjectProfileTx, type SubjectProfileWriteDeps } from "./subjectProfileWrites"
import { presentDefinition, variableCatalog } from "./templatePresentation"
import { normalizeFieldDocument, pendingResponses, responseTemplate, TemplateValidationError } from "./templateRuntime"

export const BULK_FOREIGN_SUBJECT = "Elija solo materias de la carrera que llevan sílabo."

export type SubjectProfileBulkDeps = SubjectProfileWriteDeps & {
  careerSubjects: (careerId: string) => Promise<string[]>
}

function rejectWith(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

function careerOf(session: AppSession, requestedCareerId: string | null, deps: SubjectProfileBulkDeps): Promise<string | Response> {
  return resolveCareerScope(session, requestedCareerId, activeCareerId(deps.careerActive), () => jsonError(403, ""))
}

const textList = (value: unknown): string[] => (typeof value === "object" && value !== null ? Object.values(value).map(String) : [])

export async function showSubjectProfileBulk(request: Request, deps: SubjectProfileBulkDeps, requestedCareerId: string | null = null): Promise<Response> {
  if (!routeAllows(request)) return unmatchedRoute(request)
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const careerId = await careerOf(session, requestedCareerId, deps)
  if (careerId instanceof Response) return careerId
  const context = await profileContext(deps.store)
  if (context === null) return fromController(modelNotFoundResponse(MODELS.template))
  try {
    const fields = profileFields(context)
    const subjects = await deps.careerSubjects(careerId)
    const rows = subjects.length === 0 || fields.length === 0 ? [] : await context.store.valuesForSubjects(subjects, fields.map((field) => field.id))
    const stored = new Map(rows.map((row) => [`${row.subjectId}:${row.fieldId}`, row.value]))
    const presented = presentedProfileFields(context, fields).map((shown, position) => ({
      ...shown,
      filled_subjects: subjects.filter((subjectId) => subjectKeepsWork(fields[position], stored.get(`${subjectId}:${shown.id}`) ?? null, context.definition)),
    }))
    return apiJson(
      phpShape({
        fields: presented,
        definition: presentDefinition(context.definition),
        variables: phpObject(Object.fromEntries(variableCatalog(context.definition).map((item) => [item.key, item.sample]))),
        lock_reason: await careerProfileLockReason(session, careerId, deps.careerBlock),
      }),
    )
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

async function fillSubjects(tx: SubjectProfileTx, session: AppSession, careerId: string, input: PhpArray, subjects: string[], replace: Set<string>, deps: SubjectProfileBulkDeps): Promise<number> {
  const ordered = subjects.toSorted()
  for (const subjectId of ordered) {
    if ((await lockCareerSubject(tx, session, subjectId, deps)) !== careerId) rejectWith({ subjects: [BULK_FOREIGN_SUBJECT] })
  }
  const context = await writableProfileContext(tx.store)
  const field = profileFields(context).find((candidate) => candidate.id === String(input.field_id))
  if (field === undefined) rejectWith({ field_id: [FIELD_GONE] })
  const document = careerFieldDocument(field, input.value, context, usedProfileOptions(context), "value")
  if (document !== null && pendingResponses(document).without_options > 0) rejectWith({ value: [BULK_NO_OPTIONS] })
  if (document === null || phpEquals(document, responseTemplate(normalizeFieldDocument(field.content, context.definition))) || fieldPending(field.content, document, context.definition)) {
    rejectWith({ value: [BULK_UNDECIDED] })
  }
  const rows = await tx.store.valuesForSubjects(ordered, [field.id])
  const stored = new Map(rows.map((row) => [row.subjectId, row.value]))
  const targets = ordered.filter((subjectId) => replace.has(subjectId) || !subjectKeepsWork(field, stored.get(subjectId) ?? null, context.definition))
  if (targets.length === 0) return 0
  return tx.keepContent(requestBoolean(input.confirm_purge), careerId, targets, async () => {
    for (const subjectId of targets) await tx.saveValue(subjectId, field.id, document)
    return targets.length
  })
}

export async function applySubjectProfileBulk(request: Request, deps: SubjectProfileBulkDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return unmatchedRoute(request)
  const session = await requireSession(request.clone(), { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const careerId = await careerOf(session, requestedCareerId, deps)
  if (careerId instanceof Response) return careerId
  const input = await requestInput(request)
  const { errors } = await validateSchema(subjectProfileBulkSchema, input)
  if (errors !== null) return validationError(errors)
  const subjects = textList(input.subjects)
  const replace = new Set(textList(input.replace))
  return settle(original, deps, async () => {
    const allowed = new Set(await deps.careerSubjects(careerId))
    if (subjects.some((subjectId) => !allowed.has(subjectId)) || [...replace].some((subjectId) => !subjects.includes(subjectId))) {
      return validationError({ subjects: [BULK_FOREIGN_SUBJECT] })
    }
    try {
      const applied = await deps.transaction((tx) => fillSubjects(tx, session, careerId, input, subjects, replace, deps))
      return apiJson({ message: "Campo llenado.", applied, skipped: subjects.length - applied })
    } catch (error) {
      if (error instanceof TemplateValidationError) return validationError(error.errors)
      throw error
    }
  })
}
