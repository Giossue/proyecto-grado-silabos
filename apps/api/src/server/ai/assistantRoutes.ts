import { fromController } from "../auth/controllerResponse"
import { MODELS } from "../http/models"
import { modelNotFoundResponse } from "../http/failures"
import { randomUUID } from "node:crypto"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { FORBIDDEN, managesTemplates } from "../configuration/templateReads"
import { phpString, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { toRuntime } from "../configuration/templateDraft"
import { requestInput, type PhpArray } from "../http/input"
import { aborted, jsonError, apiJson, validationError } from "../http/responses"
import { uuid7 } from "../http/uuid7"
import { OPEN_STATES, type AssistantStore, type AssistantTx, type StoredMessage, type StoredProposal } from "./assistantStore"
import { assistantAvailable, type AiConfig } from "./config"
import { sendMessageErrors, validatedDraft } from "./sendMessageRequest"

export const SUGGESTIONS = [
  "Agrega un campo «Competencias» en resultados de aprendizaje, que lo llene el docente.",
  "Mueve la bibliografía antes de la metodología.",
  "¿Qué campos llena Coordinación?",
]

export const PENDING = "pendiente"
export const APPLIED = "aplicada"
export const DISCARDED = "descartada"
export const REPLACED = "reemplazada"

const BUSY = "Espere a que el asistente termine la respuesta anterior."
const UNAVAILABLE = "El asistente no está disponible por ahora."
const NOT_PENDING = "Esta propuesta ya no está pendiente."
const PROPOSAL_MODEL = "App\\Modules\\AiAssistance\\Infrastructure\\Persistence\\Models\\TemplateAssistantProposal"
const MESSAGE_MODEL = "App\\Modules\\AiAssistance\\Infrastructure\\Persistence\\Models\\TemplateAssistantMessage"

export type AssistantRouteDeps = {
  bridge: BridgeDeps
  store: AssistantStore
  config: () => AiConfig
  newQuestionId: () => string
  newAnswerId: () => string
  dispatchAnswer: (messageId: string) => Promise<unknown>
}

export function defaultAssistantIds(): Pick<AssistantRouteDeps, "newQuestionId" | "newAnswerId"> {
  return { newQuestionId: uuid7, newAnswerId: randomUUID }
}

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

function reject(response: Response): never {
  throw new Rejected(response)
}

async function settled(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected) return error.response
    throw error
  }
}

function admin(request: Request, deps: AssistantRouteDeps): Promise<AppSession | Response> {
  return requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
}

function part(message: StoredMessage, key: string): unknown {
  const value = message.content[key]
  return value === undefined ? null : value
}

export function messageRole(message: StoredMessage): string {
  return phpString(message.content.rol ?? "")
}

export function messageState(message: StoredMessage): string {
  return phpString(message.content.estado ?? "")
}

export function messageText(message: StoredMessage): string {
  const value = messageRole(message) === "usuario" ? record(message.content.entrada).contenido : message.content.contenido
  return typeof value === "string" ? value : ""
}

export function isOpen(message: StoredMessage): boolean {
  return OPEN_STATES.includes(messageState(message))
}

function changesList(proposal: StoredProposal): unknown {
  return proposal.changes.lista ?? null
}

export async function showAssistant(request: Request, deps: AssistantRouteDeps): Promise<Response> {
  const session = await admin(request, deps)
  if (session instanceof Response) return session
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  return showAssistantOf(session, deps)
}

export async function showAssistantOf(session: AppSession, deps: AssistantRouteDeps): Promise<Response> {
  const locked = await deps.store.openProcess()
  const template = await deps.store.template()
  if (template === null) return fromController(modelNotFoundResponse(MODELS.template))
  const messages = await deps.store.conversation(template.id, session.user.id)
  return apiJson({
    available: assistantAvailable(deps.config()),
    locked,
    suggestions: SUGGESTIONS,
    messages: messages.map((message) => ({
      id: message.id,
      role: messageRole(message),
      status: messageState(message),
      result: part(message, "resultado"),
      content: messageText(message),
      error: part(message, "mensaje_error"),
      created_at: message.sentAt,
      proposal:
        message.proposal === null
          ? null
          : { id: message.proposal.id, status: message.proposal.state, changes: changesList(message.proposal), draft_version: message.proposal.draftVersion },
    })),
  })
}

export async function storeAssistantMessage(request: Request, deps: AssistantRouteDeps): Promise<Response> {
  const original = request.clone()
  const raw = await requestInput(request)
  const session = await admin(original.clone(), deps)
  if (session instanceof Response) return session
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  return storeAssistantMessageOf(raw, session, deps)
}

export async function storeAssistantMessageOf(raw: PhpArray, session: AppSession, deps: AssistantRouteDeps): Promise<Response> {
  const input = toRuntime(raw) as PhpRecord
  const template = await deps.store.template()
  if (template === null) return fromController(modelNotFoundResponse(MODELS.template))
  const config = deps.config()
  const errors = await sendMessageErrors(input, template.definition, config.chatMessageCharacters)
  if (Object.keys(errors).length > 0) return validationError(errors)
  const draft = validatedDraft(input, template.definition)
  if (!assistantAvailable(config)) return validationError({ message: [UNAVAILABLE] })
  const content = phpString(input.message)
  const key = phpString(input.idempotency_key)
  const draftVersion = phpString(input.draft_version)
  return settled(async () => {
    const dispatched: string[] = []
    const answerId = await deps.store.transaction(async (tx: AssistantTx) => {
      const templateId = await tx.lockTemplateId()
      if (templateId === null) reject(fromController(modelNotFoundResponse(MODELS.template)))
      const existing = await tx.questionByKey(templateId as string, session.user.id, key)
      if (existing !== null) {
        const answer = await tx.answerTo(existing)
        if (answer === null) reject(jsonError(404, `No query results for model [${MESSAGE_MODEL}].`))
        return answer as string
      }
      if (await tx.conversationBusy(templateId as string, session.user.id)) reject(validationError({ message: [BUSY] }))
      const questionId = deps.newQuestionId()
      await tx.insertMessage({
        id: questionId,
        templateId: templateId as string,
        userId: session.user.id,
        content: { rol: "usuario", estado: "completado", entrada: { contenido: phpTrim(content), clave_idempotencia: key } },
      })
      const answer = deps.newAnswerId()
      await tx.insertMessage({
        id: answer,
        templateId: templateId as string,
        userId: session.user.id,
        content: { rol: "asistente", estado: "pendiente", entrada: { respuesta_a_id: questionId, borrador: draft, version_borrador: draftVersion }, contenido: "" },
      })
      dispatched.push(answer)
      return answer
    })
    for (const id of dispatched) await deps.dispatchAnswer(id)
    return apiJson({ message: "El pedido quedó registrado.", assistant_message_id: answerId }, 202)
  })
}

export async function clearAssistant(request: Request, deps: AssistantRouteDeps): Promise<Response> {
  const session = await admin(request, deps)
  if (session instanceof Response) return session
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  return clearAssistantOf(session, deps)
}

export async function clearAssistantOf(session: AppSession, deps: AssistantRouteDeps): Promise<Response> {
  const template = await deps.store.template()
  if (template === null) return fromController(modelNotFoundResponse(MODELS.template))
  return settled(async () => {
    await deps.store.transaction(async (tx) => {
      await tx.lockTemplateId()
      if (await tx.conversationBusy(template.id, session.user.id)) reject(validationError({ chat: [BUSY] }))
      await tx.hideConversation(template.id, session.user.id, deps.bridge.now())
    })
    return apiJson({ message: "Nuevo chat iniciado." })
  })
}

export function findProposal(id: string, store: AssistantStore): Promise<StoredProposal | null> {
  return isUuid(id) ? store.proposal(id) : Promise.resolve(null)
}

export function proposalNotFound(id: string): Response {
  return jsonError(404, `No query results for model [${PROPOSAL_MODEL}] ${id}`)
}

async function boundProposal(request: Request, id: string, deps: AssistantRouteDeps): Promise<{ session: AppSession; proposal: StoredProposal } | Response> {
  let proposal: StoredProposal | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        proposal = await findProposal(id, deps.store)
        return proposal === null ? proposalNotFound(id) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  return { session, proposal: proposal as unknown as StoredProposal }
}

export async function showProposal(request: Request, id: string, deps: AssistantRouteDeps): Promise<Response> {
  const bound = await boundProposal(request, id, deps)
  if (bound instanceof Response) return bound
  return showProposalOf(bound.session, bound.proposal)
}

export function showProposalOf(session: AppSession, proposal: StoredProposal): Response {
  if (proposal.requestedBy !== session.user.id) return aborted(404)
  const structure = proposal.structure
  const blockChanges = structure.block_changes
  return apiJson({
    id: proposal.id,
    status: proposal.state,
    draft_version: proposal.draftVersion,
    changes: changesList(proposal),
    changed: { sections: proposal.changes.secciones ?? null, fields: proposal.changes.campos ?? null },
    sections: structure.sections ?? null,
    ...(blockChanges !== undefined && blockChanges !== null ? { block_changes: blockChanges } : {}),
  })
}

async function decide(request: Request, id: string, deps: AssistantRouteDeps, state: string, reply: string): Promise<Response> {
  const bound = await boundProposal(request, id, deps)
  if (bound instanceof Response) return bound
  return decideOf(bound.session, bound.proposal, deps, state, reply)
}

function decideOf(session: AppSession, proposal: StoredProposal, deps: AssistantRouteDeps, state: string, reply: string): Promise<Response> {
  return settled(async () => {
    await deps.store.transaction(async (tx) => {
      const locked = await tx.lockProposal(proposal.id)
      if (locked === null) reject(jsonError(404, `No query results for model [${PROPOSAL_MODEL}] ${proposal.id}`))
      const current = locked as StoredProposal
      if (current.requestedBy !== session.user.id) reject(aborted(404))
      if (current.state !== PENDING) reject(validationError({ proposal: [NOT_PENDING] }))
      await tx.decideProposal(current.id, state, session.user.id, deps.bridge.now())
    })
    return apiJson({ message: reply })
  })
}

export function applyProposal(request: Request, id: string, deps: AssistantRouteDeps): Promise<Response> {
  return decide(request, id, deps, APPLIED, "Propuesta aplicada en el editor.")
}

export function discardProposal(request: Request, id: string, deps: AssistantRouteDeps): Promise<Response> {
  return decide(request, id, deps, DISCARDED, "Propuesta descartada.")
}

export function applyProposalOf(session: AppSession, proposal: StoredProposal, deps: AssistantRouteDeps): Promise<Response> {
  return decideOf(session, proposal, deps, APPLIED, "Propuesta aplicada en el editor.")
}

export function discardProposalOf(session: AppSession, proposal: StoredProposal, deps: AssistantRouteDeps): Promise<Response> {
  return decideOf(session, proposal, deps, DISCARDED, "Propuesta descartada.")
}
