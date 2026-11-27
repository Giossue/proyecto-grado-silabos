// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { PhpRecord } from "../configuration/phpValues"
import { createRateLimiter, type RateLimiter } from "../http/throttle"
import { institutionDay } from "./teacherQuota"
import { updateDraftField, type DraftFieldDeps } from "../syllabus/draftField"
import { aiConfig, type AiConfig } from "./config"
import { answerTeacherAssistant } from "./teacherAnswerJob"
import {
  acceptTeacherProposal,
  discardTeacherProposal,
  sendTeacherAssistantMessage,
  showTeacherAssistant,
  type TeacherAssistantRouteDeps,
} from "./teacherAssistantRoutes"
import { CAREER_ID, fakeTeacherStore, OTHER_SYLLABUS_ID, storeWorld, SYLLABUS_ID, type StoreWorld } from "./teacherStoreTesting"
import type { TeacherAssistantStore } from "./teacherAssistantStore"
import { answerSpace, coordinationWrites, docOf, fieldByKey, line, para, teacherWrites, templatesOf, words } from "./teacherTesting"
import { call, resetCallSequence, scriptedGateway, testConfig } from "./testing"

const TEACHER = golden.userId
const OTHER_TEACHER = "d0000000-0000-4000-8000-000000000002"
const MISSING = "50000000-0000-4000-8000-000000000099"
const FORBIDDEN = { message: "No tiene permiso para hacer esto." }
const OFF = "El asistente no está disponible por ahora."
const BUSY = "Espere a que el asistente termine la respuesta anterior."
const LIMIT = "Llegó al límite de 20 pedidos de hoy al asistente. Podrá pedir otra vez mañana."
const CHANGED = "Ese texto cambió desde que se hizo la propuesta. Pida una nueva."
const UNAVAILABLE_FIELD = "Este campo ya no está disponible para el asistente."
const NOT_PENDING = "Esta propuesta ya no está pendiente."
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
const accept = async (id: string, version: unknown = world.version, options: Options = {}) =>
  reply(await acceptTeacherProposal(request("POST", `/proposals/${id}/accept`, { ...options, body: { version_bloqueo: version } }), options.syllabus ?? SYLLABUS_ID, id, deps()))
const discard = async (id: string, options: Options = {}) =>
  reply(await discardTeacherProposal(request("POST", `/proposals/${id}/discard`, { ...options, body: {} }), options.syllabus ?? SYLLABUS_ID, id, deps()))

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
  return world.proposals.slice(-destinos.length)
}

const written = () => ({ values: structuredClone([...world.values]), version: world.version, state: world.facts.state })
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

  it("returns the messages with their proposals and whether each can still be used", async () => {
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
          usable: true,
          blocked_reason: null,
        })),
      },
    ])
    expect(JSON.stringify(response.json)).not.toContain("traza")
  })

  it("marks a proposal that can no longer be used and says why", async () => {
    await answered([["descripcion", "Estudia redes."], ["objetivo_general", "Comprender las redes."]])
    teacherWrites(world, "descripcion", docOf(line("Escrito después.")))
    world.allowed.delete("objetivo_general")

    expect(messagesOf(await show())[1].proposals.map((item) => [item.usable, item.blocked_reason])).toEqual([
      [false, CHANGED],
      [false, UNAVAILABLE_FIELD],
    ])
  })
})

describe("authorization of every route", () => {
  const routes = (proposalId: string, options: Options) => [
    () => show(options),
    () => send("Pedido", KEY(50), options),
    () => accept(proposalId, world.version, options),
    () => discard(proposalId, options),
  ]

  async function expectEverywhere(status: number, json: PhpRecord | null, options: Options = {}, proposalId?: string) {
    const id = proposalId ?? world.proposals[0].id
    const before = structuredClone({ messages: world.messages, proposals: world.proposals })
    const queued = dispatched.length
    for (const route of routes(id, options)) {
      const response = await route()
      expect(response.status).toBe(status)
      if (json !== null) expect(response.json).toEqual(json)
    }
    expect({ messages: world.messages, proposals: world.proposals }).toEqual(before)
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
  ])("refuses to send, accept and discard when %s", async (_case, change) => {
    change()
    const before = structuredClone({ messages: world.messages, proposals: world.proposals })

    for (const route of [() => send("Pedido", KEY(51)), () => accept(world.proposals[0].id), () => discard(world.proposals[0].id)]) {
      expect(await route()).toMatchObject({ status: 422, json: { message: OFF, errors: { assistant: [OFF] } } })
    }
    expect({ messages: world.messages, proposals: world.proposals }).toEqual(before)
    expect(dispatched).toHaveLength(1)
    enabled = true
    config = testConfig()
    expect((await show()).json.remaining).toBe(19)
  })

  it("hides the conversation and the proposals of the earlier teacher after a reassignment", async () => {
    const proposalId = world.proposals[0].id
    world.teachers.set(SYLLABUS_ID, [OTHER_TEACHER])
    sessions.users = [makeUser({ id: OTHER_TEACHER })]
    sessions.assignments = [makeAssignment({ userId: OTHER_TEACHER, role: "docente", careerId: CAREER_ID })]
    sessions.sessions.set(golden.sessionId, { payload: sessionPayload(loggedInAttributes({ user_id: OTHER_TEACHER })), lastActivity: NOW })

    expect((await show()).json).toEqual({ available: true, limit: 20, remaining: 20, busy: false, messages: [] })
    for (const route of [() => accept(proposalId), () => discard(proposalId)]) expect((await route()).status).toBe(404)
    expect(world.proposals[0].state).toBe("pendiente")
  })

  it.each([
    ["from another syllabus of the same teacher", () => ({ syllabus: OTHER_SYLLABUS_ID, id: world.proposals[0].id })],
    ["that does not exist", () => ({ syllabus: SYLLABUS_ID, id: MISSING })],
    ["with an invalid identifier", () => ({ syllabus: SYLLABUS_ID, id: "no-es-uuid" })],
  ])("answers 404 for a proposal %s", async (_case, given) => {
    const { syllabus, id } = given()

    expect((await accept(id, world.version, { syllabus })).status).toBe(404)
    expect((await discard(id, { syllabus })).status).toBe(404)
    expect(world.proposals[0].state).toBe("pendiente")
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

describe("accepting a proposal", () => {
  async function patchDraft(fieldId: string, value: unknown) {
    const field = fieldByKey(world.template, Object.values(world.proposals).find((item) => item.fieldId === fieldId)!.target.fieldKey)
    const saved: unknown[] = []
    const draftDeps: DraftFieldDeps = {
      bridge: fakeDeps(sessions),
      templates: store.reading.templates,
      today: () => today,
      now: () => clock,
      newId: () => KEY(900),
      store: {
        syllabus: (id, userId) => store.syllabus(id, userId),
        field: async () => ({ id: field.id, templateId: world.template.id, responsible: field.responsible, content: field.content, key: field.key, live: true }),
        storedValue: async () => world.values.get(field.id) ?? null,
        identification: async () => ({ context: {}, parallelCode: null, parallelShift: null, teachers: [], formation: null, campus: null, corequisites: null }),
        transaction: (work) =>
          work({
            lockSyllabus: async (id) => ({ id, state: world.facts.state, version: world.version, subjectId: world.facts.subjectId }),
            templateStore: store.reading.templates,
            values: async () => new Map(world.values),
            valueExists: async (_syllabus, id) => world.values.has(id),
            saveValue: async (_syllabus, id, document) => {
              saved.push(document)
              world.values.set(id, document)
            },
            saveDraft: async (_syllabus, version) => void (world.version = version),
          }),
      },
    }
    const base = apiRequest(`/api/v1/teacher/syllabi/${SYLLABUS_ID}/fields/${fieldId}`, {
      method: "PATCH",
      cookie: `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`,
      headers: { "content-type": "application/json", "x-csrf-token": golden.csrfToken },
    })
    const response = await updateDraftField(new Request(base, { body: JSON.stringify({ version_bloqueo: world.version, value }) }), SYLLABUS_ID, fieldId, draftDeps)
    return { status: response.status, saved }
  }

  const spaces = async () => {
    coordinationWrites(world, "descripcion", docOf(line("Texto de Coordinación."), para(words("Enfoque: "), answerSpace()), para(words("Cierre: "), answerSpace())))
    teacherWrites(world, "descripcion", structuredClone((await templatesOf(world))[fieldByKey(world.template, "descripcion").id]))
  }
  type Spaced = { content: { content: { attrs?: PhpRecord }[] }[] }
  const writeSpace = (index: number, text: string) => {
    const value = structuredClone(world.values.get(fieldByKey(world.template, "descripcion").id)) as Spaced
    value.content[index].content[1].attrs!.value = text
    teacherWrites(world, "descripcion", value)
  }

  it("gives the value to place in the field and saves nothing", async () => {
    const [proposal] = await answered([["descripcion", "Estudia redes."]])
    const before = written()

    const response = await accept(proposal.id)

    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      message: "Propuesta colocada en el campo. Revísela: se guarda con el autoguardado.",
      field_id: proposal.fieldId,
      value: { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Estudia redes." }] }] },
      version_bloqueo: 3,
    })
    expect(written()).toEqual(before)
    expect(world.proposals[0].state).toBe("aceptada")
  })

  it.each(["borrador", "correccion_solicitada"])("returns a value that the draft save of a syllabus in %s stores unchanged", async (state) => {
    world.facts.state = state
    const [first] = await answered([["descripcion", "Primera línea\n- punto"]])

    const response = await accept(first.id)
    const saved = await patchDraft(first.fieldId, response.json.value)

    expect(saved.status).toBe(200)
    expect(saved.saved).toEqual([response.json.value])
  })

  it("returns a rewritten teacher text that the draft save stores unchanged", async () => {
    world.allowed.add("conducta_etica")
    const [proposal] = await answered([["conducta_etica", "Normas de convivencia."]], ["conducta_etica"])

    const response = await accept(proposal.id)
    const saved = await patchDraft(proposal.fieldId, response.json.value)

    expect(saved.status).toBe(200)
    expect(saved.saved).toEqual([response.json.value])
    expect(JSON.stringify(response.json.value)).toContain("Normas de convivencia.")
  })

  it("fills one space and keeps what the teacher wrote elsewhere in the field after the proposal", async () => {
    await spaces()
    const [proposal] = await answered([["descripcion#1", "Aprendizaje por proyectos"]])
    writeSpace(2, "Escrito por el docente después")

    const response = await accept(proposal.id)

    const value = response.json.value as unknown as Spaced
    expect(response.status).toBe(200)
    expect(value.content.map((node) => node.content[1]?.attrs?.value)).toEqual([undefined, "Aprendizaje por proyectos", "Escrito por el docente después"])
    expect((await patchDraft(proposal.fieldId, value)).saved).toEqual([value])
  })

  it.each([
    ["the teacher wrote in that space", () => writeSpace(1, "Mi propio enfoque")],
    ["Coordination changed the spaces", () => coordinationWrites(world, "descripcion", docOf(line("Otro texto."), para(words("Uno: "), answerSpace({ maxLength: 50 }))))],
  ])("refuses and keeps the proposal pending when %s", async (_case, change) => {
    await spaces()
    const [proposal] = await answered([["descripcion#1", "Aprendizaje por proyectos"]])
    change()
    const before = written()

    const response = await accept(proposal.id)

    expect(response).toMatchObject({ status: 422, json: { message: CHANGED, errors: { proposal: [CHANGED] } } })
    expect(written()).toEqual(before)
    expect(world.proposals[0].state).toBe("pendiente")
  })

  it.each([
    ["the permission is removed", () => void world.allowed.delete("descripcion")],
    ["Coordination closes the field", () => coordinationWrites(world, "descripcion", docOf(line("Texto cerrado.")))],
  ])("refuses when %s", async (_case, change) => {
    const [proposal] = await answered([["descripcion", "Estudia redes."]])
    change()

    expect(await accept(proposal.id)).toMatchObject({ status: 422, json: { errors: { proposal: [UNAVAILABLE_FIELD] } } })
    expect(world.proposals[0].state).toBe("pendiente")
  })

  it("applies the save rules in force when it is accepted", async () => {
    const [proposal] = await answered([["descripcion", "Estudia las redes de computadoras."]])
    world.template.definition.field_limits = { descripcion: 5 }

    expect(await accept(proposal.id)).toMatchObject({ status: 422, json: { errors: { proposal: ["Este campo admite hasta 5 caracteres."] } } })
    expect(world.proposals[0].state).toBe("pendiente")
  })

  it("asks for the draft version the client holds", async () => {
    const [proposal] = await answered([["descripcion", "Estudia redes."]])

    expect(await accept(proposal.id, 2)).toMatchObject({ status: 409, json: { code: "conflicto_version_borrador", version_bloqueo_actual: 3 } })
    expect((await accept(proposal.id, null)).json.errors).toEqual({ version_bloqueo: ["El campo versión de edición es obligatorio."] })
    expect(world.proposals[0].state).toBe("pendiente")
  })

  it("can be repeated while the field is untouched, and no longer once the proposal is saved in it", async () => {
    const [proposal] = await answered([["descripcion", "Estudia redes."]])
    const first = await accept(proposal.id)

    expect((await accept(proposal.id)).json).toEqual(first.json)

    await patchDraft(proposal.fieldId, first.json.value)
    expect(await accept(proposal.id)).toMatchObject({ status: 422, json: { errors: { proposal: [CHANGED] } } })
    expect(messagesOf(await show())[1].proposals[0]).toMatchObject({ status: "aceptada", usable: false })
  })

  describe("for a cell of a table", () => {
    type Node = { type: string; attrs?: PhpRecord; content?: Node[] }
    type Row = [string, string]
    const blank: Row = ["", ""]
    const topics: Row[] = [["Tema A", ""], ["Tema B", ""], ["Tema C", ""]]
    const span = { colspan: 1, rowspan: 1 }
    const heading = (...titles: string[]) => ({ type: "tableRow", content: titles.map((title) => ({ type: "tableHeader", attrs: span, content: [para(words(title))] })) })
    const cell = () => ({ type: "tableCell", attrs: span, content: [para(answerSpace())] })
    const repeatable = () => ({ type: "table", content: [heading("Tema", "Detalle"), { type: "tableRow", content: [cell(), cell()] }] })
    const tablesOf = (value: unknown) => (value as Node).content!.filter((node) => node.type === "table")
    const spaceOf = (row: Node, column: number) => row.content![column].content![0].content![0]
    const rowsIn = (value: unknown, table = 0) => tablesOf(value)[table].content!.slice(1).map((row) => [spaceOf(row, 0).attrs!.value, spaceOf(row, 1).attrs!.value])
    const descriptionId = () => fieldByKey(world.template, "descripcion").id
    const savedValue = () => structuredClone(world.values.get(descriptionId())) as Node

    function withRows(value: Node, rows: Row[], table = 0): Node {
      const found = tablesOf(value)[table]
      const [header, first] = found.content!
      found.content = [
        header,
        ...rows.map((texts) => {
          const row = structuredClone(first)
          texts.forEach((text, column) => (spaceOf(row, column).attrs!.value = text))
          return row
        }),
      ]
      return value
    }

    async function coordinationTable(document: PhpRecord, ...tables: Row[][]) {
      coordinationWrites(world, "descripcion", document)
      const value = structuredClone((await templatesOf(world))[descriptionId()]) as unknown as Node
      tables.forEach((rows, table) => withRows(value, rows, table))
      teacherWrites(world, "descripcion", value)
    }

    const started = (rows: Row[]) => coordinationTable(docOf(repeatable()), rows)

    async function teacherSaves(value: unknown) {
      expect((await patchDraft(descriptionId(), value)).status).toBe(200)
    }

    const listed = async (id: string) => messagesOf(await show()).flatMap((message) => message.proposals).find((item) => item.id === id)

    async function use(id: string) {
      expect(await listed(id)).toMatchObject({ usable: true, blocked_reason: null })
      const response = await accept(id)
      expect(response.status).toBe(200)
      await teacherSaves(response.json.value)
      return response.json.value
    }

    async function expectRefused(id: string) {
      const before = written()
      expect(await listed(id)).toMatchObject({ status: "pendiente", usable: false, blocked_reason: CHANGED })
      expect(await accept(id)).toMatchObject({ status: 422, json: { message: CHANGED, errors: { proposal: [CHANGED] } } })
      expect(written()).toEqual(before)
      expect(world.proposals.find((item) => item.id === id)!.state).toBe("pendiente")
    }

    async function expectRefusedWhileUnsaved(id: string) {
      expect(await listed(id)).toMatchObject({ usable: false, blocked_reason: CHANGED })
      expect(await accept(id)).toMatchObject({ status: 422, json: { errors: { proposal: [CHANGED] } } })
    }

    it("refuses the detail of a deleted row instead of giving it to the row that moved up", async () => {
      await started(topics)
      const [proposal] = await answered([["descripcion#2", "Detalle del tema A"]])

      await teacherSaves(withRows(savedValue(), topics.slice(1)))

      await expectRefused(proposal.id)
      expect(rowsIn(savedValue())).toEqual(topics.slice(1))
    })

    it.each<[string, Row[], string, Row[]]>([
      ["a row above it is deleted", topics, "descripcion#4", [topics[1], topics[2]]],
      ["its row is deleted and the rows read alike", [blank, blank, blank], "descripcion#2", [blank, blank]],
      ["a row above it is deleted and a blank one added", [["Introducción", ""], blank, blank], "descripcion#4", [blank, blank, blank]],
      ["its row is deleted and a blank one added after rows with a topic", [blank, ["Tema B", ""]], "descripcion#2", [["Tema B", ""], blank]],
      ["its row changes places", [topics[0], topics[1]], "descripcion#2", [topics[1], topics[0]]],
      ["the rows above it change places", topics, "descripcion#6", [topics[1], topics[0], topics[2]]],
      ["the other cell of its row is rewritten", [topics[0]], "descripcion#2", [["Otro tema", ""]]],
      ["the empty cell beside it is filled by hand", [blank], "descripcion#2", [["Tema escrito después", ""]]],
      ["the other cell of its row is emptied", [topics[0]], "descripcion#2", [blank]],
      ["a row above it is rewritten", topics, "descripcion#4", [["Tema A corregido", ""], topics[1], topics[2]]],
      ["a row below it is rewritten", topics, "descripcion#2", [topics[0], ["Tema B corregido", ""], topics[2]]],
      ["its row is deleted among blank ones and another is added, with a topic further down", [blank, blank, ["Tema C", ""]], "descripcion#2", [blank, ["Tema C", ""], blank]],
    ])("refuses when %s", async (_case, before, destino, after) => {
      await started(before)
      const [proposal] = await answered([[destino, "Detalle propuesto"]])

      await teacherSaves(withRows(savedValue(), after))

      await expectRefused(proposal.id)
    })

    it.each([
      ["the first cell first", [0, 1]],
      ["the second cell first", [1, 0]],
    ])("uses two proposals for one row one after the other, %s", async (_case, order) => {
      await started([blank, blank])
      const proposals = await answered([["descripcion#3", "Tema propuesto"], ["descripcion#4", "Detalle propuesto"]])

      for (const index of order) await use(proposals[index].id)

      expect(rowsIn(savedValue())).toEqual([blank, ["Tema propuesto", "Detalle propuesto"]])
    })

    it("refuses when the row an accepted proposal named is deleted and the table reads as it did at the start", async () => {
      await started([blank, blank, blank])
      const [topic, detail] = await answered([["descripcion#3", "Segundo tema"], ["descripcion#4", "Detalle del segundo"]])
      await use(topic.id)

      await teacherSaves(withRows(savedValue(), [blank, blank, blank]))

      await expectRefused(detail.id)
    })

    it("offers the rest of a row only once the proposal used before it is saved", async () => {
      await started([blank])
      const [topic, detail] = await answered([["descripcion#1", "Tema propuesto"], ["descripcion#2", "Detalle propuesto"]])

      const first = await accept(topic.id)

      await expectRefusedWhileUnsaved(detail.id)
      expect((await accept(topic.id)).json).toEqual(first.json)
      await teacherSaves(first.json.value)
      await use(detail.id)
      expect(rowsIn(savedValue())).toEqual([["Tema propuesto", "Detalle propuesto"]])
    })

    it("uses a proposal after another one, from a later answer, filled the rest of its row", async () => {
      await started([blank])
      const [detail] = await answered([["descripcion#2", "Detalle propuesto"]])
      const [topic] = await answered([["descripcion#1", "Tema propuesto"]], ["descripcion"], KEY(2))

      await use(topic.id)
      await use(detail.id)

      expect(rowsIn(savedValue())).toEqual([["Tema propuesto", "Detalle propuesto"]])
    })

    it("uses the proposals for several rows one after the other", async () => {
      await started(topics)
      const proposals = await answered([["descripcion#2", "Detalle A"], ["descripcion#4", "Detalle B"], ["descripcion#6", "Detalle C"]])

      for (const proposal of proposals) await use(proposal.id)

      expect(rowsIn(savedValue())).toEqual([["Tema A", "Detalle A"], ["Tema B", "Detalle B"], ["Tema C", "Detalle C"]])
    })

    it("does not let a proposal made for another row make up for the change", async () => {
      await started([topics[0], topics[1]])
      const [stale] = await answered([["descripcion#2", "Detalle del tema A"]])
      await teacherSaves(withRows(savedValue(), [topics[1], blank]))
      const [fresh] = await answered([["descripcion#1", "Tema B revisado"]], ["descripcion"], KEY(2))

      await use(fresh.id)

      await expectRefused(stale.id)
    })

    it("does not let an accepted proposal of one row stand in the row above after a deletion", async () => {
      await started([blank, blank, blank])
      const [first, second, detail] = await answered([["descripcion#1", "Primer tema"], ["descripcion#3", "Segundo tema"], ["descripcion#4", "Detalle del segundo"]])
      await use(first.id)
      await use(second.id)

      await teacherSaves(withRows(savedValue(), [["Segundo tema", ""], blank, blank]))

      await expectRefused(detail.id)
    })

    it("keeps a proposal usable when text outside its table changes and rows are added after its row", async () => {
      await coordinationTable(docOf(para(words("Enfoque: "), answerSpace()), repeatable(), line("Segunda parte."), repeatable()), [topics[0]], [topics[1], topics[2]])
      const [proposal] = await answered([["descripcion#5", "Detalle del tema B"]])
      const changed = withRows(savedValue(), [["Otro", "Cambiado"], blank, blank], 0)
      changed.content![0].content![1].attrs!.value = "Aprendizaje por proyectos"
      await teacherSaves(withRows(changed, [topics[1], topics[2], blank], 1))

      expect(await listed(proposal.id)).toMatchObject({ space: 9 })
      const value = await use(proposal.id)

      expect(rowsIn(value, 0)).toEqual([["Otro", "Cambiado"], blank, blank])
      expect(rowsIn(value, 1)).toEqual([["Tema B", "Detalle del tema B"], topics[2], blank])
      expect(JSON.stringify(value)).toContain("Aprendizaje por proyectos")
    })

    it("is not disturbed by the empty list a browser may add to an untouched paragraph", async () => {
      const note = { type: "tableCell", attrs: span, content: [para()] }
      await coordinationTable(docOf({ type: "table", content: [heading("Tema", "Nota", "Detalle"), { type: "tableRow", content: [cell(), note, cell()] }] }))
      const [proposal] = await answered([["descripcion#2", "Detalle propuesto"]])
      const resent = savedValue()
      tablesOf(resent)[0].content![1].content![1].content![0].content = []
      await teacherSaves(resent)

      expect(await listed(proposal.id)).toMatchObject({ usable: true })
      expect((await accept(proposal.id)).status).toBe(200)
    })
  })
})

describe("discarding a proposal", () => {
  it("removes it once, and it cannot be accepted or discarded again", async () => {
    const [proposal] = await answered([["descripcion", "Estudia redes."]])
    const before = written()

    expect(await discard(proposal.id)).toMatchObject({ status: 200, json: { message: "Propuesta descartada." } })
    expect(world.proposals[0].state).toBe("descartada")
    expect(await discard(proposal.id)).toMatchObject({ status: 422, json: { errors: { proposal: [NOT_PENDING] } } })
    expect(await accept(proposal.id)).toMatchObject({ status: 422, json: { errors: { proposal: [NOT_PENDING] } } })
    expect(written()).toEqual(before)
    expect(messagesOf(await show())[1].proposals[0]).toMatchObject({ status: "descartada", usable: false, blocked_reason: null })
  })

  it("does not discard an accepted proposal", async () => {
    const [proposal] = await answered([["descripcion", "Estudia redes."]])
    await accept(proposal.id)

    expect((await discard(proposal.id)).status).toBe(422)
    expect(world.proposals[0].state).toBe("aceptada")
  })
})
