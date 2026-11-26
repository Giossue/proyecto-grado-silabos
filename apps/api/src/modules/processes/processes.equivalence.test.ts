// @vitest-environment node
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { fakeTemplateStore, goldenTemplate, type FakeTemplateWorld } from "../../server/configuration/testing"
import type { TemplateStore } from "../../server/shared/templateStore"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { unmatchedRoute } from "../../server/http/router"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../../server/notifications/testing"
import { closeProcess, type ClosingTx } from "../../server/syllabus/processClosing"
import { createProcess, pauseProcess, processImpact, syllabusProcesses, type ProcessDeps, type ProcessRepository, type ProcessRow, type ProcessTx } from "../../server/syllabus/processes"
import { deleteProcess, extendProcessDeadline, resumeProcess, type LockedSyllabusProcess, type ProcessWriteDeps, type ProcessWriteTx } from "../../server/syllabus/processWrites"
import type { ReopenPlan, TemplateChange } from "../../server/syllabus/reopenCatchUp"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { ProcessesModule } from "./processes.module"
import { ProcessesRepository } from "./processes.repository"
import type { ProcessClosing, ProcessWrites } from "./processes.service"
import { INSTITUTION_TODAY, PROCESS_CLOSING, PROCESS_WRITES, TEMPLATE_STORE } from "./processes.tokens"
import { bothSides, equivalenceApp, type Answer, type Call } from "./testing"

const OPEN = "cd000000-0000-4000-8000-000000000001"
const PAUSED = "cd000000-0000-4000-8000-000000000002"
const CLOSED = "cd000000-0000-4000-8000-000000000003"
const MISSING = "cd000000-0000-4000-8000-00000000ffff"
const PERIOD = "e0000000-0000-4000-8000-000000000002"
const CONVOCATION = "cc000000-0000-4000-8000-000000000001"
const TEACHER = "a0000000-0000-4000-8000-0000000000aa"
const COORDINATOR = "a0000000-0000-4000-8000-0000000000cc"
const LIBRARIAN = "a0000000-0000-4000-8000-0000000000dd"
const SYLLABI = ["50000000-0000-4000-8000-000000000001", "50000000-0000-4000-8000-000000000002"]
const NO_PLAN: ReopenPlan = { period: false, subjects: [], teachers: [], parallels: [], handovers: [], counts: { to_draft: 0, restarted: 0, to_coordination: 0 } }
const COUNTS = { sin_iniciar: 3, borrador: 1, en_revision: 1, correccion_solicitada: 0, aprobado: 1 }
const CHANGE: TemplateChange = { changedAt: "2026-11-23 16:10:54.932237+00", key: "2026-11-23T16:10:54.932237Z" }
const WRITES_NOW = Date.UTC(2026, 10, 18, 12) / 1000

const row = (overrides: Partial<ProcessRow> = {}): ProcessRow => ({
  id: OPEN,
  state: "abierto",
  period: "2026-2",
  periodId: "e0000000-0000-4000-8000-000000000001",
  periodEndsOn: "2027-03-20",
  startsOn: "2026-11-10",
  dueOn: "2026-12-10",
  convocationsCount: 2,
  extensions: 0,
  ...overrides,
})

type State = {
  world: FakeWorld
  templates: FakeTemplateWorld
  rows: ProcessRow[]
  lockedState: string | null
  vanished: boolean
  inProgress: { id: string; period: string | null } | null
  periodsWithProcess: Set<string>
  periodEnds: Map<string, string>
  activeCareers: number
  withoutCoordinator: number
  problem: string | null
  templateChange: TemplateChange | null
  otherInProgress: boolean
  plan: ReopenPlan
  openSyllabi: { id: string; context: unknown }[]
  today: string
  notices: NotificationWorld
  log: string[]
  limiter: RateLimiter
  bridge: BridgeDeps
}

let scenario: (state: State) => void = () => undefined
let state: State

function freshWorld(role = "administrador"): FakeWorld {
  return {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role, careerId: role === "administrador" ? null : "c-1" })],
  }
}

function freshState(): State {
  const world = freshWorld()
  const base: State = {
    world,
    templates: { template: goldenTemplate(), values: [] },
    rows: [row(), row({ id: PAUSED, state: "pausado", period: "2026-1b" }), row({ id: CLOSED, state: "cerrado", period: "2026-1", startsOn: "2026-04-01", dueOn: "2026-05-01", periodEndsOn: "2026-08-30", extensions: 1, convocationsCount: 0 })],
    lockedState: null,
    vanished: false,
    inProgress: null,
    periodsWithProcess: new Set(),
    periodEnds: new Map([[PERIOD, "2027-03-12"]]),
    activeCareers: 2,
    withoutCoordinator: 0,
    problem: null,
    templateChange: null,
    otherInProgress: false,
    plan: NO_PLAN,
    openSyllabi: [{ id: SYLLABI[0], context: { asignatura: "Cálculo" } }],
    today: "2026-11-23",
    notices: notificationWorld({ users: [recipient(TEACHER), recipient(COORDINATOR), recipient(LIBRARIAN)] }),
    log: [],
    limiter: createRateLimiter(),
    bridge: fakeDeps(world),
  }
  scenario(base)
  base.bridge = fakeDeps(base.world)
  return base
}

function lockedFor(id: string): LockedSyllabusProcess | null {
  const found = state.rows.find((item) => item.id === id)
  if (!found || state.vanished) return null
  return { id, state: state.lockedState ?? found.state, periodId: found.periodId, period: found.period, dueAt: Date.UTC(2026, 11, 11, 4, 59, 59) / 1000, extensions: found.extensions, periodEndsOn: found.periodEndsOn, finalized: found.state === "cerrado" }
}

const record = (entry: string) => void state.log.push(entry)

async function inTransaction<T>(work: () => Promise<T>): Promise<T> {
  record("begin")
  try {
    const result = await work()
    record("commit")
    return result
  } catch (error) {
    record("rollback")
    throw error
  }
}

const processTx: ProcessTx = {
  lockProcess: async (id) => {
    record(`lock:process:${id}`)
    if (state.vanished) return null
    return state.lockedState ?? state.rows.find((item) => item.id === id)?.state ?? null
  },
  pause: async (id) => record(`pause:${id}`),
  lockInProgress: async () => {
    record("lock:in-progress")
    return state.inProgress
  },
  periodHasProcess: async (periodId) => state.periodsWithProcess.has(periodId),
  createProcess: async (periodId, startsAt, dueAt) => {
    record(`create:${periodId}:${startsAt}:${dueAt}`)
    return "cd000000-0000-4000-8000-000000000009"
  },
}

const repository: ProcessRepository = {
  list: async () => state.rows,
  templateHasFields: async () => true,
  periods: async () => [{ id: PERIOD, codigo: "2027-1" }],
  find: async (id) => {
    record(`find:${id}`)
    return state.rows.find((item) => item.id === id.toLowerCase()) ?? null
  },
  counts: async () => [
    { state: "borrador", total: 3 },
    { state: "sin_iniciar", total: 5 },
  ],
  periodEndsOn: async (id) => state.periodEnds.get(id) ?? null,
  activeCareerCount: async () => state.activeCareers,
  activeCareersWithoutCoordinator: async () => state.withoutCoordinator,
  transaction: (work) => inTransaction(() => work(processTx)),
}

function writeTx(notifications: ProcessWriteTx["notifications"]): ProcessWriteTx {
  return {
    notifications,
    lockProcess: async (id) => {
      record(`lock:process:${id}`)
      return lockedFor(id)
    },
    lockConvocations: async () => {
      record("lock:convocations")
      return [CONVOCATION]
    },
    lockSyllabi: async () => {
      record("lock:syllabi")
      return SYLLABI
    },
    teachersForProcess: async () => [TEACHER, golden.userId],
    coordinatorsForProcess: async () => [COORDINATOR, TEACHER],
    librarians: async () => [LIBRARIAN],
    teacherSyllabusCounts: async () => new Map([[TEACHER, 2]]),
    purge: async (ids) => record(`purge:${ids.join(",")}`),
    deleteProcess: async (id, convocations) => record(`delete:${id}:${convocations.join(",")}`),
    templateProblem: async () => state.problem,
    lockOtherProcesses: async () => record("lock:others"),
    anotherInProgress: async () => state.otherInProgress,
    templateChange: async (_id, reference) => {
      record(`template-change:${reference}`)
      return state.templateChange
    },
    syllabusCounts: async (_id, toReopen) => {
      record(`counts:${toReopen ? "reopen" : "open"}`)
      return COUNTS
    },
    adaptToTemplate: async (id, change) => record(`adapt:${id}:${change.key}`),
    convocationsToReopen: async () => {
      record("lock:closed-convocations")
      return [CONVOCATION]
    },
    reopenPlan: async (ids, id, finalized) => {
      record(`plan:${ids.join(",")}:${id}:${finalized}`)
      return state.plan
    },
    reopen: async (id) => {
      record(`reopen:${id}`)
      return [CONVOCATION]
    },
    applyPlan: async (_plan, ids, periodId) => record(`apply:${ids.join(",")}:${periodId}`),
    generateReopened: async (ids) => record(`generate:${ids.join(",")}`),
    openConvocations: async () => [{ id: CONVOCATION, careerLabel: "Software" }],
    updateState: async (id, value) => record(`state:${id}:${value}`),
    extendDeadline: async (id, dueAt, extension) => record(`deadline:${id}:${dueAt}:${extension}`),
    teachersWithPendingWork: async () => [TEACHER],
  }
}

const writes: ProcessWrites = {
  find: (id) => repository.find(id),
  now: () => WRITES_NOW,
  nowMs: () => WRITES_NOW * 1000 + 7,
  transaction: (work) => inTransaction(() => fakeNotificationTransaction(state.notices, WRITES_NOW, (notifications) => work(writeTx(notifications)))),
}

const closingTx: ClosingTx = {
  lockProcess: (id) => processTx.lockProcess(id),
  closeProcess: async (id, keepPausedAt) => record(`close:${id}:${keepPausedAt}`),
  lockOpenSyllabi: async (id) => {
    record(`lock:syllabi:${id}`)
    return state.openSyllabi
  },
  snapshot: async (id) => ({ silabo: id, version: 1 }),
  storeClosedDocument: async (id, document) => record(`closed:${id}:${JSON.stringify(document)}`),
  closeConvocations: async (id) => record(`convocations:${id}`),
}

const closing: ProcessClosing = { transaction: (work) => inTransaction(() => work(closingTx)) }

const currentTemplates = () => fakeTemplateStore(state.templates)
const templates: TemplateStore = {
  template: () => currentTemplates().template(),
  subjectValues: (id) => currentTemplates().subjectValues(id),
  valuesForSubjects: (subjects, fields) => currentTemplates().valuesForSubjects(subjects, fields),
  liveFields: (ids, careerOnly) => currentTemplates().liveFields(ids, careerOnly),
}

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

const limiter: RateLimiter = {
  attempt: (key, max, decay, now) => state.limiter.attempt(key, max, decay, now),
  attempts: (key, now) => state.limiter.attempts(key, now),
}

function processDeps(): ProcessDeps {
  return { bridge: state.bridge, processes: repository, templates, today: () => state.today, now: () => NOW }
}

function writeDeps(): ProcessWriteDeps {
  return { bridge: state.bridge, ...writes }
}

const BASE = "/api/v1/admin/processes"

async function legacy(web: Request): Promise<Response> {
  const { pathname } = new URL(web.url)
  const method = web.method
  const parts = pathname === BASE ? [] : pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length + 1).split("/") : null
  if (parts === null) return unmatchedRoute(web)
  const id = parts[0] === undefined ? "" : decodeURIComponent(parts[0])
  if (parts.length === 0 && method === "GET") return syllabusProcesses(web, processDeps())
  if (parts.length === 0 && method === "POST") return createProcess(web, processDeps())
  if (parts.length === 1 && method === "DELETE") return deleteProcess(web, id, writeDeps())
  if (parts.length === 2 && parts[1] === "impact") return method === "GET" ? processImpact(web, id, processDeps()) : unmatchedRoute(web)
  if (parts.length === 2 && parts[1] === "deadline") return method === "POST" ? extendProcessDeadline(web, id, writeDeps()) : unmatchedRoute(web)
  if (parts.length === 2 && method === "POST") {
    const transition = decodeURIComponent(parts[1])
    if (transition === "pausar") return pauseProcess(web, id, processDeps())
    if (transition === "reanudar") return resumeProcess(web, id, writeDeps())
    if (transition === "cerrar") return closeProcess(web, id, { bridge: state.bridge, processes: repository, now: () => NOW, ...closing })
  }
  return unmatchedRoute(web)
}

let app: NestExpressApplication

const effects = () => ({ log: state.log, notifications: state.notices.notifications, mails: state.notices.mails.length, sessions: [...state.world.sessions.values()].map((item) => item.payload) })

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await bothSides({ reset: () => void (state = freshState()), legacy, effects, app: () => app }, calls)
  expect(after).toEqual(before)
  return after
}

beforeAll(async () => {
  app = await equivalenceApp(ProcessesModule, [
    [AUTH_BRIDGE, bridge],
    [RATE_LIMITER, limiter],
    [ProcessesRepository, repository],
    [TEMPLATE_STORE, templates],
    [INSTITUTION_TODAY, () => state.today],
    [PROCESS_WRITES, writes],
    [PROCESS_CLOSING, closing],
  ])
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  scenario = () => undefined
})

const statuses = (answers: Answer[]) => answers.map((answer) => answer.status)

describe("institutional processes served by Nest answer exactly like the route handlers they replace", () => {
  it("lists the processes with the same JSON", async () => {
    const [answer] = await expectSame({ method: "GET", path: BASE })
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.body).processes).toHaveLength(3)
  })

  it("answers a guest, an unverified user, a user without role and a non administrator the same way", async () => {
    const answers = [...(await expectSame({ method: "GET", path: BASE, cookie: false }, { method: "POST", path: `${BASE}/${OPEN}/pausar`, body: {}, cookie: false }))]
    scenario = (current) => void (current.world.users = [makeUser({ emailVerifiedAt: null })])
    answers.push(...(await expectSame({ method: "GET", path: BASE }, { method: "DELETE", path: `${BASE}/${OPEN}`, body: { mensaje: "x" } })))
    scenario = (current) => void (current.world.assignments = [])
    answers.push(...(await expectSame({ method: "GET", path: BASE }, { method: "POST", path: `${BASE}/${OPEN}/cerrar`, body: {} })))
    scenario = (current) => void (current.world = freshWorld("coordinador"))
    answers.push(...(await expectSame({ method: "GET", path: BASE }, { method: "POST", path: BASE, body: {} }, { method: "GET", path: `${BASE}/${OPEN}/impact` }, { method: "POST", path: `${BASE}/${OPEN}/deadline`, body: { due_at: "2026-12-20" } })))
    expect(statuses(answers)).toEqual([401, 401, 403, 403, 409, 409, 403, 403, 403, 403])
  })

  it("opens a process with the same normalized dates and transaction", async () => {
    const [answer] = await expectSame({ method: "POST", path: BASE, body: { period_id: PERIOD, starts_at: "2026-11-24", due_at: "2026-12-20" } })
    expect(answer.status).toBe(201)
    expect(answer.effects).toMatchObject({ log: ["begin", "lock:in-progress", expect.stringMatching(/^create:/), "commit"] })
  })

  it.each([
    ["no fields", {}],
    ["a malformed period and dates", { period_id: "x", starts_at: "mañana", due_at: [] }],
    ["an unknown period", { period_id: "e0000000-0000-4000-8000-00000000ffff", starts_at: "2026-11-24", due_at: "2026-12-20" }],
    ["dates in the past and reversed", { period_id: PERIOD, starts_at: "2026-11-01", due_at: "2026-10-01" }],
    ["dates past the period", { period_id: PERIOD, starts_at: "2027-04-01", due_at: "2027-05-01" }],
  ])("rejects a process with %s the same way", async (_, body) => {
    const [answer] = await expectSame({ method: "POST", path: BASE, body })
    expect(answer.status).toBe(422)
  })

  it("rejects a new process while another is in progress, for a period that has one, or with an unready institution the same way", async () => {
    const body = { period_id: PERIOD, starts_at: "2026-11-24", due_at: "2026-12-20" }
    scenario = (current) => void (current.inProgress = { id: OPEN, period: "2026-2" })
    const answers = [...(await expectSame({ method: "POST", path: BASE, body }))]
    scenario = (current) => void (current.periodsWithProcess = new Set([PERIOD]))
    answers.push(...(await expectSame({ method: "POST", path: BASE, body })))
    scenario = (current) => void (current.withoutCoordinator = 2)
    answers.push(...(await expectSame({ method: "POST", path: BASE, body })))
    scenario = (current) => void (current.templates = { template: null, values: [] })
    answers.push(...(await expectSame({ method: "POST", path: BASE, body })))
    expect(statuses(answers)).toEqual([422, 422, 422, 422])
  })

  it("shows the impact view and answers unknown, malformed and upper-case ids the same way", async () => {
    const answers = await expectSame(
      { method: "GET", path: `${BASE}/${OPEN}/impact` },
      { method: "GET", path: `${BASE}/${OPEN.toUpperCase()}/impact` },
      { method: "GET", path: `${BASE}/${MISSING}/impact` },
      { method: "GET", path: `${BASE}/no-es-uuid/impact` },
    )
    expect(statuses(answers)).toEqual([200, 200, 404, 404])
    expect(JSON.parse(answers[0].body)).toEqual({ syllabi: { sin_iniciar: 5, borrador: 3, en_revision: 0, correccion_solicitada: 0, aprobado: 0 }, total: 8 })
  })

  it("pauses an open process with the same lock and update", async () => {
    const [answer] = await expectSame({ method: "POST", path: `${BASE}/${OPEN}/pausar`, body: {} })
    expect(answer.status).toBe(200)
    expect(answer.effects).toMatchObject({ log: [`find:${OPEN}`, "begin", `lock:process:${OPEN}`, `pause:${OPEN}`, "commit"] })
  })

  it("rejects invalid pause, resume and close transitions with the same 403, 404 and 422", async () => {
    const answers = await expectSame(
      { method: "POST", path: `${BASE}/${PAUSED}/pausar`, body: {} },
      { method: "POST", path: `${BASE}/${CLOSED}/pausar`, body: { confirmar_rehacer: "quizás" } },
      { method: "POST", path: `${BASE}/${OPEN}/pausar`, body: { confirmar_rehacer: "quizás" } },
      { method: "POST", path: `${BASE}/${OPEN}/reanudar`, body: {} },
      { method: "POST", path: `${BASE}/${CLOSED}/cerrar`, body: {} },
      { method: "POST", path: `${BASE}/${MISSING}/cerrar`, body: {} },
      { method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: { confirmar_rehacer: [] } },
    )
    expect(statuses(answers)).toEqual([403, 403, 422, 403, 403, 404, 422])
  })

  it("answers a state that changed under the lock with the same 422 or 404 and rolls back", async () => {
    scenario = (current) => void (current.lockedState = "cerrado")
    const answers = [...(await expectSame({ method: "POST", path: `${BASE}/${OPEN}/pausar`, body: {} }, { method: "POST", path: `${BASE}/${OPEN}/cerrar`, body: {} }, { method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: {} }))]
    scenario = (current) => void (current.vanished = true)
    answers.push(
      ...(await expectSame(
        { method: "POST", path: `${BASE}/${OPEN}/pausar`, body: {} },
        { method: "POST", path: `${BASE}/${OPEN}/cerrar`, body: {} },
        { method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: {} },
        { method: "DELETE", path: `${BASE}/${OPEN}`, body: { mensaje: "x" } },
        { method: "POST", path: `${BASE}/${OPEN}/deadline`, body: { due_at: "2026-12-20" } },
      )),
    )
    expect(statuses(answers)).toEqual([422, 422, 422, 404, 404, 404, 404, 404])
  })

  it("resumes a paused process with the same notifications and asks to confirm a changed template the same way", async () => {
    const answers = [...(await expectSame({ method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: {} }))]
    scenario = (current) => void (current.templateChange = CHANGE)
    answers.push(...(await expectSame({ method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: {} }, { method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: { confirmar_rehacer: true } })))
    scenario = (current) => void (current.problem = "La plantilla no tiene las áreas obligatorias: x.")
    answers.push(...(await expectSame({ method: "POST", path: `${BASE}/${PAUSED}/reanudar`, body: {} })))
    expect(statuses(answers)).toEqual([200, 422, 200, 422])
    expect(JSON.parse(answers[1].body)).toMatchObject({ code: "plantilla_cambiada", counts: COUNTS })
  })

  it("closes an open and a paused process storing the same closed documents", async () => {
    const answers = await expectSame({ method: "POST", path: `${BASE}/${OPEN}/cerrar`, body: {} }, { method: "POST", path: `${BASE}/${PAUSED}/cerrar`, body: { confirmar_rehacer: false } })
    expect(statuses(answers)).toEqual([200, 200])
  })

  it("deletes a process with the same purge order and notices, and rejects a closed or unconfirmed one the same way", async () => {
    const answers = await expectSame(
      { method: "DELETE", path: `${BASE}/${OPEN}`, body: { mensaje: "  Se repite el periodo académico.  " } },
      { method: "DELETE", path: `${BASE}/${PAUSED}`, body: {} },
      { method: "DELETE", path: `${BASE}/${PAUSED}`, body: { mensaje: "x".repeat(1001) } },
      { method: "DELETE", path: `${BASE}/${CLOSED}`, body: { mensaje: "x" } },
      { method: "DELETE", path: `${BASE}/${MISSING}`, body: { mensaje: "x" } },
    )
    expect(statuses(answers)).toEqual([200, 422, 422, 403, 404])
    scenario = (current) => void (current.lockedState = "cerrado")
    const [raced] = await expectSame({ method: "DELETE", path: `${BASE}/${OPEN}`, body: { mensaje: "x" } })
    expect(raced.status).toBe(422)
  })

  it("extends a deadline and reopens a closed process with the same confirmations", async () => {
    const answers = [
      ...(await expectSame(
        { method: "POST", path: `${BASE}/${OPEN}/deadline`, body: { due_at: "2026-12-20" } },
        { method: "POST", path: `${BASE}/${OPEN}/deadline`, body: { due_at: "2026-11-17" } },
        { method: "POST", path: `${BASE}/${OPEN}/deadline`, body: { due_at: "2026-12-20", stage: "inicio" } },
        { method: "POST", path: `${BASE}/${OPEN}/deadline`, body: {} },
      )),
    ]
    scenario = (current) => {
      current.templateChange = CHANGE
      current.plan = { ...NO_PLAN, counts: { to_draft: 2, restarted: 0, to_coordination: 1 } }
      current.rows = current.rows.map((item) => (item.id === CLOSED ? { ...item, periodEndsOn: "2027-03-20", extensions: 0 } : item))
    }
    answers.push(
      ...(await expectSame(
        { method: "POST", path: `${BASE}/${CLOSED}/deadline`, body: { due_at: "2026-12-20" } },
        { method: "POST", path: `${BASE}/${CLOSED}/deadline`, body: { due_at: "2026-12-20", confirmar_rehacer: true } },
        { method: "POST", path: `${BASE}/${CLOSED}/deadline`, body: { due_at: "2026-12-20", confirmar_rehacer: true, confirmar_cambios: true } },
      )),
    )
    expect(statuses(answers)).toEqual([200, 422, 422, 422, 422, 422, 200])
    expect(JSON.parse(answers[4].body)).toMatchObject({ code: "plantilla_cambiada" })
    expect(JSON.parse(answers[5].body)).toMatchObject({ code: "cambios_pendientes" })
  })

  it.each([
    ["PUT", BASE],
    ["PATCH", BASE],
    ["DELETE", BASE],
    ["OPTIONS", BASE],
    ["GET", `${BASE}/${OPEN}`],
    ["POST", `${BASE}/${OPEN}`],
    ["POST", `${BASE}/${OPEN}/impact`],
    ["GET", `${BASE}/${OPEN}/deadline`],
    ["GET", `${BASE}/${OPEN}/pausar`],
    ["POST", `${BASE}/${OPEN}/archivar`],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
  })
})
