import golden from "../laravel/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpShape, type PhpRecord } from "../configuration/phpValues"
import { contentForField, fieldDocument } from "../configuration/templateDraft"
import type { SyllabusTemplate, TemplateSection } from "../configuration/templatePresentation"
import { officialDefinition, officialSections } from "../configuration/templateProvisioner"
import { normalizeFieldDocument } from "../configuration/templateRuntime"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import type { AssistantStore, AssistantTx, StoredMessage, StoredProposal } from "./assistantStore"
import { aiConfig, type AiConfig } from "./config"
import type { AiAgentGateway, AiAgentRequest, AiAgentStep } from "./gateway"
import { phpJson } from "./php"

export const TEMPLATE_ID = "01a1c5ba-10b4-7129-925f-c28a9489323c"
export const SESSION_ID = golden.sessionId
export const ADMIN_ID = golden.userId
export const ROLE_ID = golden.roleId
export const COORDINATOR_ID = "01a1c5ba-3333-7000-8000-000000000001"
export const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`

export function officialTemplate(): SyllabusTemplate {
  const definition = officialDefinition()
  let counter = 0
  const id = (prefix: string) => `01a1c5ba-${prefix}-7000-8000-${String(++counter).padStart(12, "0")}`
  const sections: TemplateSection[] = officialSections().map((section, sectionIndex) => ({
    id: id("2222"),
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    position: sectionIndex + 1,
    blocks: section.fields.map((field, fieldIndex) => {
      const blockId = id("1111")
      const content = phpShape(contentForField(field.responsible, normalizeFieldDocument(fieldDocument(field.content), definition))) as PhpRecord
      return {
        id: blockId,
        key: field.key,
        title: field.label ?? "",
        position: fieldIndex + 1,
        fields: [{ id: id("0000"), blockId, key: field.key, label: field.label ?? "", responsible: field.responsible, content }],
      }
    }),
  }))
  return { id: TEMPLATE_ID, modifiedAt: null, definition: JSON.parse(JSON.stringify(definition)), sections }
}

export function testConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return { ...aiConfig({ AI_DRIVER: "baseline" }), ...overrides }
}

export type AssistantWorld = {
  template: SyllabusTemplate | null
  messages: StoredMessage[]
  proposals: StoredProposal[]
  audits: AuditEventInput[]
  processes: string[]
  clock: number
}

export function assistantWorld(template: SyllabusTemplate | null = officialTemplate()): AssistantWorld {
  return { template, messages: [], proposals: [], audits: [], processes: [], clock: 0 }
}

function stamp(world: AssistantWorld): string {
  world.clock++
  return new Date(Date.UTC(2026, 10, 24, 10, 0, world.clock)).toISOString().slice(0, 19) + "+00:00"
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function stored(value: PhpRecord): PhpRecord {
  return JSON.parse(phpJson(phpShape(value))) as PhpRecord
}

const open = (message: StoredMessage) => ["pendiente", "en_ejecucion"].includes(String(message.content.estado ?? ""))
const visible = (world: AssistantWorld, templateId: string, userId: string) =>
  world.messages.filter((message) => message.templateId === templateId && message.userId === userId && message.hiddenAt === null)

export function fakeAssistantStore(world: AssistantWorld): AssistantStore {
  const tx = (): AssistantTx => ({
    lockTemplateId: async () => world.template?.id ?? null,
    questionByKey: async (templateId, userId, key) =>
      world.messages.find(
        (message) =>
          message.templateId === templateId &&
          message.userId === userId &&
          message.content.rol === "usuario" &&
          (message.content.entrada as PhpRecord | undefined)?.clave_idempotencia === key,
      )?.id ?? null,
    answerTo: async (questionId) => world.messages.find((message) => (message.content.entrada as PhpRecord | undefined)?.respuesta_a_id === questionId)?.id ?? null,
    conversationBusy: async (templateId, userId) => visible(world, templateId, userId).some(open),
    insertMessage: async (message) => {
      world.messages.push({ ...message, content: stored(message.content), sentAt: stamp(world), hiddenAt: null })
    },
    lockProposal: async (id) => copy(world.proposals.find((proposal) => proposal.id === id) ?? null),
    decideProposal: async (id, state, actorId) => {
      world.proposals = world.proposals.map((proposal) => (proposal.id === id ? { ...proposal, state, decidedBy: actorId } : proposal))
    },
    lockMessage: async (id) => copy(world.messages.find((message) => message.id === id) ?? null),
    updateMessage: async (id, content) => {
      world.messages = world.messages.map((message) => (message.id === id ? { ...message, content: stored(content) } : message))
    },
    replacePendingProposals: async (templateId, userId) => {
      world.proposals = world.proposals.map((proposal) =>
        proposal.templateId === templateId && proposal.requestedBy === userId && proposal.state === "pendiente" ? { ...proposal, state: "reemplazada" } : proposal,
      )
    },
    insertProposal: async (proposal) => {
      world.proposals.push({
        ...proposal,
        structure: stored(proposal.structure),
        changes: stored(proposal.changes),
        state: "pendiente",
        decidedBy: null,
        createdAt: stamp(world),
      })
    },
    recordAudit: async (event) => {
      world.audits.push(event)
    },
  })
  return {
    template: async () => (world.template === null ? null : copy(world.template)),
    conversation: async (templateId, userId) =>
      visible(world, templateId, userId).map((message) => ({ ...copy(message), proposal: copy(world.proposals.find((proposal) => proposal.messageId === message.id) ?? null) })),
    conversationBusy: async (templateId, userId) => visible(world, templateId, userId).some(open),
    hideConversation: async (templateId, userId) => {
      const hidden = stamp(world)
      world.messages = world.messages.map((message) =>
        message.templateId === templateId && message.userId === userId && message.hiddenAt === null ? { ...message, hiddenAt: hidden } : message,
      )
    },
    openProcess: async () => world.processes.includes("abierto"),
    processState: async () => (world.processes.includes("abierto") ? "abierta" : world.processes.includes("pausado") ? "pausada" : "ninguna"),
    proposal: async (id) => copy(world.proposals.find((proposal) => proposal.id === id) ?? null),
    message: async (id) => copy(world.messages.find((message) => message.id === id) ?? null),
    history: async (message, questionId, limit) => {
      const question = world.messages.find((item) => item.id === questionId)
      return visible(world, message.templateId, message.userId)
        .filter((item) => item.id !== message.id && item.id !== questionId && question !== undefined && item.sentAt < question.sentAt && item.content.estado === "completado")
        .sort((left, right) => (left.sentAt < right.sentAt ? 1 : -1))
        .slice(0, limit)
        .map(copy)
    },
    lastProposal: async (templateId, userId) =>
      copy([...world.proposals].filter((proposal) => proposal.templateId === templateId && proposal.requestedBy === userId).sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))[0] ?? null),
    async transaction(work) {
      const before = { messages: copy(world.messages), proposals: copy(world.proposals), audits: world.audits.length, clock: world.clock }
      try {
        return await work(tx())
      } catch (error) {
        world.messages = before.messages
        world.proposals = before.proposals
        world.audits.length = before.audits
        throw error
      }
    },
  }
}

export type ScriptedGateway = AiAgentGateway & { requests: AiAgentRequest[]; toolResults(index: number): string[] }

let sequence = 0

export function resetCallSequence(): void {
  sequence = 0
}

export function calls(...items: [string, PhpRecord?][]): AiAgentStep {
  return {
    gatewayVersion: "guion",
    content: null,
    toolCalls: items.map(([name, args = {}]) => ({
      id: `call-${++sequence}`,
      name,
      arguments: args,
      rawArguments: Object.keys(args).length === 0 ? "{}" : phpJson(args, { unicode: true }),
    })),
    usage: { prompt: 100, completion: 10, cached: 80 },
  }
}

export function call(name: string, args: PhpRecord = {}): AiAgentStep {
  return calls([name, args])
}

export function scriptedGateway(script: (AiAgentStep | Error)[]): ScriptedGateway {
  const requests: AiAgentRequest[] = []
  let index = 0
  return {
    requests,
    version: () => "guion",
    step: async (request) => {
      requests.push(request)
      const next = script[index++]
      if (next === undefined) throw new Error("El guion de la prueba se agotó.")
      if (next instanceof Error) throw next
      return next
    },
    toolResults: (position) => requests[position].messages.filter((message) => message.role === "tool").map((message) => message.content ?? ""),
  }
}

export function sessionWorld(role = "administrador"): FakeWorld {
  return {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role, careerId: role === "administrador" ? null : "c-1" })],
  }
}

export function bridgeFor(world: FakeWorld, forwarded: Request[] = []) {
  return fakeDeps(world, forwarded)
}

export function assistantRequest(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1/admin/template/assistant${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      referer: "http://localhost:3000/administracion/plantilla",
      cookie,
      "x-csrf-token": golden.csrfToken,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export { NOW }
