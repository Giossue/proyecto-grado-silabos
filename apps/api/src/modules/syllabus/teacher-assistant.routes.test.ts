// @vitest-environment node
import "reflect-metadata"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { TeacherAssistantRouteDeps } from "../../server/ai/teacherAssistantRoutes"
import { CAREER_ID, fakeTeacherStore, storeWorld, SYLLABUS_ID, type StoreWorld } from "../../server/ai/teacherStoreTesting"
import { assistantSnapshot } from "../../server/ai/teacherContext"
import { fieldByKey, templatesOf } from "../../server/ai/teacherTesting"
import { testConfig } from "../../server/ai/testing"
import { createRateLimiter } from "../../server/http/throttle"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { FallbackModule } from "../fallback/fallback.module"
import { SyllabusModule } from "./syllabus.module"
import { TEACHER_ASSISTANT_DEPS } from "./syllabus.tokens"

const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const PATH = `/api/v1/teacher/syllabi/${SYLLABUS_ID}/assistant`
const PROPOSAL = "e0000000-0000-4000-8000-000000000001"
const SECOND = "e0000000-0000-4000-8000-000000000002"

let app: NestExpressApplication
let world: StoreWorld
let sessions: FakeWorld
let deps: TeacherAssistantRouteDeps
let dispatched: string[]

function live<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get: (_target, property) => {
      if (sessions === undefined) return undefined
      const value = (pick() as Record<string | symbol, unknown>)[property]
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(pick()) : value
    },
  })
}

const liveBridge = live(() => fakeDeps(sessions))
const liveDeps = live(() => deps)

beforeEach(() => {
  world = storeWorld(golden.userId, ["descripcion"])
  sessions = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "docente", careerId: CAREER_ID })],
  }
  dispatched = []
  let sequence = 0
  const limiter = createRateLimiter()
  const store = fakeTeacherStore(world)
  deps = {
    bridge: liveBridge,
    store,
    config: () => testConfig(),
    enabled: async () => true,
    today: () => "2026-11-27",
    now: () => world.clock,
    limiter: () => limiter,
    newQuestionId: () => `a0000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    newAnswerId: () => `b0000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    dispatchAnswer: async (id) => void dispatched.push(id),
  }
})

beforeAll(async () => {
  vi.stubEnv("APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6399/15")
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, SyllabusModule, FallbackModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(liveBridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(createRateLimiter())
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(TEACHER_ASSISTANT_DEPS)
    .useValue(liveDeps)
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
  vi.unstubAllEnvs()
})

function call(method: "get" | "head" | "post", path: string, body?: object, signedIn = true) {
  const pending = request(app.getHttpServer())[method](path).set("accept", "application/json").set("referer", "http://localhost:3000/docente").set("host", "localhost:3000").set("x-csrf-token", golden.csrfToken)
  if (signedIn) pending.set("cookie", COOKIE)
  return body === undefined ? pending : pending.set("content-type", "application/json").send(JSON.stringify(body))
}

async function seedProposals(): Promise<void> {
  const snapshot = assistantSnapshot({ template: world.template, templates: await templatesOf(world), values: world.values, allowedKeys: world.allowed, academicContext: world.context })
  const readable = snapshot.fields[0]
  const target = readable.targets[0]
  const base = { syllabusId: SYLLABUS_ID, userId: golden.userId, sentFields: [], errorCode: null, createdAt: world.clock }
  world.messages = [
    { ...base, id: "a1", role: "usuario", state: "completado", replyTo: null, content: { texto: "Pedido" }, key: "k" },
    { ...base, id: "b1", role: "asistente", state: "completado", replyTo: "a1", content: { texto: "Hecho." }, key: null },
  ]
  world.proposals = [PROPOSAL, SECOND].map((id, position) => ({
    id,
    messageId: "b1",
    syllabusId: SYLLABUS_ID,
    userId: golden.userId,
    position,
    state: "pendiente",
    fieldId: fieldByKey(world.template, "descripcion").id,
    target: { kind: target.kind, space: target.space, path: target.path, mold: target.mold, fieldKey: "descripcion", fieldLabel: "Descripción" },
    baseHash: target.baseHash,
    text: "Estudia redes.",
    basis: "Los datos.",
  }))
}

describe("the teacher assistant routes served by Nest", () => {
  it("show the conversation, also to HEAD", async () => {
    const shown = await call("get", PATH)

    expect([shown.status, shown.body]).toEqual([200, { available: true, limit: 20, remaining: 20, busy: false, messages: [] }])
    expect((await call("head", PATH)).status).toBe(200)
  })

  it("take a request body and answer 202", async () => {
    const sent = await call("post", `${PATH}/messages`, { message: "Mejore la descripción", idempotency_key: "90000000-0000-4000-8000-000000000001" })

    expect([sent.status, sent.body]).toEqual([202, { message: "El pedido quedó registrado.", assistant_message_id: dispatched[0] }])
    expect(world.messages[0].content).toEqual({ texto: "Mejore la descripción" })
  })

  it("accept and discard the proposal named in the address", async () => {
    await seedProposals()

    const accepted = await call("post", `${PATH}/proposals/${PROPOSAL}/accept`, { version_bloqueo: 3 })
    const discarded = await call("post", `${PATH}/proposals/${SECOND}/discard`)

    expect([accepted.status, accepted.body.version_bloqueo, accepted.body.value.type]).toEqual([200, 3, "doc"])
    expect([discarded.status, discarded.body]).toEqual([200, { message: "Propuesta descartada." }])
    expect(world.proposals.map((item) => item.state)).toEqual(["aceptada", "descartada"])
  })

  it("ask for a session and find the syllabus before anything else", async () => {
    expect((await call("get", PATH, undefined, false)).status).toBe(401)
    expect((await call("post", `${PATH}/messages`, {}, false)).status).toBe(401)
    expect((await call("get", "/api/v1/teacher/syllabi/50000000-0000-4000-8000-000000000099/assistant")).status).toBe(404)
  })
})
