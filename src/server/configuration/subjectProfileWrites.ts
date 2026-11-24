import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput, type PhpArray } from "../laravel/input"
import { laravelHttpError, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { laravelBoolean } from "../syllabus/inProgressWork"
import { Missing, Rejected, settle } from "../syllabus/reviewDecisions"
import { isPhpArray, phpEquals, type PhpRecord } from "./phpValues"
import { keepsUsedOptions, USED_OPTION_REMOVED, usedOptions } from "./responseConditions"
import { defaultSubjectProfileDeps, mayManageSubjectProfile, profileContext, subjectProfileResponse, type SubjectProfileDeps } from "./subjectProfile"
import { profileFields } from "./subjectProfileFields"
import { createSubjectProfileWriteDeps } from "./subjectProfileWriteStore"
import { toRuntime } from "./templateDraft"
import { templateFields } from "./templatePresentation"
import { careerResponse, fieldConditions, normalizeFieldDocument, responseTemplate, TemplateValidationError } from "./templateRuntime"
import type { TemplateStore } from "./templateStore"

export interface SubjectProfileTx {
  store: TemplateStore
  lockSubject(subjectId: string): Promise<{ careerId: string } | null>
  careerLocked(careerId: string): Promise<boolean>
  deleteValue(subjectId: string, fieldId: string): Promise<void>
  saveValue(subjectId: string, fieldId: string, document: PhpRecord): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
  keepContent<T>(confirmed: boolean, careerId: string, subjectIds: string[], change: () => Promise<T>): Promise<T>
}

export type SubjectProfileWriteDeps = SubjectProfileDeps & {
  now: () => number
  transaction<T>(work: (tx: SubjectProfileTx) => Promise<T>): Promise<T>
}

export function defaultSubjectProfileWriteDeps(): SubjectProfileWriteDeps {
  return { ...defaultSubjectProfileDeps(), bridge: defaultBridgeDeps(), ...createSubjectProfileWriteDeps() }
}

const FIELD_GONE = "El proyecto de carrera incluye un campo que ya no existe en la plantilla."
const CONVOCATION_LOCK = "Convocatoria activa"

function rejectWith(errors: Record<string, string[]>): never {
  throw new Rejected(validationError(errors))
}

async function saveValues(tx: SubjectProfileTx, session: LaravelSession, subjectId: string, values: PhpArray, deps: SubjectProfileWriteDeps): Promise<void> {
  const locked = await tx.lockSubject(subjectId)
  if (locked === null) throw new Missing()
  if (!(await mayManageSubjectProfile(session, locked.careerId, deps.careerActive))) throw new Rejected(laravelHttpError(403, ""))
  if (await tx.careerLocked(locked.careerId)) rejectWith({ process: [CONVOCATION_LOCK] })
  const context = await profileContext(tx.store)
  if (context === null) throw new Missing()
  const allowed = new Map(profileFields(context).map((field) => [field.id, field]))
  const used = usedOptions(
    fieldConditions(context.definition),
    templateFields(context.template).map((field) => field.content),
  )
  const fieldIds = Object.keys(values)
  for (const fieldId of fieldIds) {
    const field = allowed.get(fieldId)
    if (field === undefined) throw new Missing()
    const raw = toRuntime(values[fieldId])
    const document = isPhpArray(raw) ? careerResponse(field.content, raw, context.definition, `values.${fieldId}`) : null
    if (document !== null && used.size > 0 && !keepsUsedOptions(document, used)) rejectWith({ [`values.${fieldId}`]: [USED_OPTION_REMOVED] })
    if (document === null || phpEquals(document, responseTemplate(normalizeFieldDocument(field.content, context.definition)))) {
      await tx.deleteValue(subjectId, fieldId)
      continue
    }
    await tx.saveValue(subjectId, fieldId, document)
  }
  await tx.recordAudit({
    actorId: session.user.id,
    roleAssignmentId: session.activeRole?.id ?? null,
    action: "academico.ficha_asignatura.guardada",
    resourceType: "asignatura",
    resourceId: subjectId,
    result: "exito",
    metadata: { campos: fieldIds.length },
    occurredAt: deps.now(),
  })
}

export async function updateSubjectProfile(request: Request, subjectId: string, deps: SubjectProfileWriteDeps = defaultSubjectProfileWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!isUuid(subjectId)) return deps.bridge.forward(original)
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  let careerId: string | null = null
  const session = await requireSession(
    request.clone(),
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        careerId = await deps.subjectCareer(subjectId)
        return careerId === null ? deps.bridge.forward(original.clone()) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (careerId === null) return deps.bridge.forward(original)
  const input = await laravelInput(request)
  const errors = await validateInput(
    input,
    { values: ["present", "array"], "values.*": ["nullable", "array"] },
    { values: "datos del proyecto de carrera", "values.*": "dato del proyecto de carrera" },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const context = await profileContext(deps.store)
  if (context === null) return deps.bridge.forward(original)
  const allowed = new Set(profileFields(context).map((field) => field.id))
  const values = input.values as PhpArray
  if (Object.keys(values).some((fieldId) => !allowed.has(fieldId))) return validationError({ values: [FIELD_GONE] })
  const career: string = careerId
  return settle(original, deps, async () => {
    try {
      await deps.transaction((tx) => tx.keepContent(laravelBoolean(input.confirm_purge), career, [subjectId], () => saveValues(tx, session, subjectId, values, deps)))
    } catch (error) {
      if (error instanceof TemplateValidationError) return validationError(error.errors)
      throw error
    }
    return subjectProfileResponse(request, subjectId, deps)
  })
}
