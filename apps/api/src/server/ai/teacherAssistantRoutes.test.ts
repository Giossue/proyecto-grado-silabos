// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { PhpRecord } from "../configuration/phpValues"
import { createRateLimiter, type RateLimiter } from "../http/throttle"
import { institutionDay } from "./teacherQuota"
import { aiConfig, type AiConfig } from "./config"
import { answerTeacherAssistant } from "./teacherAnswerJob"
import { sendTeacherAssistantMessage, showTeacherAssistant, type TeacherAssistantRouteDeps } from "./teacherAssistantRoutes"
import { CAREER_ID, fakeTeacherStore, OTHER_SYLLABUS_ID, storeWorld, SYLLABUS_ID, type StoreWorld, proposalsIn } from "./teacherStoreTesting"
import type { TeacherAssistantStore } from "./teacherAssistantStore"
import { docOf, line, teacherWrites } from "./teacherTesting"
import { call, resetCallSequence, scriptedGateway, testConfig } from "./testing"

const TEACHER = golden.userId
const OTHER_TEACHER = "d0000000-0000-4000-8000-000000000002"
const MISSING = "50000000-0000-4000-8000-000000000099"
const FORBIDDEN = { message: "No tiene permiso para hacer esto." }
const OFF = "El asistente no está disponible por ahora."
const BUSY = "Espere a que el asistente termine la respuesta anterior."
const LIMIT = "Llegó al límite de 20 pedidos de hoy al asistente. Podrá pedir otra vez mañana."
const KEY = (index: number) => `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`

let world: StoreWorld
let sessions: FakeWorld
let store: TeacherAssistantStore
let limiter: RateLimiter
let config: AiConfig
let enabled: boolean
let clock: number
let today: string
let dispatched: string[]
let dispatchFails: boolean
let sequence: number

beforeEach(() => {
  world = storeWorld(TEACHER, ["descripcion", "objetivo_general"])
  sessions = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "docente", careerId: CAREER_ID })],
  }
  store = fakeTeacherStore(world)
  const counter = createRateLimiter()
  limiter = {
    attempt: async (...input) => (await new Promise((resolve) => setTimeout(resolve, 1)), counter.attempt(...input)),
    attempts: (key, now) => counter.attempts(key, now),
  }
  config = testConfig()
  enabled = true
  clock = Date.parse("2026-11-27T15:00:00Z") / 1000
  world.clock = clock
  today = "2026-11-27"
  dispatched = []
  dispatchFails = false
  sequence = 0
  resetCallSequence()
})

const nextId = (prefix: string) => `${prefix}-0000-4000-8000-${String(++sequence).padStart(12, "0")}`

function deps(): TeacherAssistantRouteDeps {
  return {
    bridge: fakeDeps(sessions),
    store,
    config: () => config,
    enabled: async () => enabled,
    today: () => today,
    now: () => clock,
    limiter: () => limiter,
    newQuestionId: () => nextId("a0000000"),
    newAnswerId: () => nextId("b0000000"),
    dispatchAnswer: async (id) => {
      if (dispatchFails) throw new Error("sin cola")
      dispatched.push(id)
    },
  }
}

type Options = { body?: unknown; syllabus?: string; signedIn?: boolean }

function request(method: string, path: string, { body, syllabus = SYLLABUS_ID, signedIn = true }: Options = {}): Request {
  const base = apiRequest(`/api/v1/teacher/syllabi/${syllabus}/assistant${path}`, {
    method,
    cookie: signedIn ? `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}` : undefined,
    headers: { "x-csrf-token": golden.csrfToken, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  })
  return body === undefined ? base : new Request(base, { body: JSON.stringify(body) })
}

async function reply(response: Response) {
  return { status: response.status, headers: response.headers, json: (await response.json()) as PhpRecord }
}

const show = async (options: Options = {}) => reply(await showTeacherAssistant(request("GET", "", options), options.syllabus ?? SYLLABUS_ID, deps()))
const send = async (message: unknown = "Mejore la descripción", key: unknown = KEY(1), options: Options = {}) =>
  reply(await sendTeacherAssistantMessage(request("POST", "/messages", { ...options, body: { message, idempotency_key: key } }), options.syllabus ?? SYLLABUS_ID, deps()))

async function answered(destinos: [string, string][], keys: string[] = ["descripcion", "objetivo_general"], idempotency = KEY(1)) {
  const sent = await send("Mejore", idempotency)
  expect(sent.status).toBe(202)
  const gateway = scriptedGateway([
    call("leer_campos", { claves: keys }),
    call("responder", { mensaje: "Le propongo esto.", propuestas: destinos.map(([destino, texto]) => ({ destino, texto, fundamento: "Los datos de la asignatura." })) }),
  ])
  await answerTeacherAssistant(String(sent.json.assistant_message_id), {
    ...deps(),
    gateway: () => gateway,
    appKey: () => "clave",
    teacherSession: async () => ({ user: makeUser(), activeRole: sessions.assignments[0], eligibleRoles: sessions.assignments, session: { id: "", token: "", userId: TEACHER, activeRoleAssignmentId: null, cookies: [] } }),
    newProposalId: () => nextId("e0000000"),
  })
  return proposalsIn(world).slice(-destinos.length)
}

const messagesOf = (response: { json: PhpRecord }) => response.json.messages as (PhpRecord & { proposals: PhpRecord[] })[]

describe("availability and conversation", () => {
  it("says it is available, with the daily limit and what is left", async () => {
    const response = await show()

    expect(response.status).toBe(200)
    expect(response.json).toEqual({ available: true, limit: 20, remaining: 20, busy: false, messages: [] })
  })

  it.each([
    ["the switch is off", () => void (enabled = false)],
    ["the provider is not configured", () => void (config = aiConfig({ AI_DRIVER: "deepseek" }))],
    ["the provider is disabled", () => void (config = aiConfig({}))],
  ])("says only that it is not available when %s, even with a conversation", async (_case, change) => {
    await answered([["descripcion", "Nueva"]])
    change()

    expect(await show()).toMatchObject({ status: 200, json: { available: false } })
    expect(Object.keys((await show()).json)).toEqual(["available"])
  })

  it("returns the messages with their proposals, as text to copy", async () => {
    const [first, second] = await answered([["descripcion", "Estudia redes."], ["objetivo_general", "Comprender las redes."]])

    const response = await show()

    expect(response.json).toMatchObject({ available: true, remaining: 19, busy: false })
    expect(messagesOf(response)).toEqual([
      { id: expect.any(String), role: "usuario", status: "completado", content: "Mejore", error: null, created_at: "2026-11-27T15:00:00+00:00", proposals: [] },
      {
        id: expect.any(String),
        role: "asistente",
        status: "completado",
        content: "Le propongo esto.",
        error: null,
        created_at: "2026-11-27T15:00:00+00:00",
        proposals: [first, second].map((item) => ({
          id: item.id,
          status: "pendiente",
          field_id: item.fieldId,
          field_key: item.target.fieldKey,
          field_label: item.target.fieldLabel,
          target: "campo",
          space: null,
          text: item.text,
          basis: "Los datos de la asignatura.",
        })),
      },
    ])
    expect(JSON.stringify(response.json)).not.toContain("traza")
  })

  it("does not read the syllabus to show the conversation, so later changes leave the proposals as they were", async () => {
    await answered([["descripcion", "Estudia redes."], ["objetivo_general", "Comprender las redes."]])
    const before = messagesOf(await show())
    teacherWrites(world, "descripcion", docOf(line("Escrito después.")))
    world.allowed.delete("objetivo_general")
    store.reading.values = async () => {
      throw new Error("no debía leer el sílabo")
    }

    expect(messagesOf(await show())).toEqual(before)
  })
})

describe("authorization of every route", () => {
  const routes = (options: Options) => [() => show(options), () => send("Pedido", KEY(50), options)]

  async function expectEverywhere(status: number, json: PhpRecord | null, options: Options = {}) {
    const before = structuredClone({ messages: world.messages, proposals: proposalsIn(world) })
    const queued = dispatched.length
    for (const route of routes(options)) {
      const response = await route()
      expect(response.status).toBe(status)
      if (json !== null) expect(response.json).toEqual(json)
    }
    expect({ messages: world.messages, proposals: proposalsIn(world) }).toEqual(before)
    expect(dispatched).toHaveLength(queued)
  }

  beforeEach(async () => {
    await answered([["descripcion", "Estudia redes."]])
  })

  it("asks for a session", async () => {
    await expectEverywhere(401, { message: "Unauthenticated." }, { signedIn: false })
  })

  it("answers 404 for a syllabus that does not exist", async () => {
    await expectEverywhere(404, null, { syllabus: MISSING })
  })

  it.each([
    ["the syllabus belongs to another teacher", () => void world.teachers.set(SYLLABUS_ID, [OTHER_TEACHER])],
    ["it was sent to review", () => void (world.facts.state = "en_revision")],
    ["it is approved", () => void (world.facts.state = "aprobado")],
    ["the period is paused", () => void (world.facts.processState = "pausado")],
    ["the deadline passed", () => void (world.facts.dueOn = "2026-11-26")],
    ["it belongs to another career", () => void (world.facts.careerId = "c0000000-0000-4000-8000-000000000009")],
    ["the active role is not the teacher", () => void (sessions.assignments[0] = { ...sessions.assignments[0], role: "coordinador" })],
  ])("refuses with 403 when %s", async (_case, change) => {
    change()

    await expectEverywhere(403, FORBIDDEN)
  })

  it.each([
    ["the switch is off", () => void (enabled = false)],
    ["the provider is not configured", () => void (config = aiConfig({ AI_DRIVER: "deepseek" }))],
  ])("refuses to send when %s", async (_case, change) => {
    change()
    const before = structuredClone({ messages: world.messages, proposals: proposalsIn(world) })

    expect(await send("Pedido", KEY(51))).toMatchObject({ status: 422, json: { message: OFF, errors: { assistant: [OFF] } } })
    expect({ messages: world.messages, proposals: proposalsIn(world) }).toEqual(before)
    expect(dispatched).toHaveLength(1)
    enabled = true
    config = testConfig()
    expect((await show()).json.remaining).toBe(19)
  })

  it("hides the conversation and the proposals of the earlier teacher after a reassignment", async () => {
    world.teachers.set(SYLLABUS_ID, [OTHER_TEACHER])
    sessions.users = [makeUser({ id: OTHER_TEACHER })]
    sessions.assignments = [makeAssignment({ userId: OTHER_TEACHER, role: "docente", careerId: CAREER_ID })]
    sessions.sessions.set(golden.sessionId, { payload: sessionPayload(loggedInAttributes({ user_id: OTHER_TEACHER })), lastActivity: NOW })

    expect((await show()).json).toEqual({ available: true, limit: 20, remaining: 20, busy: false, messages: [] })
  })
})

describe("sending a request", () => {
  it("stores the question and an open answer, and queues the answer once", async () => {
    const response = await send("  Mejore la descripción  ")

    const answer = String(response.json.assistant_message_id)
    expect(response.status).toBe(202)
    expect(response.json).toEqual({ message: "El pedido quedó registrado.", assistant_message_id: answer })
    expect([response.headers.get("x-ratelimit-limit"), response.headers.get("x-ratelimit-remaining")]).toEqual(["20", "19"])
    expect(world.messages).toMatchObject([
      { syllabusId: SYLLABUS_ID, userId: TEACHER, role: "usuario", state: "completado", replyTo: null, key: KEY(1), content: { texto: "Mejore la descripción" } },
      { id: answer, syllabusId: SYLLABUS_ID, userId: TEACHER, role: "asistente", state: "pendiente", replyTo: world.messages[0].id, key: null, content: { texto: "" } },
    ])
    expect(dispatched).toEqual([answer])
    expect((await show()).json).toMatchObject({ busy: true, remaining: 19 })
  })

  it("validates the text and the request identifier", async () => {
    expect(await send("   ", "x")).toMatchObject({
      status: 422,
      json: { errors: { message: ["El campo pedido es obligatorio."], idempotency_key: ["El campo clave del pedido debe ser un UUID válido."] } },
    })
    expect((await send("x".repeat(4001))).json.errors).toEqual({ message: ["El campo pedido no debe tener más de 4000 caracteres."] })
    expect(world.messages).toEqual([])
    expect((await show()).json.remaining).toBe(20)
  })

  it("answers the same request again without a second question, job or use of the limit", async () => {
    const first = await send()
    const again = await send()

    expect(again.json).toEqual(first.json)
    expect(again.status).toBe(202)
    expect(world.messages).toHaveLength(2)
    expect(dispatched).toHaveLength(1)
    expect((await show()).json.remaining).toBe(19)
  })

  it("allows one open request per teacher and syllabus", async () => {
    await send()

    expect(await send("Otro", KEY(2))).toMatchObject({ status: 422, json: { errors: { busy: [BUSY] } } })
    expect((await send("En otro sílabo", KEY(3), { syllabus: OTHER_SYLLABUS_ID })).status).toBe(202)
    expect((await show()).json.remaining).toBe(18)
  })

  it("keeps one open request when two arrive at once", async () => {
    const outcomes = await Promise.all([send("Uno", KEY(1)), send("Dos", KEY(2))])

    expect(outcomes.map((outcome) => outcome.status).toSorted()).toEqual([202, 422])
    expect(world.messages).toHaveLength(2)
    expect(dispatched).toHaveLength(1)
    expect((await show()).json.remaining).toBe(19)
  })

  it("registers a double click with one identifier only once", async () => {
    const outcomes = await Promise.all([send(), send()])

    expect(outcomes.map((outcome) => outcome.status)).toEqual([202, 202])
    expect(outcomes[0].json).toEqual(outcomes[1].json)
    expect(world.messages).toHaveLength(2)
    expect(dispatched).toHaveLength(1)
  })

  it("gives up an answer that stayed open for more than fifteen minutes", async () => {
    const first = String((await send()).json.assistant_message_id)
    clock += 899
    expect((await send("Otro", KEY(2))).status).toBe(422)
    clock += 2
    world.clock = clock
    expect(messagesOf(await show())[1]).toMatchObject({ status: "fallido", error: OFF.replace(".", ". Puede seguir editando su sílabo.") })

    expect((await send("Otro", KEY(2))).status).toBe(202)
    expect(world.messages.find((message) => message.id === first)).toMatchObject({ state: "fallido", errorCode: "asistente_fallido" })
    expect((await show()).json.busy).toBe(true)
  })

  it("closes the answer when the queue does not take it, so the teacher can ask again", async () => {
    dispatchFails = true

    expect(await send()).toMatchObject({ status: 503, json: { message: "El asistente no está disponible por ahora. Puede seguir editando su sílabo." } })
    expect(world.messages[1]).toMatchObject({ state: "fallido", errorCode: "asistente_fallido" })

    dispatchFails = false
    expect((await send("Otro", KEY(2))).status).toBe(202)
  })
})

describe("the limit of twenty requests a day", () => {
  const syllabus = (index: number) => `51000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  const ask = (index: number) => {
    world.teachers.set(syllabus(index), [TEACHER])
    return send(`Pedido ${index}`, KEY(100 + index), { syllabus: syllabus(index) })
  }

  it("admits exactly twenty when twenty five arrive at once", async () => {
    const outcomes = await Promise.all(Array.from({ length: 25 }, (_, index) => ask(index)))

    expect(outcomes.filter((outcome) => outcome.status === 202)).toHaveLength(20)
    const refused = outcomes.filter((outcome) => outcome.status === 429)
    expect(refused).toHaveLength(5)
    expect(refused[0].json).toEqual({ message: LIMIT, errors: { limit: [LIMIT] } })
    expect(world.messages).toHaveLength(40)
    expect(dispatched).toHaveLength(20)
  })

  it("counts the day of the institution: it starts again at midnight in Guayaquil", async () => {
    clock = Date.parse("2026-11-28T04:59:00Z") / 1000
    for (let index = 0; index < 20; index++) expect((await ask(index)).status).toBe(202)

    const refused = await ask(20)
    expect(refused.status).toBe(429)
    expect([refused.headers.get("retry-after"), refused.headers.get("x-ratelimit-limit"), refused.headers.get("x-ratelimit-remaining")]).toEqual(["60", "20", "0"])
    expect((await show()).json.remaining).toBe(0)
    expect((await send("Repetido", KEY(100), { syllabus: syllabus(0) })).status).toBe(202)

    clock = Date.parse("2026-11-28T05:00:00Z") / 1000
    expect((await show()).json.remaining).toBe(20)
    expect((await ask(20)).status).toBe(202)
  })

  it("does not reset at midnight UTC", async () => {
    clock = Date.parse("2026-11-27T23:59:00Z") / 1000
    for (let index = 0; index < 20; index++) await ask(index)
    clock = Date.parse("2026-11-28T00:01:00Z") / 1000

    expect((await ask(20)).status).toBe(429)
  })

  it("names the day and the seconds left in the time zone of the application", () => {
    expect(institutionDay(Date.parse("2026-11-28T04:59:59Z") / 1000, "America/Guayaquil")).toEqual({ date: "2026-11-27", secondsLeft: 1 })
    expect(institutionDay(Date.parse("2026-11-28T05:00:00Z") / 1000, "America/Guayaquil")).toEqual({ date: "2026-11-28", secondsLeft: 86400 })
  })
})
