import { HttpFailure, Missing, reportedServerError } from "../http/failures"
import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray } from "../http/input"
import { expectsJson } from "../http/request"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { lockVersionSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { createLogoStore, type LogoStore } from "../shared/logoStore"
import { phpShape, type PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { phpIntCast, toRuntime } from "../configuration/templateDraft"
import { type SyllabusTemplate, teacherEditable, type TemplateField } from "../configuration/templatePresentation"
import { fieldResponseNormalize } from "../configuration/templateRehearsal"
import { fieldCarried, INSTITUTIONAL, responseWithin, TemplateValidationError } from "../configuration/templateRuntime"
import type { TemplateStore } from "../shared/templateStore"
import { institutionToday } from "../shared/clock"
import { mayEdit, mayStart, mayView } from "./policy"
import { syllabusPayload, type DetailSyllabus, type SyllabusDetailStore } from "./syllabusDetail"
import { createDraftStartStore } from "./draftStartStore"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "./boundSession"
import { fieldFingerprint } from "./teacherFields"

export type LockedDraft = { id: string; state: string; version: number; subjectId: string; started?: boolean }
export type TeacherField = { id: string; responsible: string; content: unknown }

export interface DraftStartTx {
  detail: SyllabusDetailStore
  templateStore: TemplateStore
  lockSyllabus(id: string): Promise<LockedDraft | null>
  previousPeriodSource(syllabusId: string, subjectId: string, userId: string, templateModifiedAt: string | null): Promise<string | null>
  teacherFields(templateId: string): Promise<TeacherField[]>
  values(syllabusId: string, fieldIds: string[]): Promise<{ fieldId: string; value: unknown }[]>
  deleteValues(syllabusId: string, fieldIds: string[]): Promise<void>
  insertValue(syllabusId: string, fieldId: string, document: PhpRecord, fingerprint: string): Promise<void>
  carryTeacherFields(syllabusId: string, template: SyllabusTemplate): Promise<void>
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

export function defaultDraftStartDeps(prisma: PrismaService): DraftStartDeps {
  const store = createDraftStartStore(prisma)
  return {
    bridge: defaultBridgeDeps(),
    store: store.detail,
    logos: createLogoStore(prisma),
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

export type DraftStartBound = { session: AppSession; syllabus: DetailSyllabus; source: DetailSyllabus | null }

export function draftStartBinder(syllabusId: string, sourceId: string | null, deps: Pick<DraftStartDeps, "store">): Binder<{ syllabus: DetailSyllabus; source: DetailSyllabus | null }> {
  return async (user) => {
    const syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
    if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
    const source = sourceId === null || !isUuid(sourceId) ? null : await deps.store.syllabus(sourceId, user.id)
    return sourceId !== null && source === null ? modelNotFound(MODELS.syllabus, sourceId) : { syllabus, source }
  }
}

async function bound(request: Request, syllabusId: string, sourceId: string | null, deps: DraftStartDeps): Promise<DraftStartBound | Response> {
  const auth = await requireBound(request, draftStartBinder(syllabusId, sourceId, deps), deps.bridge)
  if (auth instanceof Response) return auth
  return { session: auth.session, ...auth.bound }
}

async function payloadWithin(tx: DraftStartTx, request: Request, session: AppSession, syllabusId: string, deps: DraftStartDeps): Promise<PhpRecord> {
  const current = await tx.detail.syllabus(syllabusId, session.user.id)
  if (current === null) throw new Missing(MODELS.syllabus, syllabusId)
  return syllabusPayload(request, session, current, { bridge: deps.bridge, store: tx.detail, templates: tx.templateStore, logos: deps.logos, today: deps.today })
}

async function run(original: Request, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected) return error.response
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    if (error instanceof HttpFailure) return error.response
    return reportedServerError(error)
  }
}

async function inheritPreviousPeriod(tx: DraftStartTx, template: SyllabusTemplate, syllabusId: string, subjectId: string, sourceId: string): Promise<void> {
  const definition = template.definition
  const setups = await profileTemplates({ template, definition, store: tx.templateStore }, subjectId)
  const fields = (await tx.teacherFields(template.id)).filter((field) => teacherEditable({ id: field.id, responsible: field.responsible } as TemplateField, setups))
  const contents = new Map(fields.map((field) => [field.id, field.content]))
  const previous = await tx.values(sourceId, fields.map((field) => field.id))
  await tx.deleteValues(syllabusId, previous.map((value) => value.fieldId))
  for (const value of previous) {
    const setup = setups[value.fieldId]
    const document =
      setup === undefined && !responseWithin(value.value)
        ? fieldResponseNormalize(contents.get(value.fieldId), value.value, definition)
        : fieldCarried(setup ?? contents.get(value.fieldId), value.value, definition, contents.get(value.fieldId))
    await tx.insertValue(syllabusId, value.fieldId, document as PhpRecord, fieldFingerprint(contents.get(value.fieldId)))
  }
}

export async function startDraft(request: Request, syllabusId: string, deps: DraftStartDeps): Promise<Response> {
  const auth = await bound(request, syllabusId, null, deps)
  if (auth instanceof Response) return auth
  return startDraftFor(request, auth, deps)
}

export async function startDraftFor(request: Request, { session, syllabus }: DraftStartBound, deps: DraftStartDeps): Promise<Response> {
  const original = request.clone()
  if (!mayStart(session, syllabus, deps.today())) return aborted(403)
  return run(original, async () => {
      const payload = await deps.transaction(async (tx) => {
        const locked = await tx.lockSyllabus(syllabus.id)
        if (locked === null) throw new Missing(MODELS.syllabus, syllabus.id)
        if (locked.state !== "sin_iniciar") throw new Rejected(validationError({ syllabus: ["El borrador ya fue iniciado o no está editable."] }))
        if (locked.started === true) return payloadWithin(tx, request, session, locked.id, deps)
        const template = await tx.templateStore.template()
        if (template === null) throw new Missing(MODELS.template)
        const sourceId = await tx.previousPeriodSource(locked.id, locked.subjectId, session.user.id, template.modifiedAt)
        if (sourceId !== null) await inheritPreviousPeriod(tx, template, locked.id, locked.subjectId, sourceId)
        await tx.carryTeacherFields(locked.id, template)
        const now = deps.now()
        await tx.start(locked.id, now)
        return payloadWithin(tx, request, session, locked.id, deps)
      })
      return apiJson(phpShape({ message: "Sílabo preparado con la plantilla y los datos maestros fijados.", syllabus: payload }))
    })
}

function conflict(request: Request, version: number): Response {
  return expectsJson(request)
    ? apiJson({ message: CONFLICT, code: "conflicto_version_borrador", version_bloqueo_actual: version }, 409)
    : apiJson({ message: CONFLICT }, 409)
}

export async function copySyllabusContent(request: Request, syllabusId: string, sourceId: string, deps: DraftStartDeps): Promise<Response> {
  const auth = await bound(request, syllabusId, sourceId, deps)
  if (auth instanceof Response) return auth
  return copySyllabusContentFor(request, auth, deps)
}

export async function copySyllabusContentFor(request: Request, auth: DraftStartBound, deps: DraftStartDeps): Promise<Response> {
  const original = request.clone()
  const { session, syllabus } = auth
  const source = auth.source as DetailSyllabus
  const today = deps.today()
  const allowed = syllabus.state === "sin_iniciar" ? mayStart(session, syllabus, today) : mayEdit(session, syllabus, today)
  if (!allowed || !mayView(session, source)) return forbidden()
  const input = toRuntime(await requestInput(request)) as PhpArray
  const { errors } = await validateSchema(lockVersionSchema, input)
  if (errors !== null) return validationError(errors)
  const lockVersion = phpIntCast(input.version_bloqueo)
  return run(original, async () => {
      const payload = await deps.transaction(async (tx) => {
        const locked = await tx.lockSyllabus(syllabus.id)
        if (locked === null) throw new Missing(MODELS.syllabus, syllabus.id)
        const current = await tx.detail.syllabus(locked.id, session.user.id)
        if (current === null) throw new Missing(MODELS.syllabus, locked.id)
        const sources = COPYABLE_STATES.includes(locked.state) ? await tx.detail.copySources(current, session.user.id) : []
        if (!sources.some((candidate) => candidate.id === source.id)) {
          throw new Rejected(validationError({ syllabus: ["Solo puede copiar desde otro paralelo suyo de la misma asignatura, y solo hacia un sílabo que aún no ha enviado."] }))
        }
        if (locked.version !== lockVersion) throw new Rejected(conflict(original, locked.version))
        const template = await tx.templateStore.template()
        if (template === null) throw new Missing(MODELS.template)
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
          await tx.insertValue(locked.id, value.fieldId, fieldResponseNormalize(setups[value.fieldId] ?? contents.get(value.fieldId), value.value, definition, "value", contents.get(value.fieldId)), fieldFingerprint(contents.get(value.fieldId)))
        }
        const version = locked.version + 1
        const now = deps.now()
        await tx.copied(locked.id, version, now)
        return payloadWithin(tx, request, session, locked.id, deps)
      })
      return apiJson(phpShape({ message: `Contenido copiado desde el paralelo ${source.parallel}.`, syllabus: payload }))
    })
}
