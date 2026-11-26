import { emptyResponse, FREE_TEXT_KIND, TEMPLATE_ACCEPTED } from "@silabos/shared/lib/responseKinds"
import { subjectProfileBulkSchema, type SubjectProfileBulkAction } from "@silabos/shared/schemas/imports"
import { activeCareerId, resolveCareerScope } from "../academic/careerScope"
import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { requestInput } from "../http/input"
import { apiJson, jsonError, validationError } from "../http/responses"
import { routeAllows, unmatchedRoute } from "../http/router"
import { validateSchema } from "../http/schemaValidation"
import { requestBoolean } from "../syllabus/inProgressWorkHelpers"
import { Rejected, settle } from "../syllabus/reviewDecisions"
import type { PhpRecord } from "./phpValues"
import { writableProfileContext } from "./subjectProfile"
import { fieldPending, profileFields, type ProfileContext } from "./subjectProfileFields"
import { careerFieldDocument, FIELD_GONE, lockCareerSubject, usedProfileOptions, type SubjectProfileTx, type SubjectProfileWriteDeps } from "./subjectProfileWrites"
import type { TemplateField } from "./templatePresentation"
import { fieldDocumentIsEmpty, normalizeFieldDocument, responseTemplate, TemplateValidationError } from "./templateRuntime"

export type BulkSummary = { applied: number; skipped: number; not_applicable: number }

const APPLIED = "Acción masiva aplicada."

function teacherSpace(): PhpRecord {
  return { type: "doc", content: [{ type: "paragraph", content: [emptyResponse(FREE_TEXT_KIND)] }] }
}

function actionDocument(field: TemplateField, action: SubjectProfileBulkAction, context: ProfileContext, used: Map<string, string[]>): PhpRecord | null {
  const { definition } = context
  let document: PhpRecord | null
  try {
    if (action === "plantilla") {
      if (fieldDocumentIsEmpty(field.content, definition)) return null
      const template = careerFieldDocument(field, responseTemplate(normalizeFieldDocument(field.content, definition)), context, used, "value")
      document = template === null ? null : { ...template, attrs: { [TEMPLATE_ACCEPTED]: true } }
    } else {
      document = careerFieldDocument(field, teacherSpace(), context, used, "value")
    }
  } catch (error) {
    if (error instanceof TemplateValidationError || error instanceof Rejected) return null
    throw error
  }
  return document === null || fieldPending(field.content, document, definition) ? null : document
}

async function applyBulk(
  tx: SubjectProfileTx,
  session: AppSession,
  careerId: string,
  subjectIds: string[],
  fieldIds: string[] | null,
  action: SubjectProfileBulkAction,
  deps: SubjectProfileWriteDeps,
): Promise<BulkSummary> {
  for (const subjectId of subjectIds) {
    if ((await lockCareerSubject(tx, session, subjectId, deps)) !== careerId) throw new Rejected(jsonError(403, ""))
  }
  const context = await writableProfileContext(tx.store)
  const fields = profileFields(context).filter((field) => fieldIds === null || fieldIds.includes(field.id))
  const used = usedProfileOptions(context)
  const stored = await tx.store.valuesForSubjects(
    subjectIds,
    fields.map((field) => field.id),
  )
  const summary: BulkSummary = { applied: 0, skipped: 0, not_applicable: 0 }
  const documents = new Map<string, PhpRecord | null>()
  for (const subjectId of subjectIds) {
    for (const field of fields) {
      const row = stored.find((value) => value.subjectId === subjectId && value.fieldId === field.id)
      if (!fieldPending(field.content, row?.value ?? null, context.definition)) {
        summary.skipped++
        continue
      }
      if (!documents.has(field.id)) documents.set(field.id, actionDocument(field, action, context, used))
      const document = documents.get(field.id) ?? null
      if (document === null) {
        summary.not_applicable++
        continue
      }
      await tx.saveValue(subjectId, field.id, document)
      summary.applied++
    }
  }
  return summary
}

function idsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "object" && value !== null) return Object.values(value).map(String)
  return []
}

export async function bulkSubjectProfiles(request: Request, deps: SubjectProfileWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return unmatchedRoute(request)
  const session = await requireSession(request.clone(), { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const careerId = await resolveCareerScope(session, requestedCareerId, activeCareerId(deps.careerActive), () => jsonError(403, ""))
  if (careerId instanceof Response) return careerId
  const input = await requestInput(request)
  const { errors } = await validateSchema(subjectProfileBulkSchema, input)
  if (errors !== null) return validationError(errors)
  const subjectIds = idsOf(input.subjects)
  const fieldIds = input.fields === undefined || input.fields === null || idsOf(input.fields).length === 0 ? null : idsOf(input.fields)
  const action = input.action as SubjectProfileBulkAction
  const allowed = new Set(profileFields(await writableProfileContext(deps.store)).map((field) => field.id))
  if (fieldIds !== null && fieldIds.some((fieldId) => !allowed.has(fieldId))) return validationError({ fields: [FIELD_GONE] })
  return settle(original, deps, async () => {
    try {
      const summary = await deps.transaction((tx) =>
        tx.keepContent(requestBoolean(input.confirm_purge), careerId, subjectIds, () => applyBulk(tx, session, careerId, subjectIds, fieldIds, action, deps)),
      )
      return apiJson({ message: APPLIED, ...summary })
    } catch (error) {
      if (error instanceof TemplateValidationError) return validationError(error.errors)
      throw error
    }
  })
}
