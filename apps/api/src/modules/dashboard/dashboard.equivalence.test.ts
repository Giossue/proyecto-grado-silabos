// @vitest-environment node
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { fakeTemplateStore, goldenTemplate } from "../../server/configuration/testing"
import type { SyllabusTemplate } from "../../server/configuration/templatePresentation"
import type { TemplateStore } from "../../server/shared/templateStore"
import { dashboardDeadline, dashboardIndex, type ConvocationRecord, type DashboardRepository, type ProcessRecord, type TeacherSyllabus } from "../../server/dashboard/dashboard"
import type { CareerReadinessFacts, SetupRepository } from "../../server/dashboard/setupChecklist"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { unmatchedRoute } from "../../server/http/router"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { bothSides, equivalenceApp, type Answer, type Call } from "../processes/testing"
import { DashboardModule } from "./dashboard.module"
import { PrismaDashboardRepository } from "./dashboard.repository"
import { DASHBOARD_TEMPLATES, DASHBOARD_TODAY } from "./dashboard.tokens"
import { PrismaSetupRepository } from "./setup.repository"

const PROCESS = "10000000-0000-4000-8000-000000000001"
const CONVOCATION = "20000000-0000-4000-8000-000000000001"
const SUBJECTS = ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002"]
const FACULTY = "40000000-0000-4000-8000-000000000001"

const process = (overrides: Partial<ProcessRecord> = {}): ProcessRecord => ({
  id: PROCESS,
  state: "abierto",
  period: "2026-2",
  startsOn: "2026-11-01",
  dueOn: "2026-11-30",
  periodEndsOn: "2027-03-15",
  ...overrides,
})

type State = {
  world: FakeWorld
  inProgress: ProcessRecord | null
  latest: ProcessRecord | null
  convocation: ConvocationRecord | null
  teacherSyllabi: TeacherSyllabus[]
  finalized: ConvocationRecord | null
  template: SyllabusTemplate | null
  readiness: CareerReadinessFacts | null
  roles: string[]
  withoutCoordinator: number
  today: string
  calls: string[]
  limiter: RateLimiter
  bridge: BridgeDeps
}

let scenario: (state: State) => void = () => undefined
let state: State

function officialTemplate(): SyllabusTemplate {
  const template = goldenTemplate()
  return { ...template, sections: template.sections.filter((section) => section.key !== "sinteticos") }
}

function worldAs(role: string, careerId: string | null = "c-1"): FakeWorld {
  return {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role, careerId })],
  }
}

function freshState(): State {
  const world = worldAs("docente")
  const base: State = {
    world,
    inProgress: process(),
    latest: process(),
    convocation: null,
    teacherSyllabi: [],
    finalized: null,
    template: officialTemplate(),
    readiness: { subjectsCount: 2, faculty: { id: FACULTY, logo: null }, scheduledSubjectIds: SUBJECTS, scheduledWithParallels: 2, parallelTotal: 2, parallelsWithTeacher: 1 },
    roles: ["coordinador", "bibliotecario"],
    withoutCoordinator: 0,
    today: "2026-11-23",
    calls: [],
    limiter: createRateLimiter(),
    bridge: fakeDeps(world),
  }
  scenario(base)
  base.bridge = fakeDeps(base.world)
  return base
}

const note = (entry: string) => void state.calls.push(entry)

const dashboard: DashboardRepository = {
  inProgressProcess: async () => (note("inProgress"), state.inProgress),
  latestProcess: async () => (note("latest"), state.latest),
  convocation: async (careerId, processId) => (note(`convocation:${careerId}:${processId}`), state.convocation),
  teacherOpenSyllabi: async (userId, careerId) => (note(`teacher:${userId}:${careerId}`), state.teacherSyllabi),
  finalizedTeacherConvocation: async (userId, processId, careerId) => (note(`finalized:${userId}:${processId}:${careerId}`), state.finalized),
  libraryCounts: async () => ({ pendiente: 3, firmado: 0, devuelto: 2, reemplazado: 1 }),
}

const setup: SetupRepository = {
  activeFacultyExists: async () => true,
  activeCareerCount: async () => 2,
  activeCareersWithoutCoordinator: async () => state.withoutCoordinator,
  activeUserWithRole: async (role) => state.roles.includes(role),
  processExists: async () => true,
  templateHasFields: async () => true,
  processSyllabusCounts: async (id) => (note(`counts:${id}`), { total: 13, approved: 1, notStarted: 11 }),
  careersWithoutConvocation: async () => 0,
  careerReadiness: async (careerId) => (note(`readiness:${careerId}`), state.readiness),
  careerHasActiveTeacher: async () => true,
}

const currentTemplates = () => fakeTemplateStore({ template: state.template, values: [] })
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

async function legacy(web: Request): Promise<Response> {
  const { pathname } = new URL(web.url)
  const deps = { bridge: state.bridge, dashboard, setup, templates, today: () => state.today }
  if (pathname === "/api/v1/dashboard" && web.method === "GET") return dashboardIndex(web, deps)
  if (pathname === "/api/v1/dashboard/deadline" && web.method === "GET") return dashboardDeadline(web, deps)
  return unmatchedRoute(web)
}

const effects = () => ({ calls: state.calls, sessions: [...state.world.sessions.values()].map((item) => item.payload) })

let app: NestExpressApplication

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await bothSides({ reset: () => void (state = freshState()), legacy, effects, app: () => app }, calls)
  expect(after).toEqual(before)
  return after
}

beforeAll(async () => {
  app = await equivalenceApp(DashboardModule, [
    [AUTH_BRIDGE, bridge],
    [RATE_LIMITER, limiter],
    [PrismaDashboardRepository, dashboard],
    [PrismaSetupRepository, setup],
    [DASHBOARD_TEMPLATES, templates],
    [DASHBOARD_TODAY, () => state.today],
  ])
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  scenario = () => undefined
})

const both = [
  { method: "GET", path: "/api/v1/dashboard" },
  { method: "GET", path: "/api/v1/dashboard/deadline" },
]

describe("the dashboard served by Nest answers exactly like the route handlers it replaces", () => {
  it.each([
    ["a teacher with an open syllabus", (current: State) => void (current.teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "abierta" }, process: process(), dueAt: 1_800_000_000 }])],
    ["a teacher after a finalized process", (current: State) => {
      current.inProgress = null
      current.latest = process({ state: "cerrado" })
      current.finalized = { id: CONVOCATION, state: "cerrada" }
    }],
    ["a teacher during a pause", (current: State) => void (current.inProgress = process({ state: "pausado" }))],
    ["a coordinator", (current: State) => {
      current.world = worldAs("coordinador")
      current.convocation = { id: CONVOCATION, state: "preparacion" }
    }],
    ["a coordinator without a career project", (current: State) => {
      current.world = worldAs("coordinador")
      current.readiness = null
    }],
    ["an administrator", (current: State) => void (current.world = worldAs("administrador", null))],
    ["an administrator without a process", (current: State) => {
      current.world = worldAs("administrador", null)
      current.inProgress = null
      current.latest = null
      current.withoutCoordinator = 1
      current.template = null
    }],
    ["a librarian", (current: State) => void (current.world = worldAs("bibliotecario", null))],
  ])("answers %s the same way", async (_, setUp) => {
    scenario = setUp
    const answers = await expectSame(...both)
    expect(answers.every((answer) => answer.status === 200 || answer.status === 404)).toBe(true)
  })

  it("answers a guest, an unverified user and a user without role the same way", async () => {
    const answers = [...(await expectSame(...both.map((call) => ({ ...call, cookie: false }))))]
    scenario = (current) => void (current.world.users = [makeUser({ emailVerifiedAt: null })])
    answers.push(...(await expectSame(...both)))
    scenario = (current) => void (current.world.assignments = [])
    answers.push(...(await expectSame(...both)))
    expect(answers.map((answer) => answer.status)).toEqual([401, 401, 403, 403, 409, 409])
  })

  it.each([
    ["POST", "/api/v1/dashboard"],
    ["DELETE", "/api/v1/dashboard"],
    ["PUT", "/api/v1/dashboard/deadline"],
    ["OPTIONS", "/api/v1/dashboard/deadline"],
    ["GET", "/api/v1/dashboard/otra"],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
  })
})
