import { teacherAssistantRequestSchema } from "@silabos/shared/schemas/syllabus"
import { isUuid } from "../academic/structure"
import type { AppSession, BridgeDeps } from "../auth/types"
import type { PrismaService } from "../../prisma/prisma.service"
import { uuid7 } from "../http/uuid7"
import { teacherAssistantEnabledOn } from "../operations/systemSettings"
import { aiConfig } from "./config"
import { dispatchTeacherAssistantAnswer } from "./teacherAnswerJobDefinition"
import { createTeacherAssistantStore } from "./teacherAssistantStore"
import { toRuntime } from "../configuration/templateDraft"
import { phpString, phpTrim, type PhpRecord } from "../configuration/phpValues"
import { HttpFailure } from "../http/failures"
import { requestInput, type PhpArray } from "../http/input"
import { MODELS } from "../http/models"
import { apiJson, forbidden, jsonError, validationError } from "../http/responses"
import { modelNotFound } from "../http/router"
import { validateSchema } from "../http/schemaValidation"
import { sharedRateLimiter, throttle, type RateLimiter } from "../http/throttle"
import { institutionTimezone, institutionToday, systemNow } from "../shared/clock"
import { requireBound, type Binder } from "../syllabus/boundSession"
import type { DraftSyllabus } from "../syllabus/draftField"
import { mayEdit } from "../syllabus/policy"
import { assistantSwitchedOn, failTeacherAssistant, type TeacherAccessDeps } from "./teacherAnswerJob"
import { TEACHER_UNAVAILABLE } from "./teacherAssistant"
import { OPEN_ANSWER_STATES, type TeacherAssistantStore, type TeacherMessage, type TeacherProposal } from "./teacherAssistantStore"
import { DAILY_REQUESTS, dailyRequestLimit } from "./teacherQuota"

export const STALE_ANSWER_SECONDS = 900
export const ASSISTANT_OFF = "El asistente no está disponible por ahora."
export const REQUEST_OPEN = "Espere a que el asistente termine la respuesta anterior."
export const LIMIT_REACHED = `Llegó al límite de ${DAILY_REQUESTS} pedidos de hoy al asistente. Podrá pedir otra vez mañana.`

const CONVERSATION_MESSAGES = 100
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

const proposalView = (proposal: TeacherProposal): PhpRecord => ({
  id: proposal.id,
  status: proposal.state,
  field_id: proposal.fieldId,
  field_key: proposal.target.fieldKey,
  field_label: proposal.target.fieldLabel,
  target: proposal.target.kind,
  space: proposal.target.space,
  text: proposal.text,
  basis: proposal.basis,
})

function messageView(message: TeacherMessage, proposals: TeacherProposal[], now: number): PhpRecord {
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
      .map(proposalView),
  }
}

export function showTeacherAssistantFor(auth: TeacherAssistantBound, deps: TeacherAssistantRouteDeps): Promise<Response> {
  return settled(async () => {
    if (!mayEdit(auth.session, auth.syllabus, deps.today())) reject(forbidden())
    if (!(await assistantSwitchedOn(deps))) return apiJson({ available: false })
    const { messages, proposals } = await deps.store.conversation(auth.syllabus.id, auth.session.user.id, CONVERSATION_MESSAGES)
    const now = deps.now()
    const used = await deps.limiter().attempts(requestLimit(auth, deps).key, now)
    return apiJson({
      available: true,
      limit: DAILY_REQUESTS,
      remaining: Math.max(0, DAILY_REQUESTS - used),
      busy: messages.some((message) => isOpen(message) && !isStale(message, now)),
      messages: messages.map((message) => messageView(message, proposals, now)),
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
