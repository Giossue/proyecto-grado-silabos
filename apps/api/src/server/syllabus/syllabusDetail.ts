import { archivedSections } from "../documents/syllabusSnapshot"
import { failModelNotFound, HttpFailure } from "../http/failures"
import type { ArchivedField } from "./syllabusDetailQueries"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { aborted, apiJson, validationError } from "../http/responses"
import { createLogoStore, presentationLogos, type LogoStore } from "../configuration/institutionalLogos"
import { isPhpArray, list, phpShape, phpString, record, type PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { presentDefinition, resolveVariables, syllabusSectionPayload, templatePresentationOf, type TemplateField } from "../configuration/templatePresentation"
import { CAREER, INSTITUTIONAL, responsesEnabled, responseTemplate, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import { institutionToday } from "../dashboard/dashboardQueries"
import type { DraftSyllabus } from "./draftField"
import { isoFromSeconds } from "./draftField"
import { dataGet, identificationOf, type IdentificationSource } from "./identificationCard"
import { isRunning, mayEdit, mayStart, mayView } from "./policy"
import { presentSnapshot, signedDocumentVariables, snapshotDefinition, type SignatureRecord, type SignedFacts } from "./snapshotDocuments"
import { convocationName } from "./syllabusSql"
import { createSyllabusDetailStore } from "./syllabusDetailQueries"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export type DetailSyllabus = DraftSyllabus & {
  convocationId: string
  subject: string
  code: string
  parallel: string
  career: string
  period: string
  startedAt: string | null
  savedAt: string | null
  version: number
  context: unknown
}

export type DetailRevision = {
  id: string
  number: number
  submittedAt: number
  submittedBy: string
  approval: { approver: string; at: number } | null
  verified: boolean
  versionOrigin: number
  correctionRequested: boolean
  fingerprint: string
}

export type ReviewComment = { stage: string; comment: string; commented_at: string; commented_by: string; revision_number: number }
export type CopySource = { id: string; parallel: string; state: string }

export interface SyllabusDetailStore {
  syllabus(id: string, userId: string): Promise<DetailSyllabus | null>
  teachers(id: string): Promise<string[]>
  values(id: string): Promise<Map<string, unknown>>
  hasArchivedValues(id: string): Promise<boolean>
  archivedFields(id: string): Promise<ArchivedField[] | null>
  revisions(id: string): Promise<DetailRevision[]>
  revisionSnapshot(revisionId: string): Promise<unknown>
  signedFacts(syllabusId: string, revision: DetailRevision): Promise<Pick<SignedFacts, "coordination" | "verification">>
  reviewComments(id: string, stage: string | null): Promise<ReviewComment[]>
  signatures(id: string): Promise<SignatureRecord[]>
  copySources(syllabus: DetailSyllabus, userId: string): Promise<CopySource[]>
  identification(id: string): Promise<IdentificationSource>
  fieldContents(ids: string[]): Promise<Map<string, unknown>>
}

export type SyllabusDetailDeps = { bridge: BridgeDeps; store: SyllabusDetailStore; templates: TemplateStore; logos: LogoStore; today: () => string }

export function defaultSyllabusDetailDeps(): SyllabusDetailDeps {
  return { bridge: defaultBridgeDeps(), store: createSyllabusDetailStore(), templates: createTemplateStore(), logos: createLogoStore(), today: institutionToday }
}

const REVIEWED_STATES = ["en_revision", "aprobado"]
const TEACHER_RESPONSIBLES = ["docente", "carrera"]
const COPYABLE_STATES = ["sin_iniciar", "borrador"]

export function reviewStageOf(revision: Pick<DetailRevision, "approval" | "verified">): string | null {
  if (revision.approval !== null) return null
  return revision.verified ? "coordinacion" : "biblioteca"
}

export function latestRevision(revisions: DetailRevision[]): DetailRevision | null {
  return revisions.reduce<DetailRevision | null>((latest, item) => (latest === null || item.number > latest.number ? item : latest), null)
}

export function signatureSummary(signatures: SignatureRecord[]) {
  return signatures.map((signature) => ({ role: signature.role, name: signature.name, signed_at: isoFromSeconds(signature.signedAt) }))
}

function formationRequired(definition: TemplateDefinition): boolean {
  return Object.values(definition.variables).some((variable) => variable.source === "identification.formation")
}

function editability(session: AppSession, syllabus: DetailSyllabus, today: string) {
  const allowed = syllabus.state === "sin_iniciar" ? mayStart(session, syllabus, today) : mayEdit(session, syllabus, today)
  if (allowed) return { allowed, fields: { editable: true, edit_block_reason: null, edit_blocked_by_convocation: false } }
  const editableState = ["sin_iniciar", "borrador", "correccion_solicitada"].includes(syllabus.state)
  const closed = syllabus.convocationState === "cerrada"
  const running = isRunning(syllabus)
  const late = today > syllabus.dueOn
  const reason = !editableState
    ? "El sílabo no admite cambios en su estado actual."
    : closed
      ? "La convocatoria está cerrada: el sílabo queda solo para consulta."
      : !running
        ? "La convocatoria está en pausa. Podrá seguir editando cuando se reanude."
        : late
          ? "El plazo de entrega venció. Pida una prórroga a Administración."
          : "No tiene una asignación vigente para editar este sílabo."
  return { allowed, fields: { editable: false, edit_block_reason: reason, edit_blocked_by_convocation: editableState && (closed || !running || late) } }
}

async function readOnlyForm(sections: unknown, definition: TemplateDefinition, contents: (ids: string[]) => Promise<Map<string, unknown>>): Promise<unknown[]> {
  const fields = list(sections).flatMap((section) => list(record(section).fields))
  const ids = fields.map((field) => record(field).definition_id).filter((id): id is string => typeof id === "string" && id !== "")
  const found = await contents(ids)
  return list(sections).map((raw) => {
    const section = record(raw)
    const withId = section.id === undefined || section.id === null ? { ...section, id: section.key ?? null } : section
    return {
      ...withId,
      fields: list(section.fields).map((rawField) => {
        const field = record(rawField)
        const required = field.quien_llena !== INSTITUTIONAL
        const next: PhpRecord = { ...field, teacher_editable: TEACHER_RESPONSIBLES.includes(phpString(field.quien_llena)), required }
        const content = found.get(phpString(field.definition_id ?? ""))
        if (content !== undefined && required && responsesEnabled(definition)) next.template = responseTemplate(record(content))
        return next
      }),
    }
  })
}

export async function syllabusPayload(
  request: Request,
  session: AppSession,
  syllabus: DetailSyllabus,
  deps: SyllabusDetailDeps,
): Promise<PhpRecord> {
  const template = await deps.templates.template()
  if (template === null) failModelNotFound(MODELS.template)
  const current = template.definition
  const revisions = (await deps.store.revisions(syllabus.id)).sort((left, right) => left.number - right.number)
  const latest = latestRevision(revisions)
  const identification = identificationOf(await deps.store.identification(syllabus.id))
  const signatures = await deps.store.signatures(syllabus.id)
  let snapshot: PhpRecord | null = null
  if (latest !== null && REVIEWED_STATES.includes(syllabus.state)) {
    snapshot = record(await deps.store.revisionSnapshot(latest.id))
    const facts = await deps.store.signedFacts(syllabus.id, latest)
    snapshot = { ...snapshot, template_variables: signedDocumentVariables(snapshot, { ...facts, submittedAt: latest.submittedAt, approval: latest.approval, signatures }) }
  }
  const context = record(syllabus.context)
  if (snapshot === null && syllabus.convocationState === "cerrada" && isPhpArray(context.closed_document)) snapshot = record(context.closed_document)
  const unsentForm = snapshot !== null && !REVIEWED_STATES.includes(syllabus.state)
  let frozen = snapshot === null ? null : presentSnapshot(snapshot)
  if (unsentForm && frozen !== null) frozen = { ...frozen, sections: await readOnlyForm(frozen.sections, current, (ids) => deps.store.fieldContents(ids)) }
  const archived = frozen === null ? await deps.store.archivedFields(syllabus.id) : null
  const archivedView =
    archived === null
      ? null
      : presentSnapshot({ sections: archivedSections(archived, current), identification, template_definition: current })
  if (archivedView !== null) {
    archivedView.sections = list(archivedView.sections).map((section) => ({
      ...record(section),
      fields: list(record(section).fields).map((field) => ({
        ...record(field),
        teacher_editable: ["docente", CAREER].includes(String(record(field).quien_llena)),
        required: record(field).quien_llena !== "institucional",
      })),
    }))
  }
  const definition = snapshot !== null ? snapshotDefinition(snapshot) : current
  const setups = frozen === null && archivedView === null ? await profileTemplates({ template, definition: current, store: deps.templates }, syllabus.subjectId) : {}
  const variables = frozen !== null && frozen.template_variables !== undefined && frozen.template_variables !== null ? frozen.template_variables : resolveVariables(current, { identification })
  const editable = editability(session, syllabus, deps.today())
  const values = frozen === null ? await deps.store.values(syllabus.id) : new Map<string, unknown>()
  const stored = (field: TemplateField) => (values.has(field.id) ? values.get(field.id) : (setups[field.id] ?? field.content))
  const approved = syllabus.state === "aprobado" ? revisions.filter((item) => item.approval !== null).reduce<DetailRevision | null>((best, item) => (best === null || item.number > best.number ? item : best), null) : null
  return {
    id: syllabus.id,
    subject: syllabus.subject,
    code: syllabus.code,
    convocation: convocationName(syllabus.career, syllabus.period),
    period: syllabus.period,
    state: syllabus.state,
    iniciado_en: syllabus.startedAt,
    version_bloqueo: syllabus.version,
    guardado_en: syllabus.savedAt,
    ...editable.fields,
    parallels: [syllabus.parallel],
    copy_sources: editable.allowed && COPYABLE_STATES.includes(syllabus.state) ? await deps.store.copySources(syllabus, session.user.id) : [],
    teachers: [...new Set(await deps.store.teachers(syllabus.id))],
    approved_revision_id: approved?.id ?? null,
    presentation: templatePresentationOf(definition, await presentationLogos(request, dataGet(syllabus.context, "career.faculty_id"), deps.logos)),
    template_variables: variables,
    definition: presentDefinition(definition),
    sections:
      frozen !== null && frozen.sections !== undefined && frozen.sections !== null
        ? frozen.sections
        : archivedView !== null && archivedView.sections !== undefined && archivedView.sections !== null
          ? archivedView.sections
          : template.sections.map((section) => syllabusSectionPayload(section, stored, { identification }, current, setups)),
    revisions: revisions.map((item) => ({
      id: item.id,
      number: item.number,
      submitted_at: isoFromSeconds(item.submittedAt),
      submitted_by: item.submittedBy,
      approved_at: item.approval === null ? null : isoFromSeconds(item.approval.at),
    })),
    review_stage: syllabus.state === "en_revision" && latest !== null ? reviewStageOf(latest) : null,
    review_comments: await deps.store.reviewComments(syllabus.id, null),
    signatures: signatureSummary(signatures),
    teacher_signature_required: !signatures.some((signature) => signature.role === "docente"),
    teacher_formation_required: formationRequired(current),
    unchanged_since_correction: syllabus.state === "correccion_solicitada" && latest !== null && latest.correctionRequested && syllabus.version === latest.versionOrigin + 2,
  }
}

export async function teacherSyllabusDetail(request: Request, syllabusId: string, deps: SyllabusDetailDeps = defaultSyllabusDetailDeps()): Promise<Response> {
  let syllabus: DetailSyllabus | null = null
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
  if (!mayView(session, syllabus)) return aborted(403)
  try {
    return apiJson(phpShape({ syllabus: await syllabusPayload(request, session, syllabus, deps) }))
  } catch (error) {
    if (error instanceof HttpFailure) return error.response
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}
