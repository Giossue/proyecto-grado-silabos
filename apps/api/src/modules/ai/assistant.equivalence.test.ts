// @vitest-environment node
import "reflect-metadata"
import type { AddressInfo } from "node:net"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fakeDeps, makeAssignment, makeUser, NOW, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { createRateLimiter } from "../../server/http/throttle"
import { AssistantDraft } from "../../server/ai/assistantDraft"
import { applyProposal, clearAssistant, discardProposal, showAssistant, showProposal, storeAssistantMessage, type AssistantRouteDeps } from "../../server/ai/assistantRoutes"
import type { AssistantStore, StoredProposal } from "../../server/ai/assistantStore"
import type { AiConfig } from "../../server/ai/config"
import { ADMIN_ID, assistantWorld, cookie, fakeAssistantStore, officialTemplate, sessionWorld, testConfig, type AssistantWorld } from "../../server/ai/testing"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { FallbackModule } from "../fallback/fallback.module"
import { dispatchOracle, type OracleRoute } from "../../common/testing/oracle-router"
import { TemplateModule } from "../template/template.module"
import { AssistantRepository } from "./assistant.repository"
import { ASSISTANT_RUNTIME, type AssistantRuntime } from "./assistant.tokens"

const PATH = "/api/v1/admin/template/assistant"
const OTHER_USER = "c0000000-0000-4000-8000-000000000009"
const QUESTION = "01a1c5ba-aaaa-7000-8000-000000000001"
const ANSWER = "0b1c5ba0-aaaa-4000-8000-000000000002"
const PROPOSAL = "01a1c5ba-bbbb-7000-8000-000000000001"
const FOREIGN = "01a1c5ba-bbbb-7000-8000-000000000002"
const MISSING = "01a1c5ba-bbbb-7000-8000-000000000003"
const HEADERS = ["content-type", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy"]

type State = { sessions: FakeWorld; world: AssistantWorld; config: AiConfig; dispatched: string[]; sequence: number; bridge: BridgeDeps; store: AssistantStore }

type Call = { method: string; path: string; body?: unknown; cookie?: boolean }

type Answer = { status: number; body: string; headers: Record<string, string | null>; world: unknown; dispatched: string[]; sessions: string[] }

let scenario: () => Partial<State> = () => ({})
let state: State

function proposal(overrides: Partial<StoredProposal> = {}): StoredProposal {
  return {
    id: PROPOSAL,
    templateId: officialTemplate().id,
    messageId: ANSWER,
    requestedBy: ADMIN_ID,
    structure: { sections: [{ key: "datos", title: "Datos" }], block_changes: { tabla: ["nueva"] } },
    changes: { lista: ["Agrega la sección Datos."], secciones: ["datos"], campos: [] },
    fingerprint: "a".repeat(64),
    draftVersion: "sesion-1:3",
    state: "pendiente",
    decidedBy: null,
    createdAt: "2026-11-24T10:00:03+00:00",
    ...overrides,
  }
}

function seededWorld(): AssistantWorld {
  const world = assistantWorld()
  const templateId = officialTemplate().id
  world.messages = [
    { id: QUESTION, templateId, userId: ADMIN_ID, content: { rol: "usuario", estado: "completado", entrada: { contenido: "Agrega datos", clave_idempotencia: "clave-1" } }, sentAt: "2026-11-24T10:00:01+00:00", hiddenAt: null },
    { id: ANSWER, templateId, userId: ADMIN_ID, content: { rol: "asistente", estado: "completado", entrada: { respuesta_a_id: QUESTION }, contenido: "Listo.", resultado: "propuesta" }, sentAt: "2026-11-24T10:00:02+00:00", hiddenAt: null },
  ]
  world.proposals = [proposal(), proposal({ id: FOREIGN, requestedBy: OTHER_USER, messageId: "0b1c5ba0-aaaa-4000-8000-000000000009" })]
  world.clock = 10
  return world
}

function freshState(): State {
  const base = { sessions: sessionWorld(), world: seededWorld(), config: testConfig(), dispatched: [] as string[], sequence: 0 }
  const merged = { ...base, ...scenario() }
  return { ...merged, bridge: fakeDeps(merged.sessions), store: fakeAssistantStore(merged.world) }
}

const nextId = (prefix: string) => `${prefix}-0000-7000-8000-${String(++state.sequence).padStart(12, "0")}`

const runtime: AssistantRuntime = {
  config: () => state.config,
  newQuestionId: () => nextId("01a1c5ba"),
  newAnswerId: () => nextId("0b1c5ba0"),
  dispatchAnswer: async (messageId) => void state.dispatched.push(messageId),
}

const store = new Proxy({} as AssistantStore, { get: (_target, name: keyof AssistantStore) => state.store[name] })

const bridge: BridgeDeps = {
  store: { findUser: (id) => state.bridge.store.findUser(id), effectiveRoleAssignments: (id) => state.bridge.store.effectiveRoleAssignments(id) },
  sessions: {
    fromWebApp: (request) => state.bridge.sessions.fromWebApp(request),
    resolve: (request) => state.bridge.sessions.resolve(request),
    find: (token) => state.bridge.sessions.find(token),
    setActiveRole: (session, id) => state.bridge.sessions.setActiveRole(session, id),
    revokeUser: (id) => state.bridge.sessions.revokeUser(id),
  },
  config: fakeDeps({ sessions: new Map(), users: [], assignments: [] }).config,
  now: () => NOW,
}

const deps = (): AssistantRouteDeps => ({ bridge, store, ...runtime })

const LEGACY: OracleRoute[] = [
  { path: "api/v1/admin/template/assistant", handlers: { GET: (request: Request) => showAssistant(request, deps()), DELETE: (request: Request) => clearAssistant(request, deps()) } },
  { path: "api/v1/admin/template/assistant/messages", handlers: { POST: (request: Request) => storeAssistantMessage(request, deps()) } },
  {
    path: "api/v1/admin/template/assistant/proposals/[proposal]",
    handlers: { GET: async (request: Request, context: { params: Promise<{ proposal: string }> }) => showProposal(request, (await context.params).proposal, deps()) },
  },
  {
    path: "api/v1/admin/template/assistant/proposals/[proposal]/apply",
    handlers: { POST: async (request: Request, context: { params: Promise<{ proposal: string }> }) => applyProposal(request, (await context.params).proposal, deps()) },
  },
  {
    path: "api/v1/admin/template/assistant/proposals/[proposal]/discard",
    handlers: { POST: async (request: Request, context: { params: Promise<{ proposal: string }> }) => discardProposal(request, (await context.params).proposal, deps()) },
  },
]

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/administracion/plantilla",
    ...(call.cookie === false ? {} : { cookie }),
    ...(call.body === undefined ? {} : { "content-type": "application/json" }),
  }
}

async function answerOf(response: Response): Promise<Pick<Answer, "status" | "body" | "headers">> {
  return { status: response.status, body: await response.text(), headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])) }
}

async function legacy(call: Call): Promise<Pick<Answer, "status" | "body" | "headers">> {
  const request = new Request(new URL(call.path, "http://localhost:3000"), { method: call.method, headers: headersOf(call), body: call.body === undefined ? undefined : JSON.stringify(call.body) })
  return answerOf(await dispatchOracle(LEGACY, request))
}

let app: NestExpressApplication
let origin: string

async function nest(call: Call): Promise<Pick<Answer, "status" | "body" | "headers">> {
  const response = await fetch(`${origin}${call.path}`, {
    method: call.method,
    headers: { ...headersOf(call), "x-forwarded-host": "localhost:3000" },
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
    redirect: "manual",
  })
  return answerOf(response)
}

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const run = async (send: (call: Call) => Promise<Pick<Answer, "status" | "body" | "headers">>) => {
    state = freshState()
    const answers: Answer[] = []
    for (const call of calls) {
      const answer = await send(call)
      answers.push({ ...answer, world: structuredClone(state.world), dispatched: [...state.dispatched], sessions: [...state.sessions.sessions.values()].map((record) => record.payload) })
    }
    return answers
  }
  const before = await run(legacy)
  const after = await run(nest)
  expect(after).toEqual(before)
  return after
}

const statuses = (answers: Answer[]) => answers.map((answer) => answer.status)

const draft = () => JSON.parse(JSON.stringify(AssistantDraft.fromTemplate(officialTemplate() as never).payload().sections)) as unknown[]

const ask = (key: string, message = "Agrega una sección de datos") => ({ method: "POST", path: `${PATH}/messages`, body: { message, idempotency_key: key, draft: draft(), draft_version: "sesion-1:4" } })

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, TemplateModule, FallbackModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(bridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(createRateLimiter())
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AssistantRepository)
    .useValue({ store })
    .overrideProvider(ASSISTANT_RUNTIME)
    .useValue(runtime)
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.listen(0, "127.0.0.1")
  origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  scenario = () => ({})
})

describe("template assistant routes served by Nest answer exactly like the route handlers they replace", () => {
  it("shows the conversation before the template routes can take «assistant» as a template id", async () => {
    const [answer] = await expectSame({ method: "GET", path: PATH })
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.body)).toMatchObject({ available: true, locked: false })
  })

  it("queues a question once per idempotency key and refuses a second one while it is pending", async () => {
    const answers = await expectSame(ask("9e9e9e9e-0000-4000-8000-000000000002"), ask("9e9e9e9e-0000-4000-8000-000000000002"), ask("9e9e9e9e-0000-4000-8000-000000000003"), { method: "DELETE", path: PATH })
    expect(statuses(answers)).toEqual([202, 202, 422, 422])
    expect(answers[3].dispatched).toHaveLength(1)
  })

  it("answers an invalid question, an unavailable assistant and a missing template the same way", async () => {
    await expectSame({ method: "POST", path: `${PATH}/messages`, body: { message: "", idempotency_key: "", draft: "x" } }, { method: "POST", path: `${PATH}/messages`, body: [] })
    scenario = () => ({ config: testConfig({ driver: "disabled" }) })
    await expectSame(ask("9e9e9e9e-0000-4000-8000-000000000004"), { method: "GET", path: PATH })
    scenario = () => ({ world: assistantWorld(null) })
    const missing = await expectSame(ask("9e9e9e9e-0000-4000-8000-000000000005"), { method: "GET", path: PATH }, { method: "DELETE", path: PATH })
    expect(statuses(missing)).toEqual([404, 404, 404])
  })

  it("starts a new chat and shows, applies and discards proposals with the same writes", async () => {
    const answers = await expectSame(
      { method: "GET", path: `${PATH}/proposals/${PROPOSAL}` },
      { method: "POST", path: `${PATH}/proposals/${PROPOSAL}/apply` },
      { method: "POST", path: `${PATH}/proposals/${PROPOSAL}/discard` },
      { method: "DELETE", path: PATH },
      { method: "GET", path: PATH },
    )
    expect(statuses(answers)).toEqual([200, 200, 422, 200, 200])
    expect(await expectSame({ method: "POST", path: `${PATH}/proposals/${PROPOSAL}/discard` })).toHaveLength(1)
  })

  it("answers a foreign, a missing and a malformed proposal with the same 404", async () => {
    const answers = await expectSame(
      { method: "GET", path: `${PATH}/proposals/${FOREIGN}` },
      { method: "POST", path: `${PATH}/proposals/${FOREIGN}/apply` },
      { method: "GET", path: `${PATH}/proposals/${MISSING}` },
      { method: "POST", path: `${PATH}/proposals/${MISSING}/discard` },
      { method: "GET", path: `${PATH}/proposals/no-es-uuid` },
    )
    expect(statuses(answers)).toEqual([404, 404, 404, 404, 404])
  })

  it("answers a guest, another role, a session without an active role and an unverified user the same way", async () => {
    const calls = [{ method: "GET", path: PATH }, ask("9e9e9e9e-0000-4000-8000-000000000006"), { method: "DELETE", path: PATH }, { method: "GET", path: `${PATH}/proposals/${PROPOSAL}` }, { method: "POST", path: `${PATH}/proposals/${PROPOSAL}/apply` }]
    expect(statuses(await expectSame(...calls.map((call) => ({ ...call, cookie: false }))))).toEqual([401, 401, 401, 401, 401])
    scenario = () => ({ sessions: sessionWorld("docente") })
    expect(statuses(await expectSame(...calls))).toEqual([403, 403, 403, 403, 403])
    scenario = () => ({ sessions: { ...sessionWorld(), assignments: [] } })
    expect(statuses(await expectSame(...calls))).toEqual([409, 409, 409, 409, 409])
    scenario = () => ({ sessions: { ...sessionWorld(), users: [makeUser({ emailVerifiedAt: null })] } })
    await expectSame(...calls)
    scenario = () => ({ sessions: { ...sessionWorld(), users: [makeUser({ active: false })], assignments: [makeAssignment({ role: "administrador", careerId: null })] } })
    await expectSame(calls[0])
  })

  it.each([
    ["POST", PATH],
    ["PUT", PATH],
    ["GET", `${PATH}/messages`],
    ["DELETE", `${PATH}/proposals/${PROPOSAL}`],
    ["GET", `${PATH}/proposals/${PROPOSAL}/apply`],
    ["PATCH", `${PATH}/proposals/${PROPOSAL}/discard`],
  ])("answers %s %s with the router answer of the contract", async (method, pathname) => {
    await expectSame({ method, path: pathname, cookie: false })
  })
})
