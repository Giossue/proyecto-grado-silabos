import { MODELS } from "../http/models"
import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { requestInput, type PhpArray } from "../http/input"
import { jsonError, validationError } from "../http/responses"
import { subjectProfileValuesSchema } from "@silabos/shared/schemas/imports"
import { validateSchema } from "../http/schemaValidation"
import { requestBoolean } from "../syllabus/inProgressWorkHelpers"
import { Missing, Rejected, settle } from "../syllabus/reviewDecisions"
import { isPhpArray, phpEquals, type PhpRecord } from "./phpValues"
import { keepsUsedOptions, keepsUsedResponses, USED_OPTION_REMOVED, USED_RESPONSE_REMOVED, usedOptions } from "./responseConditions"
import { careerProfileLockReason, defaultSubjectProfileDeps, mayManageSubjectProfile, type SubjectProfileDeps, subjectProfileResponse, writableProfileContext } from "./subjectProfile"
import { fieldPending, profileFields, storedAccepted, type ProfileContext } from "./subjectProfileFields"
import { createSubjectProfileWriteDeps } from "./subjectProfileWriteStore"
import { toRuntime } from "./templateDraft"
import { templateFields, type TemplateField } from "./templatePresentation"
import { careerResponse, fieldConditions, normalizeFieldDocument, responseTemplate, TemplateValidationError } from "./templateRuntime"
import type { TemplateStore } from "../shared/templateStore"
import { teacherEdits } from "./teacherText"
import { unmatchedRoute, modelNotFound, routeAllows } from "../http/router"

export interface SubjectProfileTx {
  store: TemplateStore
  lockSubject(subjectId: string): Promise<{ careerId: string } | null>
  careerEditable(careerId: string): Promise<boolean>
  deleteValue(subjectId: string, fieldId: string): Promise<void>
  saveValue(subjectId: string, fieldId: string, document: PhpRecord): Promise<void>
  keepContent<T>(confirmed: boolean, careerId: string, subjectIds: string[], change: () => Promise<T>): Promise<T>
}

export type SubjectProfileWriteDeps = SubjectProfileDeps & {
  transaction<T>(work: (tx: SubjectProfileTx) => Promise<T>): Promise<T>
}

export function defaultSubjectProfileWriteDeps(prisma: PrismaService): SubjectProfileWriteDeps {
  return { ...defaultSubjectProfileDeps(prisma), bridge: defaultBridgeDeps(), ...createSubjectProfileWriteDeps(prisma) }
}

export const FIELD_GONE = "El proyecto de carrera incluye un campo que ya no existe en la plantilla."

function rejectWith(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

export function usedProfileOptions(context: ProfileContext): Map<string, string[]> {
  return usedOptions(
    fieldConditions(context.definition),
    templateFields(context.template).map((field) => field.content),
  )
}

export function careerFieldDocument(field: TemplateField, value: unknown, context: ProfileContext, used: Map<string, string[]>, attribute: string): PhpRecord | null {
  const raw = toRuntime(value)
  const document = isPhpArray(raw) ? careerResponse(field.content, raw, context.definition, attribute) : null
  if (document !== null && used.size > 0 && !keepsUsedResponses(field.content, document, used)) rejectWith({ [attribute]: [USED_RESPONSE_REMOVED] })
  if (document !== null && used.size > 0 && !keepsUsedOptions(document, used)) rejectWith({ [attribute]: [USED_OPTION_REMOVED] })
  return document
}

export async function lockCareerSubject(tx: SubjectProfileTx, session: AppSession, subjectId: string, deps: Pick<SubjectProfileWriteDeps, "careerActive">): Promise<string> {
  const locked = await tx.lockSubject(subjectId)
  if (locked === null) throw new Missing(MODELS.subject)
  if (!(await mayManageSubjectProfile(session, locked.careerId, deps.careerActive))) throw new Rejected(jsonError(403, ""))
  const lockReason = await careerProfileLockReason(session, locked.careerId, tx.careerEditable)
  if (lockReason !== null) rejectWith({ process: [lockReason] })
  return locked.careerId
}

async function saveValues(tx: SubjectProfileTx, session: AppSession, subjectId: string, values: PhpArray, deps: SubjectProfileWriteDeps): Promise<void> {
  await lockCareerSubject(tx, session, subjectId, deps)
  const context = await writableProfileContext(tx.store)
  const allowed = new Map(profileFields(context).map((field) => [field.id, field]))
  const used = usedProfileOptions(context)
  const accepted = new Set((await tx.store.subjectValues(subjectId)).filter((row) => storedAccepted(row.value) && !teacherEdits(row.value)).map((row) => row.fieldId))
  const fieldIds = Object.keys(values)
  for (const fieldId of fieldIds) {
    const field = allowed.get(fieldId)
    if (field === undefined) throw new Missing(MODELS.field, fieldId)
    const document = careerFieldDocument(field, values[fieldId], context, used, `values.${fieldId}`)
    if (document !== null && accepted.has(fieldId) && fieldPending(field.content, document, context.definition)) continue
    if (document === null || phpEquals(document, responseTemplate(normalizeFieldDocument(field.content, context.definition)))) {
      await tx.deleteValue(subjectId, fieldId)
      continue
    }
    await tx.saveValue(subjectId, fieldId, document)
  }
}

export async function updateSubjectProfile(request: Request, subjectId: string, deps: SubjectProfileWriteDeps): Promise<Response> {
  const original = request.clone()
  if (!routeAllows(request)) return unmatchedRoute(request)
  let careerId: string | null = null
  const session = await requireSession(
    request.clone(),
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        careerId = await deps.subjectCareer(subjectId)
        return careerId === null ? modelNotFound(MODELS.subject, subjectId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (careerId === null) return modelNotFound(MODELS.subject, subjectId)
  const input = await requestInput(request)
  const { errors } = await validateSchema(subjectProfileValuesSchema, input)
  if (errors !== null) return validationError(errors)
  const context = await writableProfileContext(deps.store)
  const allowed = new Set(profileFields(context).map((field) => field.id))
  const values = input.values as PhpArray
  if (Object.keys(values).some((fieldId) => !allowed.has(fieldId))) return validationError({ values: [FIELD_GONE] })
  const career: string = careerId
  return settle(original, deps, async () => {
    try {
      await deps.transaction((tx) => tx.keepContent(requestBoolean(input.confirm_purge), career, [subjectId], () => saveValues(tx, session, subjectId, values, deps)))
    } catch (error) {
      if (error instanceof TemplateValidationError) return validationError(error.errors)
      throw error
    }
    return subjectProfileResponse(request, subjectId, deps, await careerProfileLockReason(session, career, deps.careerEditable))
  })
}
