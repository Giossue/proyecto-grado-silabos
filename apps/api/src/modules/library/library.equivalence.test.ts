// @vitest-environment node
import "reflect-metadata"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { LIBRARY_SORTS } from "@silabos/shared/schemas/listSort"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { goldenTemplate } from "../../server/configuration/testing"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { unmatchedRoute } from "../../server/http/router"
import { commentLibraryReview, verifyLibraryReview, type LibraryDecisionDeps } from "../../server/library/reviewDecisions"
import { libraryHistory, libraryReviews, type LibraryReviewRepository, type ReviewRow, type SyllabusSummary } from "../../server/library/reviews"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../../server/notifications/testing"
import { SignatureRejected } from "../../server/signatures/cmsVerifier"
import type { SignatureRow } from "../../server/signatures/signDecision"
import { libraryReviewDetail, type HistoryEntry, type LibrarySubmissionRow, type ReviewDetailStore, type ReviewRevision } from "../../server/syllabus/reviewDetails"
import type { DetailSyllabus } from "../../server/syllabus/syllabusDetail"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { LegacyModule } from "../legacy/legacy.module"
import { LibraryReviewsRepository } from "./library-reviews.repository"
import { LibraryModule } from "./library.module"
import { LIBRARY_DECISIONS, LIBRARY_DETAIL_STORE, LIBRARY_LOGO_STORE } from "./library.tokens"

const SESSION_ID = golden.sessionId
const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FACULTY = "f0000000-0000-4000-8000-000000000001"
const MISSING_FACULTY = "f0000000-0000-4000-8000-000000000009"
const PERIOD = "e0000000-0000-4000-8000-000000000001"
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "01a2094b-56da-719b-a847-c1c9a1aa0584"
const REVISION = "70000000-0000-4000-8000-000000000001"
const MISSING_REVISION = "70000000-0000-4000-8000-000000000099"
const SUBMISSION = "e1000000-0000-4000-8000-000000000001"
const COORDINATOR = "c1000000-0000-4000-8000-000000000001"
const TEACHER = "a1000000-0000-4000-8000-000000000001"
const OTHER_LIBRARIAN = "b1000000-0000-4000-8000-000000000001"
const FINGERPRINT = "cd".repeat(32)
const STATEMENT = `silabos-ueb|silabo:${SYLLABUS}|accion:aprobacion_biblioteca|huella:${FINGERPRINT}`
const PAUSED = "La convocatoria de la carrera está en pausa: las revisiones se retoman cuando se reanude."
const HEADERS = ["content-type", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy", "cross-origin-resource-policy"]

const template = goldenTemplate()
const field = template.sections[0].blocks[0].fields[0]
const SNAPSHOT = {
  identification: { subject: "Biología" },
  template_definition: { ...template.definition, library_sections: ["bibliografia"] },
  template_variables: { nombre_asignatura: "Biología" },
  sections: [
    { key: "datos", title: "Datos", fields: [{ definition_id: field.id, key: field.key, label: field.label, quien_llena: "carrera", document: { type: "doc", content: [{ type: "paragraph" }] } }] },
    { key: "bibliografia", title: "Bibliografía", orientation: "landscape", fields: [] },
  ],
}

type Decision = {
  lockedBlock: string | null
  locked: { id: string; state: string; version: number; convocationId: string; parallelId: string } | null
  submission: { id: string; verified: boolean } | null
  latest: string | null
  stage: string | null
  lockedRevision: { id: string; number: number; correctionRequested: boolean } | null
}

type State = {
  world: FakeWorld
  rows: ReviewRow[]
  summaries: Map<string, SyllabusSummary>
  revisions: ReviewRevision[]
  syllabus: DetailSyllabus | null
  history: HistoryEntry[]
  submission: LibrarySubmissionRow | null
  decision: Decision
  notices: NotificationWorld
  stored: SignatureRow[]
  writes: string[]
  limiter: RateLimiter
  bridge: BridgeDeps
}

type Call = { method: string; path: string; body?: unknown; raw?: string; cookie?: boolean; headers?: Record<string, string> }

type Answer = { status: number; body: string; headers: Record<string, string | null>; writes: string[]; sessions: string[] }

const row = (overrides: Partial<ReviewRow> = {}): ReviewRow => ({
  revisionId: REVISION,
  syllabusId: SYLLABUS,
  revisionNumber: 2,
  sentAt: "2026-11-20T14:00:00+00:00",
  sentBy: "Docente Uno",
  signedBy: null,
  responsibleId: OTHER_LIBRARIAN,
  state: "pendiente",
  outcome: "pendiente",
  ...overrides,
})

function librarian(): FakeWorld {
  return {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "bibliotecario", careerId: null, careerLabel: null })],
  }
}

function detailSyllabus(overrides: Partial<DetailSyllabus> = {}): DetailSyllabus {
  return {
    id: SYLLABUS,
    state: "en_revision",
    careerId: CAREER,
    convocationState: "abierta",
    processState: "abierto",
    dueOn: "2026-12-01",
    currentTeacher: false,
    writtenByUser: false,
    hasLibrarySubmission: true,
    subjectId: "a0000000-0000-4000-8000-000000000001",
    convocationId: "b0000000-0000-4000-8000-000000000001",
    subject: "Biología",
    code: "C2",
    parallel: "A",
    career: "Software",
    period: "2026-2",
    startedAt: null,
    savedAt: null,
    version: 8,
    context: {},
    ...overrides,
  }
}

let scenario: (state: State) => void = () => {}
let state: State

function freshState(): State {
  const world = librarian()
  const base: State = {
    world,
    rows: [row(), row({ revisionId: "70000000-0000-4000-8000-000000000002", syllabusId: "50000000-0000-4000-8000-000000000002", state: "atendido", outcome: "firmado", signedBy: "Bibliotecaria Ñ", responsibleId: golden.userId })],
    summaries: new Map([[SYLLABUS, { subject: "Biología", code: "C2", faculty: "Ciencias", career: "Software · SW-1", period: "2026-2", parallel: "A", teachers: ["Ana Pérez", "Luis Díaz"] }]]),
    revisions: [{ id: REVISION, syllabusId: SYLLABUS, number: 2, submittedAt: NOW - 100, submittedBy: "Ana Pérez", fingerprint: FINGERPRINT }],
    syllabus: detailSyllabus(),
    history: [{ id: REVISION, number: 2, submittedAt: "2026-11-18T11:06:40+00:00", submittedBy: "Ana Pérez", coordination: null, approval: null, library: { verifiedAt: null, verifier: null, inherited: false }, correction: null }],
    submission: { sentAt: 1795000000, sentBy: "Ana Pérez", verifiedAt: null, verifiedBy: null, state: "pendiente", outcome: null, responsibleId: OTHER_LIBRARIAN },
    decision: {
      lockedBlock: null,
      locked: { id: SYLLABUS, state: "en_revision", version: 8, convocationId: "b0000000-0000-4000-8000-000000000001", parallelId: "p" },
      submission: { id: SUBMISSION, verified: false },
      latest: REVISION,
      stage: "biblioteca",
      lockedRevision: { id: REVISION, number: 2, correctionRequested: false },
    },
    notices: notificationWorld({ users: [recipient(COORDINATOR), recipient(TEACHER)], subjects: new Map([[SYLLABUS, "Biología"]]) }),
    stored: [],
    writes: [],
    limiter: createRateLimiter(),
    bridge: fakeDeps(world),
  }
  scenario(base)
  base.bridge = fakeDeps(base.world)
  return base
}

const repository: LibraryReviewRepository = {
  async page(filters, page, perPage, sort = null) {
    state.writes.push(`page:${JSON.stringify({ filters, page, perPage, sort })}`)
    return { total: state.rows.length, items: state.rows.slice((page - 1) * perPage, page * perPage) }
  },
  async summaries(ids) {
    state.writes.push(`summaries:${ids.join(",")}`)
    return new Map(ids.flatMap((id) => (state.summaries.has(id) ? [[id, state.summaries.get(id) as SyllabusSummary]] : [])))
  },
  async userNames(ids) {
    state.writes.push(`names:${ids.join(",")}`)
    return new Map(ids.flatMap((id): [string, string][] => (id === OTHER_LIBRARIAN ? [[id, "Bibliotecaria Ana"]] : id === golden.userId ? [[id, "Bibliotecaria Ñ"]] : [])))
  },
  async faculties() {
    return [{ id: FACULTY, name: "Facultad de Ingeniería" }]
  },
  async pastPeriods() {
    return [{ id: PERIOD, code: "2026-1" }]
  },
  async existing(table, ids) {
    state.writes.push(`exists:${table}:${ids.join(",")}`)
    const known = table === "facultades" ? [FACULTY] : [PERIOD]
    return ids.filter((id) => known.includes(id.toLowerCase())).length
  },
}

const store: ReviewDetailStore = {
  revision: async (id) => {
    state.writes.push(`revision:${id}`)
    return state.revisions.find((item) => item.id === id.toLowerCase()) ?? null
  },
  syllabus: async () => state.syllabus,
  teachers: async () => ["Ana Pérez"],
  history: async () => state.history,
  snapshot: async () => SNAPSHOT,
  signatures: async () => [],
  librarySubmission: async () => state.submission,
  userName: async (id) => (id === OTHER_LIBRARIAN ? "Bibliotecaria Ana" : id === golden.userId ? "Rosa Elena Yánez Campos" : null),
  comments: async () => [],
}

const logos = { faculty: async () => null }

const decisions: Omit<LibraryDecisionDeps, "bridge"> = {
  store,
  settings: () => ({ trustedBundle: null, production: false, now: () => NOW, requireHolderMatch: true }),
  verify: async (content, cms) => {
    if (cms !== "firma-valida") throw new SignatureRejected("La firma no corresponde a la declaración.")
    state.writes.push(`verify:${content}`)
    return { holder: "ROSA ELENA YÁNEZ CAMPOS", serial: "0A", issuer: "C=EC, CN=AUTORIDAD", validTo: NOW + 1000 }
  },
  now: () => NOW,
  async transaction(work) {
    const { decision, notices, writes } = state
    writes.push("begin")
    const staged: SignatureRow[] = []
    const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
      work({
        notifications,
        coordinatorsForCareer: async (careerId) => (careerId === CAREER ? [COORDINATOR] : []),
        teachersFor: async () => [TEACHER],
        lockedDecisionBlock: async () => {
          writes.push("lock:process+convocation")
          return decision.lockedBlock
        },
        lockSyllabus: async (id) => {
          writes.push(`lock:syllabus:${id}`)
          return decision.locked
        },
        lockSubmission: async (id) => {
          writes.push(`lock:submission:${id}`)
          return decision.submission
        },
        latestRevisionId: async () => decision.latest,
        revisionStage: async () => decision.stage,
        markVerified: async (id, actor, now) => void writes.push(`verified:${id}:${actor}:${now}`),
        lockRevision: async (id) => {
          writes.push(`lock:revision:${id}`)
          return decision.lockedRevision
        },
        requestCorrection: async (id, justification, requested, actor, now) => void writes.push(`correction:${id}:${requested}:${actor}:${now}:${justification}`),
        markCorrectionRequested: async (id, version, now) => void writes.push(`syllabus:${id}:correccion_solicitada:${version}:${now}`),
        signed: async () => false,
        insertSignature: async (signature) => {
          staged.push(signature)
          return "f0000000-0000-4000-8000-0000000000aa"
        },
      }),
    )
    state.stored.push(...staged)
    writes.push(`commit:${JSON.stringify(state.stored.map((item) => [item.role, item.holder, item.revisionId]))}:${JSON.stringify(notices.notifications.map((item) => [item.userId, item.key]))}`)
    return result
  },
}

const bridge: BridgeDeps = {
  store: { findUser: (id) => state.bridge.store.findUser(id), effectiveRoleAssignments: (id) => state.bridge.store.effectiveRoleAssignments(id) },
  sessions: {
    fromWebApp: (web) => state.bridge.sessions.fromWebApp(web),
    resolve: (web) => state.bridge.sessions.resolve(web),
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

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/biblioteca/revisiones",
    "x-csrf-token": golden.csrfToken,
    ...(call.cookie === false ? {} : { cookie: COOKIE }),
    ...(call.body === undefined && call.raw === undefined ? {} : { "content-type": "application/json" }),
    ...call.headers,
  }
}

const bodyOf = (call: Call): string | undefined => call.raw ?? (call.body === undefined ? undefined : JSON.stringify(call.body))

async function answerOf(response: Response): Promise<Omit<Answer, "writes" | "sessions">> {
  return { status: response.status, body: await response.text(), headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])) }
}

const DETAIL = /^\/api\/v1\/library\/reviews\/([^/]+)$/
const DECISION = /^\/api\/v1\/library\/reviews\/([^/]+)\/(comments|verify)$/

async function legacy(call: Call): Promise<Response> {
  const url = new URL(call.path, "http://localhost:3000")
  const web = new Request(url, { method: call.method, headers: headersOf(call), body: bodyOf(call) })
  const listingDeps = { bridge: state.bridge, reviews: repository }
  const decisionDeps = { bridge: state.bridge, ...decisions }
  const detail = DETAIL.exec(url.pathname)
  const decision = DECISION.exec(url.pathname)
  if (url.pathname === "/api/v1/library/reviews" && call.method === "GET") return libraryReviews(web, listingDeps)
  if (url.pathname === "/api/v1/library/history" && call.method === "GET") return libraryHistory(web, listingDeps)
  if (detail && call.method === "GET") return libraryReviewDetail(web, decodeURIComponent(detail[1]), { bridge: state.bridge, store, libraryReviews: repository, logos })
  if (decision && call.method === "POST") {
    const handler = decision[2] === "verify" ? verifyLibraryReview : commentLibraryReview
    return handler(web, decodeURIComponent(decision[1]), decisionDeps)
  }
  return unmatchedRoute(web)
}

let app: NestExpressApplication
let root: string

async function nest(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const server = request(app.getHttpServer())
  let pending = server[call.method.toLowerCase() as "get"](call.path)
  for (const [name, value] of Object.entries({ ...headersOf(call), "x-forwarded-host": "localhost:3000" })) pending = pending.set(name, value)
  const body = bodyOf(call)
  const response = await (body === undefined ? pending : pending.send(body))
  return { status: response.status, body: response.text ?? "", headers: Object.fromEntries(HEADERS.map((name) => [name, (response.headers[name] as string | undefined) ?? null])) }
}

async function both(...calls: Call[]): Promise<{ legacy: Answer[]; nest: Answer[] }> {
  const run = async (send: (call: Call) => Promise<Omit<Answer, "writes" | "sessions">>) => {
    state = freshState()
    const answers: Answer[] = []
    for (const call of calls) {
      const answer = await send(call)
      answers.push({ ...answer, writes: [...state.writes], sessions: [...state.world.sessions.values()].map((record) => record.payload) })
    }
    return answers
  }
  return { legacy: await run(async (call) => answerOf(await legacy(call))), nest: await run(nest) }
}

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await both(...calls)
  expect(after).toEqual(before)
  return after
}

const get = (path: string): Call => ({ method: "GET", path })
const post = (path: string, body?: unknown): Call => ({ method: "POST", path, body })
const verify = (body: unknown, id = REVISION) => post(`/api/v1/library/reviews/${id}/verify`, body)
const comment = (body: unknown, id = REVISION) => post(`/api/v1/library/reviews/${id}/comments`, body)
const SIGNED = { signature: { statement: STATEMENT, cms: "firma-valida" } }

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-library-equivalence-"))
  process.env.STORAGE_PATH = path.join(root, "storage", "app")
  process.env.PUBLIC_ASSETS_PATH = path.join(root, "public")
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, LibraryModule, LegacyModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(bridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(limiter)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(LibraryReviewsRepository)
    .useValue(repository)
    .overrideProvider(LIBRARY_DETAIL_STORE)
    .useValue(store)
    .overrideProvider(LIBRARY_LOGO_STORE)
    .useValue(logos)
    .overrideProvider(LIBRARY_DECISIONS)
    .useValue(decisions)
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
  delete process.env.STORAGE_PATH
  delete process.env.PUBLIC_ASSETS_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  scenario = () => {}
})

describe("library reviews served by Nest answer exactly like the route handlers they replace", () => {
  it("lists the current reviews and the history with the same JSON, links, assignment and queries", async () => {
    const answers = await expectSame(get("/api/v1/library/reviews"), get("/api/v1/library/history"), get("/api/v1/library/history?mine=1&period=" + PERIOD))
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200])
    expect(JSON.parse(answers[0].body).reviews.data[0]).toMatchObject({ responsible: "Bibliotecaria Ana", state: "pendiente", outcome: null })
  })

  it.each([
    ["filters by faculty, state and text", `/api/v1/library/reviews?faculty=${FACULTY}&state=firmado&q=%20%C3%A1lgebra%20`],
    ["keeps «0» as a search", "/api/v1/library/reviews?q=0"],
    ["keeps the query string in the page links", "/api/v1/library/reviews?page=2&q=x&otro=1"],
    ["a page that is not a number", "/api/v1/library/reviews?page=abc"],
    ["a faculty in capitals", `/api/v1/library/reviews?faculty=${FACULTY.toUpperCase()}`],
    ["an unknown faculty", `/api/v1/library/reviews?faculty=${MISSING_FACULTY}`],
    ["a faculty that is not a UUID", "/api/v1/library/reviews?faculty=abc"],
    ["a list of faculties", `/api/v1/library/reviews?faculty[]=${FACULTY}`],
    ["an unknown state and a long search", `/api/v1/library/reviews?state=otro&q=${"a".repeat(121)}`],
    ["a state sent as a list", "/api/v1/library/reviews?state[]=pendiente"],
    ["an unclosed bracket", "/api/v1/library/reviews?state[x=1"],
    ["only mine", "/api/v1/library/history?mine=1"],
    ["mine switched off", "/api/v1/library/history?mine=0"],
    ["an invalid mine and period", "/api/v1/library/history?mine=quizas&period=abc"],
    ["an unknown period", `/api/v1/library/history?period=${MISSING_FACULTY}`],
  ])("answers %s the same way", async (_, target) => {
    await expectSame(get(target))
  })

  it.each(LIBRARY_SORTS.flatMap((column) => ["asc", "desc"].map((dir) => [column, dir])))("sorts the reviews and the history by %s %s with the same query", async (column, dir) => {
    const answers = await expectSame(get(`/api/v1/library/reviews?sort=${column}&dir=${dir}`), get(`/api/v1/library/history?sort=${column}&dir=${dir}&page=2`))
    expect(answers.map((answer) => answer.status)).toEqual([200, 200])
    expect(answers[0].writes[0]).toContain(`"sort":{"column":"${column}","direction":"${dir}"}`)
  })

  it.each([
    ["a column outside the whitelist and an unknown direction", "?sort=email&dir=up"],
    ["a direction alone", "?dir=sideways"],
    ["a column sent as a list", "?sort[]=faculty"],
    ["a column with a blank direction", "?sort=faculty&dir="],
  ])("rejects %s with the same 422 and no query", async (_, query) => {
    const answers = await expectSame(get(`/api/v1/library/reviews${query}`), get(`/api/v1/library/history${query}`))
    for (const answer of answers) if (answer.status !== 200) expect(answer.status).toBe(422)
  })

  it("shows a review with the same detail, assignment and signing statement", async () => {
    const [answer] = await expectSame(get(`/api/v1/library/reviews/${REVISION}`))
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.body).review).toMatchObject({ responsible: "Bibliotecaria Ana", assigned_to_other: true, can_verify: true })
  })

  it("answers a missing, malformed or unsent review and invalid filters on the detail the same way", async () => {
    await expectSame(get(`/api/v1/library/reviews/${MISSING_REVISION}`), get("/api/v1/library/reviews/no-es-uuid"), get(`/api/v1/library/reviews/${REVISION}?state=otro&sort=email`))
    scenario = (current) => {
      current.submission = null
    }
    await expectSame(get(`/api/v1/library/reviews/${REVISION}`))
    scenario = (current) => {
      current.summaries = new Map()
    }
    await expectSame(get(`/api/v1/library/reviews/${REVISION}`))
  })

  it("answers a guest, an unverified user, an inactive account, a user without a role and a coordinator the same way", async () => {
    const calls = [get("/api/v1/library/reviews"), get("/api/v1/library/history"), get(`/api/v1/library/reviews/${REVISION}`), verify(SIGNED), comment({ reasons: ["nada"] }), get(`/api/v1/library/reviews/${MISSING_REVISION}`)]
    await expectSame(...calls.map((call) => ({ ...call, cookie: false })))
    await expectSame(...calls.map((call) => ({ ...call, headers: { referer: "http://evil.test/" } })))
    const worlds: ((world: FakeWorld) => void)[] = [
      (world) => void (world.users = [makeUser({ emailVerifiedAt: null })]),
      (world) => void (world.users = [makeUser({ active: false })]),
      (world) => void (world.assignments = []),
      (world) => void (world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]),
    ]
    for (const change of worlds) {
      scenario = (current) => change(current.world)
      for (const call of calls) await expectSame(call)
    }
  })

  it("signs the revision with the same locks, signature, verification and notice", async () => {
    const answers = await expectSame(verify(SIGNED), get(`/api/v1/library/reviews/${REVISION}`))
    expect(answers[0].status).toBe(201)
    expect(answers[0].writes.at(-1)).toContain(`["biblioteca","ROSA ELENA YÁNEZ CAMPOS","${REVISION}"]`)
  })

  it.each([
    ["no body", undefined],
    ["an empty body", {}],
    ["a signature that is not a list", { signature: "texto" }],
    ["a signature without statement", { signature: { cms: "x" } }],
    ["a signature that does not match", { signature: { statement: STATEMENT, cms: "otra" } }],
    ["a list as body", [1, 2]],
  ])("answers a verification with %s the same way", async (_, body) => {
    await expectSame(verify(body))
  })

  it.each<[string, (current: State) => void]>([
    ["an already verified revision", (current) => void (current.decision.submission = { id: SUBMISSION, verified: true })],
    ["a revision that left the library", (current) => void (current.decision.stage = "coordinacion")],
    ["a newer revision", (current) => void (current.decision.latest = "70000000-0000-4000-8000-000000000002")],
    ["a decision paused under the lock", (current) => void (current.decision.lockedBlock = PAUSED)],
    ["a closed convocation", (current) => void (current.syllabus = detailSyllabus({ convocationState: "cerrada" }))],
    ["a syllabus without library submission", (current) => void (current.syllabus = detailSyllabus({ hasLibrarySubmission: false }))],
    ["a syllabus that disappeared under the lock", (current) => void (current.decision.locked = null)],
    ["a submission that disappeared under the lock", (current) => void (current.decision.submission = null)],
  ])("answers a verification of %s the same way", async (_, change) => {
    scenario = change
    await expectSame(verify(SIGNED), verify({}))
  })

  it("returns the syllabus to the teacher with the same correction and notice", async () => {
    const [answer] = await expectSame(comment({ reasons: ["codigo_incorrecto", "otro"], other: "  Falta la 3.ª edición de Pressman. " }))
    expect(answer.status).toBe(201)
  })

  it.each([
    ["no body", undefined],
    ["no reasons", {}],
    ["an empty list", { reasons: [] }],
    ["other without text", { reasons: ["otro"] }],
    ["a short other", { reasons: ["otro"], other: "abc" }],
    ["an unknown and a duplicated reason", { reasons: ["nada", "isbn_incorrecto", "isbn_incorrecto"] }],
    ["a reason as text", { reasons: "codigo_incorrecto" }],
    ["a reason as a map", { reasons: { a: "codigo_incorrecto" } }],
    ["a long other", { reasons: ["otro"], other: "x".repeat(1001) }],
    ["other as a number", { reasons: ["otro"], other: 12345 }],
  ])("validates a comment with %s the same way", async (_, body) => {
    await expectSame(comment(body))
  })

  it.each<[string, (current: State) => void]>([
    ["a closed convocation", (current) => void (current.syllabus = detailSyllabus({ convocationState: "cerrada" }))],
    ["a paused convocation", (current) => void (current.syllabus = detailSyllabus({ convocationState: "pausada" }))],
    ["a syllabus without library submission", (current) => void (current.syllabus = detailSyllabus({ hasLibrarySubmission: false }))],
    ["a decision paused under the lock", (current) => void (current.decision.lockedBlock = PAUSED)],
    ["a revision already returned", (current) => void (current.decision.lockedRevision = { id: REVISION, number: 2, correctionRequested: true })],
    ["a revision in another stage", (current) => void (current.decision.stage = "coordinacion")],
    ["an approved syllabus", (current) => void (current.decision.locked = { ...current.decision.locked!, state: "aprobado" })],
    ["a revision that disappeared under the lock", (current) => void (current.decision.lockedRevision = null)],
  ])("refuses a comment on %s the same way, before validating the reasons", async (_, change) => {
    scenario = change
    await expectSame(comment({ reasons: ["codigo_incorrecto"] }), comment({ reasons: [] }))
  })

  it("answers unknown revisions and malformed bodies the same way", async () => {
    await expectSame(verify(SIGNED, MISSING_REVISION), comment({ reasons: ["codigo_incorrecto"] }, "no-es-uuid"))
    await expectSame({ method: "POST", path: `/api/v1/library/reviews/${REVISION}/comments`, raw: "{no es json" }, { method: "POST", path: `/api/v1/library/reviews/${REVISION}/verify`, raw: "reasons=1" })
  })

  it.each([
    ["POST", "/api/v1/library/reviews"],
    ["DELETE", "/api/v1/library/history"],
    ["PUT", `/api/v1/library/reviews/${REVISION}`],
    ["GET", `/api/v1/library/reviews/${REVISION}/verify`],
    ["GET", `/api/v1/library/reviews/${REVISION}/comments`],
    ["PATCH", `/api/v1/library/reviews/${REVISION}/comments`],
    ["OPTIONS", "/api/v1/library/reviews"],
    ["GET", "/api/v1/library/otra-cosa"],
  ])("answers %s %s with the router answer of the contract", async (method, target) => {
    await expectSame({ method, path: target, cookie: false })
  })
})
