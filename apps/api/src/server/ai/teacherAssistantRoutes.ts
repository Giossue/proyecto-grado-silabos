import { teacherAssistantRequestSchema, lockVersionSchema } from "@silabos/shared/schemas/syllabus"
import { isUuid } from "../academic/structure"
import type { AppSession, BridgeDeps } from "../auth/types"
import type { PrismaService } from "../../prisma/prisma.service"
import { uuid7 } from "../http/uuid7"
import { teacherAssistantEnabledOn } from "../operations/systemSettings"
import { aiConfig } from "./config"
import { dispatchTeacherAssistantAnswer } from "./teacherAnswerJobDefinition"
import { createTeacherAssistantStore } from "./teacherAssistantStore"
import { phpIntCast, toRuntime } from "../configuration/templateDraft"
import { phpString, phpTrim, type PhpRecord } from "../configuration/phpValues"
import { HttpFailure, Missing } from "../http/failures"
import { requestInput, type PhpArray } from "../http/input"
import { MODELS } from "../http/models"
import { apiJson, forbidden, jsonError, validationError } from "../http/responses"
import { modelNotFound } from "../http/router"
import { validateSchema } from "../http/schemaValidation"
import { sharedRateLimiter, throttle, type RateLimiter } from "../http/throttle"
import { institutionTimezone, institutionToday, systemNow } from "../shared/clock"
import { requireBound, type Binder } from "../syllabus/boundSession"
import { draftConflict, type DraftSyllabus } from "../syllabus/draftField"
import { editableState, mayEdit } from "../syllabus/policy"
import { assistantSwitchedOn, failTeacherAssistant, type TeacherAccessDeps } from "./teacherAnswerJob"
import { TEACHER_UNAVAILABLE } from "./teacherAssistant"
import { OPEN_ANSWER_STATES, type TeacherAssistantStore, type TeacherMessage, type TeacherProposal } from "./teacherAssistantStore"
import { placeProposal, readAssistantSnapshot, rowsAfter, type AssistantSnapshot } from "./teacherContext"
import { DAILY_REQUESTS, dailyRequestLimit } from "./teacherQuota"

export const STALE_ANSWER_SECONDS = 900
export const ASSISTANT_OFF = "El asistente no está disponible por ahora."
export const REQUEST_OPEN = "Espere a que el asistente termine la respuesta anterior."
export const LIMIT_REACHED = `Llegó al límite de ${DAILY_REQUESTS} pedidos de hoy al asistente. Podrá pedir otra vez mañana.`
export const PROPOSAL_NOT_PENDING = "Esta propuesta ya no está pendiente."

const CONVERSATION_MESSAGES = 100
const NOT_EDITABLE = "El expediente no está en estado editable."
const LIMIT_HEADERS = ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After", "X-RateLimit-Reset"]

export type TeacherAssistantRouteDeps = TeacherAccessDeps & {
  bridge: BridgeDeps
  store: TeacherAssistantStore
  today: () => string
  now: () => number
  limiter: () => RateLimiter
  newQuestionId: () => string
  newAnswerId: () => string
  dispatchAnswer: (messageId: string) => Promise<unknown>
}

export function defaultTeacherAssistantRouteDeps(prisma: PrismaService, bridge: BridgeDeps): TeacherAssistantRouteDeps {
  return {
    bridge,
    store: createTeacherAssistantStore(prisma),
    config: () => aiConfig(),
    enabled: () => teacherAssistantEnabledOn(prisma),
    today: institutionToday,
    now: systemNow,
    limiter: sharedRateLimiter,
    newQuestionId: uuid7,
    newAnswerId: uuid7,
    dispatchAnswer: dispatchTeacherAssistantAnswer,
  }
}

export type TeacherAssistantBound = { session: AppSession; syllabus: DraftSyllabus }

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

function reject(response: Response): never {
  throw new Rejected(response)
}

const refuse = (attribute: string, message: string): never => reject(validationError({ [attribute]: [message] }))

async function settled(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected || error instanceof HttpFailure) return error.response
    throw error
  }
}

export function teacherAssistantBinder(syllabusId: string, deps: Pick<TeacherAssistantRouteDeps, "store">): Binder<DraftSyllabus> {
  return async (user) => (isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null) ?? modelNotFound(MODELS.syllabus, syllabusId)
}

async function allowed(auth: TeacherAssistantBound, deps: TeacherAssistantRouteDeps): Promise<void> {
  if (!mayEdit(auth.session, auth.syllabus, deps.today())) reject(forbidden())
  if (!(await assistantSwitchedOn(deps))) refuse("assistant", ASSISTANT_OFF)
}

const requestLimit = (auth: TeacherAssistantBound, deps: TeacherAssistantRouteDeps) => dailyRequestLimit(auth.session.user.id, deps.now(), institutionTimezone())

const isOpen = (message: TeacherMessage) => message.role === "asistente" && OPEN_ANSWER_STATES.includes(message.state)
const isStale = (message: TeacherMessage, now: number) => now - message.createdAt > STALE_ANSWER_SECONDS
const isoDate = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`

function proposalView(proposal: TeacherProposal, snapshot: AssistantSnapshot | null): PhpRecord {
  const usable = proposal.state === "pendiente" || proposal.state === "aceptada"
  const outcome = usable && snapshot !== null ? placeProposal(snapshot, proposal) : null
  return {
    id: proposal.id,
    status: proposal.state,
    field_id: proposal.fieldId,
    field_key: proposal.target.fieldKey,
    field_label: proposal.target.fieldLabel,
    target: proposal.target.kind,
    space: outcome !== null && "value" in outcome ? outcome.target.space : proposal.target.space,
    text: proposal.text,
    basis: proposal.basis,
    usable: outcome !== null && "value" in outcome,
    blocked_reason: outcome !== null && "problem" in outcome ? outcome.problem : null,
  }
}

function messageView(message: TeacherMessage, proposals: TeacherProposal[], snapshot: AssistantSnapshot | null, now: number): PhpRecord {
  const abandoned = isOpen(message) && isStale(message, now)
  return {
    id: message.id,
    role: message.role,
    status: abandoned ? "fallido" : message.state,
    content: phpString(message.content.texto ?? ""),
    error: abandoned ? TEACHER_UNAVAILABLE : (message.content.error ?? null),
    created_at: isoDate(message.createdAt),
    proposals: proposals
      .filter((proposal) => proposal.messageId === message.id)
      .toSorted((left, right) => left.position - right.position)
      .map((proposal) => proposalView(proposal, snapshot)),
  }
}

export function showTeacherAssistantFor(auth: TeacherAssistantBound, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return settled(async () => {
    if (!mayEdit(auth.session, auth.syllabus, deps.today())) reject(forbidden())
    if (!(await assistantSwitchedOn(deps))) return apiJson({ available: false })
    const { messages, proposals } = await deps.store.conversation(auth.syllabus.id, auth.session.user.id, CONVERSATION_MESSAGES)
    const snapshot = proposals.length === 0 ? null : await readAssistantSnapshot(deps.store.reading, auth.syllabus)
    const now = deps.now()
    const used = await deps.limiter().attempts(requestLimit(auth, deps).key, now)
    return apiJson({
      available: true,
      limit: DAILY_REQUESTS,
      remaining: Math.max(0, DAILY_REQUESTS - used),
      busy: messages.some((message) => isOpen(message) && !isStale(message, now)),
      messages: messages.map((message) => messageView(message, proposals, snapshot, now)),
    })
  })
}

export function sendTeacherAssistantMessageFor(request: Request, auth: TeacherAssistantBound, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return settled(async () => {
    await allowed(auth, deps)
    const input = toRuntime(await requestInput(request)) as PhpArray
    const { errors } = await validateSchema(teacherAssistantRequestSchema(deps.config().chatMessageCharacters), input)
    if (errors !== null) return validationError(errors)
    const text = phpTrim(phpString(input.message))
    const key = phpString(input.idempotency_key).toLowerCase()
    const { id: syllabusId } = auth.syllabus
    const userId = auth.session.user.id
    const gate = throttle(deps.limiter(), requestLimit(auth, deps), deps.now)
    const registered = await deps.store.transaction(async (tx) => {
      await tx.lockConversation(syllabusId, userId)
      const repeated = await tx.answerByKey(syllabusId, userId, key)
      if (repeated !== null) return { answerId: repeated, created: false }
      const open = await tx.openAnswer(syllabusId, userId)
      if (open !== null) {
        if (!isStale(open, deps.now())) refuse("busy", REQUEST_OPEN)
        await tx.updateAnswer(open.id, { state: "fallido", content: { texto: "", error: TEACHER_UNAVAILABLE }, sentFields: [], errorCode: "asistente_fallido", completedAt: deps.now() })
      }
      const limited = await gate.hit()
      if (limited !== null) {
        const response = apiJson({ message: LIMIT_REACHED, errors: { limit: [LIMIT_REACHED] } }, 429)
        for (const header of LIMIT_HEADERS) response.headers.set(header, limited.headers.get(header) ?? "")
        reject(response)
      }
      const questionId = deps.newQuestionId()
      const answerId = deps.newAnswerId()
      await tx.insertMessage({ id: questionId, syllabusId, userId, role: "usuario", state: "completado", replyTo: null, content: { texto: text }, key })
      await tx.insertMessage({ id: answerId, syllabusId, userId, role: "asistente", state: "pendiente", replyTo: questionId, content: { texto: "" }, key: null })
      return { answerId, created: true }
    })
    if (registered.created) {
      try {
        await deps.dispatchAnswer(registered.answerId)
      } catch (error) {
        console.error(`Teacher assistant answer could not be queued: ${error instanceof Error ? error.name : "unknown error"}`)
        await failTeacherAssistant(registered.answerId, deps)
        return jsonError(503, TEACHER_UNAVAILABLE)
      }
    }
    return gate.decorate(apiJson({ message: "El pedido quedó registrado.", assistant_message_id: registered.answerId }, 202))
  })
}

const missingProposal = (id: string) => modelNotFound(MODELS.teacherProposal, id)

const ownedBy = (proposal: TeacherProposal | null, auth: TeacherAssistantBound): proposal is TeacherProposal =>
  proposal !== null && proposal.syllabusId === auth.syllabus.id && proposal.userId === auth.session.user.id

async function ownProposal(auth: TeacherAssistantBound, proposalId: string, deps: TeacherAssistantRouteDeps): Promise<TeacherProposal> {
  const proposal = isUuid(proposalId) ? await deps.store.proposal(proposalId) : null
  if (!ownedBy(proposal, auth)) reject(missingProposal(proposalId))
  return proposal as TeacherProposal
}

export function acceptTeacherProposalFor(request: Request, auth: TeacherAssistantBound, proposalId: string, deps: TeacherAssistantRouteDeps): Promise<Response> {
  const original = request.clone()
  return settled(async () => {
    await allowed(auth, deps)
    const proposal = await ownProposal(auth, proposalId, deps)
    const input = toRuntime(await requestInput(request)) as PhpArray
    const { errors } = await validateSchema(lockVersionSchema, input)
    if (errors !== null) return validationError(errors)
    return deps.store.transaction(async (tx) => {
      const locked = await tx.lockSyllabus(auth.syllabus.id)
      if (locked === null) throw new Missing(MODELS.syllabus, auth.syllabus.id)
      if (locked.version !== phpIntCast(input.version_bloqueo)) reject(draftConflict(original, locked.version))
      if (!editableState(locked.state, locked.started === true)) refuse("syllabus", NOT_EDITABLE)
      const current = await tx.lockProposal(proposal.id)
      if (!ownedBy(current, auth)) reject(missingProposal(proposalId))
      const found = current as TeacherProposal
      if (found.state !== "pendiente" && found.state !== "aceptada") refuse("proposal", PROPOSAL_NOT_PENDING)
      const snapshot = await readAssistantSnapshot(tx.reading, { id: locked.id, subjectId: locked.subjectId })
      if (snapshot === null) throw new Missing(MODELS.template)
      const outcome = placeProposal(snapshot, found)
      if ("problem" in outcome) return reject(validationError({ proposal: [outcome.problem] }))
      await tx.decideProposal(found.id, "aceptada", deps.now())
      for (const other of await tx.fieldProposals(auth.syllabus.id, auth.session.user.id, found.fieldId)) {
        const row = rowsAfter(other, outcome)
        if (row !== null) await tx.updateProposalTarget(other.id, { ...other.target, row })
      }
      return apiJson({
        message: "Propuesta colocada en el campo. Revísela: se guarda con el autoguardado.",
        field_id: found.fieldId,
        value: outcome.value,
        version_bloqueo: locked.version,
      })
    })
  })
}

export function discardTeacherProposalFor(auth: TeacherAssistantBound, proposalId: string, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return settled(async () => {
    await allowed(auth, deps)
    const proposal = await ownProposal(auth, proposalId, deps)
    await deps.store.transaction(async (tx) => {
      const current = await tx.lockProposal(proposal.id)
      if (!ownedBy(current, auth)) reject(missingProposal(proposalId))
      if ((current as TeacherProposal).state !== "pendiente") refuse("proposal", PROPOSAL_NOT_PENDING)
      await tx.decideProposal(proposal.id, "descartada", deps.now())
    })
    return apiJson({ message: "Propuesta descartada." })
  })
}

type Handler = (auth: TeacherAssistantBound) => Promise<Response>

async function bound(request: Request, syllabusId: string, deps: TeacherAssistantRouteDeps, handler: Handler): Promise<Response> {
  const result = await requireBound(request.clone(), teacherAssistantBinder(syllabusId, deps), deps.bridge)
  return result instanceof Response ? result : handler({ session: result.session, syllabus: result.bound })
}

export function showTeacherAssistant(request: Request, syllabusId: string, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return bound(request, syllabusId, deps, (auth) => showTeacherAssistantFor(auth, deps))
}

export function sendTeacherAssistantMessage(request: Request, syllabusId: string, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return bound(request, syllabusId, deps, (auth) => sendTeacherAssistantMessageFor(request, auth, deps))
}

export function acceptTeacherProposal(request: Request, syllabusId: string, proposalId: string, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return bound(request, syllabusId, deps, (auth) => acceptTeacherProposalFor(request, auth, proposalId, deps))
}

export function discardTeacherProposal(request: Request, syllabusId: string, proposalId: string, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return bound(request, syllabusId, deps, (auth) => discardTeacherProposalFor(auth, proposalId, deps))
}
