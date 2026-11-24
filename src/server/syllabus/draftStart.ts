import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput, type PhpArray } from "../laravel/input"
import { expectsJson } from "../laravel/request"
import { aborted, forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { createLogoStore, type LogoStore } from "../configuration/institutionalLogos"
import { phpShape, type PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { phpIntCast, toRuntime } from "../configuration/templateDraft"
import { teacherEditable, type TemplateField } from "../configuration/templatePresentation"
import { fieldResponseNormalize } from "../configuration/templateRehearsal"
import { INSTITUTIONAL, TemplateValidationError } from "../configuration/templateRuntime"
import type { TemplateStore } from "../configuration/templateStore"
import { institutionToday } from "../dashboard/dashboardQueries"
import { mayEdit, mayStart, mayView } from "./policy"
import { NeedsLaravel } from "./snapshotDocuments"
import { syllabusPayload, type DetailSyllabus, type SyllabusDetailStore } from "./syllabusDetail"
import { createDraftStartStore } from "./draftStartStore"
import { modelNotFound } from "../laravel/router"
import { MODELS } from "../laravel/models"

export type LockedDraft = { id: string; state: string; version: number; subjectId: string }
export type TeacherField = { id: string; responsible: string; content: unknown }

export interface DraftStartTx {
  detail: SyllabusDetailStore
  templateStore: TemplateStore
  lockSyllabus(id: string): Promise<LockedDraft | null>
  previousPeriodSource(syllabusId: string, subjectId: string, userId: string, templateModifiedAt: string | null): Promise<string | null>
  teacherFields(templateId: string): Promise<TeacherField[]>
  values(syllabusId: string, fieldIds: string[]): Promise<{ fieldId: string; value: unknown }[]>
  deleteValues(syllabusId: string, fieldIds: string[]): Promise<void>
  insertValue(syllabusId: string, fieldId: string, document: PhpRecord): Promise<void>
  start(syllabusId: string, now: number): Promise<void>
  copied(syllabusId: string, version: number, now: number): Promise<void>
}

export type DraftStartDeps = {
  bridge: BridgeDeps
  store: SyllabusDetailStore
  logos: LogoStore
  today: () => string
  now: () => number
  transaction<T>(work: (tx: DraftStartTx) => Promise<T>): Promise<T>
}

export function defaultDraftStartDeps(): DraftStartDeps {
  const store = createDraftStartStore()
  return {
    bridge: defaultBridgeDeps(),
    store: store.detail,
    logos: createLogoStore(),
    today: institutionToday,
    now: () => Math.floor(Date.now() / 1000),
    transaction: store.transaction,
  }
}

const CONFLICT = "El borrador cambió en otra sesión. Recarga antes de continuar."
const COPYABLE_STATES = ["sin_iniciar", "borrador"]

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

class Missing extends Error {}

type Bound = { session: LaravelSession; syllabus: DetailSyllabus; source: DetailSyllabus | null }

async function bound(request: Request, syllabusId: string, sourceId: string | null, deps: DraftStartDeps): Promise<Bound | Response> {
  let syllabus: DetailSyllabus | null = null
  let source: DetailSyllabus | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
        if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
        source = sourceId === null || !isUuid(sourceId) ? null : await deps.store.syllabus(sourceId, user.id)
        return sourceId !== null && source === null ? modelNotFound(MODELS.syllabus, sourceId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
  if (sourceId !== null && source === null) return modelNotFound(MODELS.syllabus, sourceId)
  return { session, syllabus, source }
}

async function payloadWithin(tx: DraftStartTx, request: Request, session: LaravelSession, syllabusId: string, deps: DraftStartDeps): Promise<PhpRecord> {
  const current = await tx.detail.syllabus(syllabusId, session.user.id)
  if (current === null) throw new Missing()
  return syllabusPayload(request, session, current, { bridge: deps.bridge, store: tx.detail, templates: tx.templateStore, logos: deps.logos, today: deps.today })
}

async function run(original: Request, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected) return error.response
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    if (error instanceof NeedsLaravel || error instanceof Missing) throw new Forward(original)
    throw error
  }
}

class Forward extends Error {
  constructor(readonly request: Request) {
    super("forward")
  }
}

async function forwarding(deps: DraftStartDeps, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Forward) return deps.bridge.forward(error.request)
    throw error
  }
}

export async function startDraft(request: Request, syllabusId: string, deps: DraftStartDeps = defaultDraftStartDeps()): Promise<Response> {
  const original = request.clone()
  const auth = await bound(request, syllabusId, null, deps)
  if (auth instanceof Response) return auth
  const { session, syllabus } = auth
  if (!mayStart(session, syllabus, deps.today())) return aborted(403)
  return forwarding(deps, () =>
    run(original, async () => {
      const payload = await deps.transaction(async (tx) => {
        const locked = await tx.lockSyllabus(syllabus.id)
        if (locked === null) throw new Missing()
        if (locked.state !== "sin_iniciar") throw new Rejected(validationError({ syllabus: ["El borrador ya fue iniciado o no está editable."] }))
        const template = await tx.templateStore.template()
        if (template === null) throw new NeedsLaravel()
        if ((await tx.previousPeriodSource(locked.id, locked.subjectId, session.user.id, template.modifiedAt)) !== null) throw new NeedsLaravel()
        const now = deps.now()
        await tx.start(locked.id, now)
        return payloadWithin(tx, request, session, locked.id, deps)
      })
      return laravelJson(phpShape({ message: "Borrador iniciado con la plantilla y los datos maestros fijados.", syllabus: payload }))
    }),
  )
}

function conflict(request: Request, version: number): Response {
  return expectsJson(request)
    ? laravelJson({ message: CONFLICT, code: "conflicto_version_borrador", version_bloqueo_actual: version }, 409)
    : laravelJson({ message: CONFLICT }, 409)
}

export async function copySyllabusContent(request: Request, syllabusId: string, sourceId: string, deps: DraftStartDeps = defaultDraftStartDeps()): Promise<Response> {
  const original = request.clone()
  const auth = await bound(request, syllabusId, sourceId, deps)
  if (auth instanceof Response) return auth
  const { session, syllabus } = auth
  const source = auth.source as DetailSyllabus
  const today = deps.today()
  const allowed = syllabus.state === "sin_iniciar" ? mayStart(session, syllabus, today) : mayEdit(session, syllabus, today)
  if (!allowed || !mayView(session, source)) return forbidden()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const input = toRuntime(await laravelInput(request)) as PhpArray
  const errors = await validateInput(input, { version_bloqueo: ["required", "integer", { min: 0 }] }, { version_bloqueo: "versión de edición" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const lockVersion = phpIntCast(input.version_bloqueo)
  return forwarding(deps, () =>
    run(original, async () => {
      const payload = await deps.transaction(async (tx) => {
        const locked = await tx.lockSyllabus(syllabus.id)
        if (locked === null) throw new Missing()
        const current = await tx.detail.syllabus(locked.id, session.user.id)
        if (current === null) throw new Missing()
        const sources = COPYABLE_STATES.includes(locked.state) ? await tx.detail.copySources(current, session.user.id) : []
        if (!sources.some((candidate) => candidate.id === source.id)) {
          throw new Rejected(validationError({ syllabus: ["Solo puede copiar desde otro paralelo suyo de la misma asignatura, y solo hacia un sílabo que aún no ha enviado."] }))
        }
        if (locked.version !== lockVersion) throw new Rejected(conflict(original, locked.version))
        const template = await tx.templateStore.template()
        if (template === null || template.definition === null) throw new NeedsLaravel()
        const definition = template.definition
        const setups = await profileTemplates({ template, definition, store: tx.templateStore }, locked.subjectId)
        const fields = (await tx.teacherFields(template.id)).filter(
          (field) => field.responsible !== INSTITUTIONAL && teacherEditable({ id: field.id, responsible: field.responsible } as TemplateField, setups),
        )
        const contents = new Map(fields.map((field) => [field.id, field.content]))
        const fieldIds = fields.map((field) => field.id)
        const copied = await tx.values(source.id, fieldIds)
        await tx.deleteValues(locked.id, fieldIds)
        for (const value of copied) {
          await tx.insertValue(locked.id, value.fieldId, fieldResponseNormalize(setups[value.fieldId] ?? contents.get(value.fieldId), value.value, definition))
        }
        const version = locked.version + 1
        const now = deps.now()
        await tx.copied(locked.id, version, now)
        return payloadWithin(tx, request, session, locked.id, deps)
      })
      return laravelJson(phpShape({ message: `Contenido copiado desde el paralelo ${source.parallel}.`, syllabus: payload }))
    }),
  )
}
