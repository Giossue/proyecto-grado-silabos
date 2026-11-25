// @vitest-environment node
import "reflect-metadata"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { teacherSupportDocuments } from "../../server/academic/supportDocuments"
import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"
import { fakeTemplateStore, fieldId, goldenTemplate } from "../../server/configuration/testing"
import { downloadExport, requestRevisionDocuments, revisionDocuments, type DocumentDeps, type DocumentRequestDeps } from "../../server/documents/revisionDocuments"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { unmatchedRoute } from "../../server/http/router"
import { searchCatalog } from "../../server/library/catalogHandlers"
import { createConvocation, resumeConvocation, type ConvocationWriteDeps } from "../../server/syllabus/convocationWrites"
import { convocationDetail, convocations, pauseConvocation, type ConvocationDeps } from "../../server/syllabus/convocations"
import { compareRevisions, coordinationHistory, coordinationReviews, type CoordinationReviewDeps } from "../../server/syllabus/coordinationReviews"
import { updateDraftField, type DraftFieldDeps } from "../../server/syllabus/draftField"
import { copySyllabusContent, startDraft, type DraftStartDeps } from "../../server/syllabus/draftStart"
import { validateDraft, type DraftValidationDeps } from "../../server/syllabus/draftValidation"
import { approveReview, type ReviewApprovalDeps } from "../../server/syllabus/reviewApproval"
import { requestCorrection, resetSyllabus, type ReviewDecisionDeps } from "../../server/syllabus/reviewDecisions"
import { coordinationReviewDetail, type ReviewDetailDeps, type ReviewRevision } from "../../server/syllabus/reviewDetails"
import { submissionStatement, submitSyllabus, type SubmissionDeps } from "../../server/syllabus/submission"
import { teacherSyllabusDetail, type DetailSyllabus, type SyllabusDetailDeps } from "../../server/syllabus/syllabusDetail"
import { teacherHistory, teacherHistoryCareer, teacherSyllabi, type TeacherSyllabusDeps } from "../../server/syllabus/teacherSyllabi"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { ExportsModule } from "../exports/exports.module"
import { DOCUMENT_DEPS, DOCUMENT_REQUEST_DEPS } from "../exports/exports.tokens"
import { FallbackModule } from "../fallback/fallback.module"
import { SyllabusModule } from "./syllabus.module"
import type { TeacherResources } from "./syllabus.providers"
import {
  CONVOCATION_DEPS,
  CONVOCATION_WRITE_DEPS,
  COORDINATION_REVIEW_DEPS,
  DRAFT_FIELD_DEPS,
  DRAFT_START_DEPS,
  DRAFT_VALIDATION_DEPS,
  REVIEW_APPROVAL_DEPS,
  REVIEW_DECISION_DEPS,
  REVIEW_DETAIL_DEPS,
  SUBMISSION_DEPS,
  SYLLABUS_DETAIL_DEPS,
  TEACHER_RESOURCES,
  TEACHER_SYLLABUS_DEPS,
} from "./syllabus.tokens"

const SESSION_ID = golden.sessionId
const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const TEACHER = golden.roleId
const COORDINATOR = "a0000000-0000-4000-8000-000000000002"
const CAREER = "c0000000-0000-4000-8000-000000000001"
const OTHER_CAREER = "c0000000-0000-4000-8000-000000000002"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const SOURCE = "50000000-0000-4000-8000-000000000002"
const MISSING = "50000000-0000-4000-8000-000000000009"
const SUBJECT = "a1000000-0000-4000-8000-000000000001"
const CONVOCATION = "b0000000-0000-4000-8000-000000000001"
const PROCESS = "b1000000-0000-4000-8000-000000000001"
const PERIOD = "b2000000-0000-4000-8000-000000000001"
const REVISION = "70000000-0000-4000-8000-000000000001"
const LATER_REVISION = "70000000-0000-4000-8000-000000000002"
const ARTIFACT = "80000000-0000-4000-8000-000000000001"
const KEY = "90000000-0000-4000-8000-000000000001"
const FIELD = fieldId(8)
const HEADERS = ["content-type", "content-disposition", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy", "cross-origin-resource-policy", "set-cookie"]

type Lock = { state: string; processState: string; version: number }

type State = {
  world: FakeWorld
  writes: string[]
  limiter: RateLimiter
  bridge: BridgeDeps
  facts: DetailSyllabus | null
  source: DetailSyllabus | null
  lock: Lock
  revisions: Map<string, ReviewRevision & { snapshot: unknown }>
  convocationState: string
  processState: string
  approved: boolean
  approval: { approvedAt: string; approvedBy: string } | null
  artifact: { state: string; requestedBy: string; object: { id: string; disk: string; path: string } | null }
  pastCareerSyllabi: number
  signed: boolean
}

type Call = { method: string; path: string; body?: unknown; cookie?: boolean; headers?: Record<string, string> }

type Answer = { status: number; body: string; headers: Record<string, string | null>; writes: string[]; sessions: string[] }

function facts(overrides: Partial<DetailSyllabus> = {}): DetailSyllabus {
  return {
    id: SYLLABUS,
    state: "borrador",
    careerId: CAREER,
    convocationState: "abierta",
    processState: "abierto",
    dueOn: "2099-12-31",
    currentTeacher: true,
    writtenByUser: true,
    hasLibrarySubmission: false,
    subjectId: SUBJECT,
    convocationId: CONVOCATION,
    subject: "Redes de computadoras",
    code: "RED-101",
    parallel: "A",
    career: "Software",
    period: "2026-2027",
    startedAt: "2026-11-01T10:00:00+00:00",
    savedAt: "2026-11-02T10:00:00+00:00",
    version: 3,
    context: {},
    ...overrides,
  }
}

function revision(id: string, number: number, snapshot: unknown): ReviewRevision & { snapshot: unknown } {
  return { id, syllabusId: SYLLABUS, number, submittedAt: NOW - 1000 * number, submittedBy: golden.userId, fingerprint: `huella-${number}`, snapshot }
}

let scenario: () => Partial<State> = () => ({})
let state: State

function world(activeRole: string, overrides: Partial<FakeWorld> = {}): FakeWorld {
  return {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: activeRole })), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ id: TEACHER, role: "docente", careerId: CAREER }), makeAssignment({ id: COORDINATOR, role: "coordinador", careerId: CAREER, careerLabel: "Software" })],
    ...overrides,
  }
}

function freshState(): State {
  const base: State = {
    world: world(TEACHER),
    writes: [],
    limiter: createRateLimiter(),
    bridge: fakeDeps(world(TEACHER)),
    facts: facts(),
    source: facts({ id: SOURCE, state: "aprobado" }),
    lock: { state: "borrador", processState: "abierto", version: 3 },
    revisions: new Map([
      [REVISION, revision(REVISION, 1, { campos: { objetivo: "Antes" } })],
      [LATER_REVISION, revision(LATER_REVISION, 2, { campos: { objetivo: "Después" } })],
    ]),
    convocationState: "pausada",
    processState: "abierto",
    approved: false,
    approval: { approvedAt: "2026-11-20T10:00:00+00:00", approvedBy: "Coordinadora" },
    artifact: { state: "en_cola", requestedBy: golden.userId, object: null },
    pastCareerSyllabi: 2,
    signed: false,
  }
  const merged = { ...base, ...scenario() }
  merged.bridge = fakeDeps(merged.world)
  return merged
}

function note(entry: string, ...args: unknown[]): void {
  state.writes.push(`${entry}:${JSON.stringify(args)}`)
}

function recorder<T>(name: string, explicit: Record<string, unknown>): T {
  return new Proxy(explicit, {
    get(target, property) {
      if (typeof property !== "string" || property === "then") return undefined
      if (property in target) return target[property]
      return async (...args: unknown[]) => {
        note(`${name}.${property}`, ...args)
        return null
      }
    },
  }) as T
}

function live<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get: (_target, property) => {
      if (current === undefined) return undefined
      const value = (pick() as Record<string | symbol, unknown>)[property]
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(pick()) : value
    },
  })
}

const syllabusOf = async (id: string, userId: string) => {
  note("syllabus", id, userId)
  if (state.facts !== null && id === state.facts.id) return state.facts
  if (state.source !== null && id === state.source.id) return state.source
  return null
}

const revisionOf = async (id: string) => {
  note("revision", id)
  return state.revisions.get(id) ?? null
}

function convocationRecord() {
  return { id: CONVOCATION, careerId: CAREER, career: "Software", state: state.convocationState, processState: state.processState, period: "2026-2027", startsOn: "2026-10-01", dueOn: "2099-12-31" }
}

function deps() {
  const bridge = state.bridge
  const convocation: ConvocationDeps = {
    bridge,
    now: () => NOW,
    convocations: recorder("convocations", {
      page: async (...args: unknown[]) => {
        note("convocations.page", ...args)
        return { total: 1, items: [{ processId: PROCESS, processState: "abierto", period: "2026-2027", convocationId: CONVOCATION, convocationState: state.convocationState, syllabiCount: 2 }] }
      },
      convocation: async (id: string) => {
        note("convocations.find", id)
        return id === CONVOCATION ? convocationRecord() : null
      },
      syllabi: async () => [
        { id: SYLLABUS, subject: "Redes", code: "RED-101", liveSubject: "Redes", state: "en_revision", parallel: "B", startedAt: null, latestRevision: { id: REVISION, stage: { approved: false, verified: true }, returnedBy: null }, teachers: ["Ana", "Ana"] },
        { id: SOURCE, subject: "Bases", code: "BAS-101", liveSubject: "Bases", state: "correccion_solicitada", parallel: "A", startedAt: null, latestRevision: { id: LATER_REVISION, stage: { approved: false, verified: false }, returnedBy: "coordinacion" }, teachers: [] },
      ],
      transaction: async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          lockConvocation: async (id: string) => {
            note("convocations.lock", id)
            return state.lock.state
          },
          updateState: async (id: string, value: string) => note("convocations.update", id, value),
        }),
    }),
  }
  const convocationWrites: ConvocationWriteDeps = {
    bridge,
    nowMs: () => NOW * 1000,
    convocation: async (id) => {
      note("writes.convocation", id)
      return id === CONVOCATION ? convocationRecord() : null
    },
    openProcessExists: async (id) => {
      note("writes.openProcess", id)
      return id === PROCESS
    },
    transaction: async (work) =>
      work(
        recorder("writes.tx", {
          lockProcess: async (id: string) => {
            note("writes.lockProcess", id)
            return { id, state: state.processState, periodId: PERIOD }
          },
          careerHasConvocation: async () => false,
          createConvocation: async (careerId: string, processId: string) => {
            note("writes.create", careerId, processId)
            return CONVOCATION
          },
          lockConvocation: async (id: string) => {
            note("writes.lockConvocation", id)
            return { id, careerId: CAREER, careerLabel: "Software", state: state.lock.state, processState: state.lock.processState, dueAt: NOW + 86400 }
          },
          readinessBlockers: async () => [],
          templateProblem: async () => null,
          generateConvocation: async (id: string) => {
            note("writes.generate", id)
            return 2
          },
          teacherSyllabusCounts: async () => new Map(),
        }),
      ),
  }
  const reviews: CoordinationReviewDeps = {
    bridge,
    reviews: recorder("reviews", {
      reviewPage: async (...args: unknown[]) => {
        note("reviews.page", ...args)
        return { total: 1, items: [{ id: SYLLABUS, subject: "Redes", code: "RED-101", period: "2026-2027", state: "en_revision", revisionId: REVISION, revisionNumber: 1, submittedAt: "2026-11-03T10:00:00+00:00", approved: false, verified: true }] }
      },
      teacherNames: async () => new Map([[SYLLABUS, ["Ana Pérez"]]]),
      historyPage: async (...args: unknown[]) => {
        note("reviews.history", ...args)
        return { total: 1, items: [{ id: SYLLABUS, subject: "Redes", code: "RED-101", period: "2026-2027", parallel: "A", revisionId: REVISION, author: "Ana Pérez", approvedAt: "2026-11-04T10:00:00+00:00" }] }
      },
      historyPeriods: async () => [{ id: PERIOD, code: "2026-2027" }],
      periodExists: async (id: string) => {
        note("reviews.periodExists", id)
        return id === PERIOD
      },
      revision: revisionOf,
      syllabus: syllabusOf,
      syllabusSummary: async (id: string) => ({ id, subject: "Redes", code: "RED-101", period: "2026-2027", revisions: [...state.revisions.values()].map((item) => ({ id: item.id, number: item.number, submittedAt: "2026-11-03T10:00:00+00:00" })) }),
    }),
  }
  const details: ReviewDetailDeps = {
    bridge,
    store: recorder("details", { revision: revisionOf, syllabus: syllabusOf }),
    libraryReviews: recorder("details.library", {}),
    logos: recorder("details.logos", {}),
  }
  const decisionTx = recorder("decisions.tx", {
    lockedDecisionBlock: async () => null,
    decisionBlock: async () => null,
    lockSyllabus: async (id: string) => {
      note("decisions.lock", id)
      return { id, state: state.lock.state, version: state.lock.version, convocationId: CONVOCATION, parallelId: "p-1" }
    },
    latestRevisionId: async () => LATER_REVISION,
    approvalExists: async () => state.approved,
  })
  const decisions: ReviewDecisionDeps = { bridge, now: () => NOW, store: recorder("decisions", { revision: revisionOf, syllabus: syllabusOf }), transaction: async (work) => work(decisionTx as never) }
  const approvals: ReviewApprovalDeps = {
    bridge,
    now: () => NOW,
    newId: () => "01a1c5ba-0000-7000-8000-000000000001",
    newKey: () => "clave",
    settings: () => ({ requireHolderMatch: false }) as ReturnType<ReviewApprovalDeps["settings"]>,
    store: recorder("approvals", { revision: revisionOf, syllabus: syllabusOf, userName: async () => "Coordinadora" }),
    transaction: async (work) => work(decisionTx as never),
  }
  const teacher: TeacherSyllabusDeps = {
    bridge,
    syllabi: {
      page: async (...args) => {
        note("teacher.page", ...args)
        return { total: 1, items: [{ id: SYLLABUS, subject: "Redes", code: "RED-101", career: "Software", period: "2026-2027", state: "borrador", startedAt: null, parallel: "A", savedAt: null }] }
      },
      convocationOpen: async () => true,
      past: async (userId, careerId) => {
        note("teacher.past", userId, careerId)
        return Array.from({ length: careerId === null || careerId === CAREER ? state.pastCareerSyllabi : 0 }, (_, index) => ({
          id: `past-${index}`,
          careerId: CAREER,
          career: "Software",
          subject: `Asignatura ${index}`,
          period: `202${index}`,
          periodEndsOn: `202${index}-08-01`,
          state: "aprobado",
          parallel: "A",
          savedAt: null,
        }))
      },
    },
  }
  const detail: SyllabusDetailDeps = {
    bridge,
    today: () => "2026-11-25",
    store: recorder("detail", { syllabus: syllabusOf }),
    templates: fakeTemplateStore({ template: goldenTemplate(), values: [] }),
    logos: recorder("detail.logos", {}),
  }
  const starts: DraftStartDeps = recorder("starts", {
    bridge,
    today: () => "2026-11-25",
    now: () => NOW,
    store: recorder("starts.store", { syllabus: syllabusOf }),
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work(
        recorder("starts.tx", {
          lockSyllabus: async (id: string) => {
            note("starts.lock", id)
            return { id, state: state.lock.state, version: state.lock.version, subjectId: SUBJECT }
          },
        }),
      ),
  })
  const fields: DraftFieldDeps = recorder("fields", {
    bridge,
    today: () => "2026-11-25",
    now: () => NOW,
    newId: () => "01a1c5ba-eeee-7000-8000-000000000001",
    templates: fakeTemplateStore({ template: goldenTemplate(), values: [] }),
    store: recorder("fields.store", {
      syllabus: syllabusOf,
      field: async (id: string) => {
        note("fields.field", id)
        const field = goldenTemplate().sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((candidate) => candidate.id === id)
        return field ? { id: field.id, templateId: goldenTemplate().id, responsible: field.responsible, content: field.content, key: field.key, live: true } : null
      },
      transaction: async (work: (tx: unknown) => Promise<unknown>) =>
        work(
          recorder("fields.tx", {
            lockSyllabus: async (id: string) => {
              note("fields.lock", id)
              return { id, state: state.lock.state, version: state.lock.version, subjectId: SUBJECT }
            },
            templateStore: fakeTemplateStore({ template: goldenTemplate(), values: [] }),
          }),
        ),
    }),
  })
  const validations: DraftValidationDeps = { bridge, today: () => "2026-11-25", store: recorder("validations", { syllabus: syllabusOf }) }
  const submissions: SubmissionDeps = {
    bridge,
    today: () => "2026-11-25",
    now: () => NOW,
    newId: () => "01a1c5ba-ffff-7000-8000-000000000001",
    settings: () => ({ requireHolderMatch: false }) as ReturnType<SubmissionDeps["settings"]>,
    validate: async () => 0,
    payload: async () => ({}),
    store: recorder("submissions", {
      syllabus: syllabusOf,
      schedule: async () => ({ convocationState: "abierta", processState: state.processState, startsOn: "2026-10-01", dueOn: state.facts?.dueOn ?? "2099-12-31" }),
      revisionByKey: async () => null,
      snapshot: async (id: string) => {
        note("submissions.snapshot", id)
        return { silabo: { id, asignatura: "Redes de computadoras", versión: 3 }, campos: { objetivo: "Comprender redes" } }
      },
      signed: async () => state.signed,
    }),
  }
  const documents: DocumentDeps = {
    bridge,
    now: () => NOW,
    store: {
      revision: revisionOf,
      syllabus: syllabusOf,
      approval: async () => state.approval,
      artifacts: async () => [{ id: ARTIFACT, state: "completado", requestedAt: "2026-11-20T10:00:00+00:00", completedAt: "2026-11-20T10:01:00+00:00", pdfSize: 2048 }],
      artifact: async (id) => {
        note("documents.artifact", id)
        return id === ARTIFACT ? { id: ARTIFACT, revisionId: REVISION, state: state.artifact.state, object: state.artifact.object } : null
      },
    },
  }
  const documentRequests: DocumentRequestDeps = {
    ...documents,
    limiter: state.limiter,
    newId: () => "01a1c5ba-aaaa-7000-8000-000000000001",
    existing: async (revisionId, key) => {
      note("documents.existing", revisionId, key)
      return { id: ARTIFACT, state: state.artifact.state, requestedBy: state.artifact.requestedBy }
    },
    transaction: async () => {
      throw new Error("no se esperaba una transacción")
    },
  }
  const resources: TeacherResources = {
    supportDocuments: (web) =>
      teacherSupportDocuments(web, {
        bridge,
        documents: {
          careerActive: async () => true,
          forCareer: async () => [{ id: "d-1", title: "Reglamento", size: 1024, view: "/ver/d-1", uploadedAt: "2026-11-01T10:00:00+00:00" }],
        } as never,
      }),
    catalogSearch: (web) => searchCatalog(web, { bridge, limiter: state.limiter, settings: async () => ({}) as never, fetch: (async () => new Response("{}")) as never, facultyLibraries: async () => [] }),
  }
  return { convocation, convocationWrites, reviews, details, decisions, approvals, teacher, detail, starts, fields, validations, submissions, documents, documentRequests, resources }
}

let current: ReturnType<typeof deps>

type Route = [method: string, pattern: RegExp, handle: (web: Request, match: RegExpExecArray) => Promise<Response>]

const ROUTES: Route[] = [
  ["GET", /^\/api\/v1\/coordination\/convocations$/, (web) => convocations(web, current.convocation)],
  ["POST", /^\/api\/v1\/coordination\/convocations$/, (web) => createConvocation(web, current.convocationWrites)],
  ["GET", /^\/api\/v1\/coordination\/convocations\/([^/]+)$/, (web, m) => convocationDetail(web, m[1], current.convocation)],
  ["POST", /^\/api\/v1\/coordination\/convocations\/([^/]+)\/pausar$/, (web, m) => pauseConvocation(web, m[1], current.convocation)],
  ["POST", /^\/api\/v1\/coordination\/convocations\/([^/]+)\/reanudar$/, (web, m) => resumeConvocation(web, m[1], current.convocationWrites)],
  ["GET", /^\/api\/v1\/coordination\/reviews$/, (web) => coordinationReviews(web, current.reviews)],
  ["GET", /^\/api\/v1\/coordination\/history$/, (web) => coordinationHistory(web, current.reviews)],
  ["GET", /^\/api\/v1\/coordination\/reviews\/([^/]+)$/, (web, m) => coordinationReviewDetail(web, m[1], current.details)],
  ["GET", /^\/api\/v1\/coordination\/reviews\/([^/]+)\/compare\/([^/]+)$/, (web, m) => compareRevisions(web, m[1], m[2], current.reviews)],
  ["POST", /^\/api\/v1\/coordination\/reviews\/([^/]+)\/request-correction$/, (web, m) => requestCorrection(web, m[1], current.decisions)],
  ["POST", /^\/api\/v1\/coordination\/reviews\/([^/]+)\/approve$/, (web, m) => approveReview(web, m[1], current.approvals)],
  ["POST", /^\/api\/v1\/coordination\/syllabi\/([^/]+)\/reset$/, (web, m) => resetSyllabus(web, m[1], current.decisions)],
  ["GET", /^\/api\/v1\/teacher\/syllabi$/, (web) => teacherSyllabi(web, current.teacher)],
  ["GET", /^\/api\/v1\/teacher\/syllabi\/([^/]+)$/, (web, m) => teacherSyllabusDetail(web, m[1], current.detail)],
  ["POST", /^\/api\/v1\/teacher\/syllabi\/([^/]+)\/start$/, (web, m) => startDraft(web, m[1], current.starts)],
  ["POST", /^\/api\/v1\/teacher\/syllabi\/([^/]+)\/copy-from\/([^/]+)$/, (web, m) => copySyllabusContent(web, m[1], m[2], current.starts)],
  ["PATCH", /^\/api\/v1\/teacher\/syllabi\/([^/]+)\/fields\/([^/]+)$/, (web, m) => updateDraftField(web, m[1], m[2], current.fields)],
  ["POST", /^\/api\/v1\/teacher\/syllabi\/([^/]+)\/validate$/, (web, m) => validateDraft(web, m[1], current.validations)],
  ["POST", /^\/api\/v1\/teacher\/syllabi\/([^/]+)\/signing-statement$/, (web, m) => submissionStatement(web, m[1], current.submissions)],
  ["POST", /^\/api\/v1\/teacher\/syllabi\/([^/]+)\/submit$/, (web, m) => submitSyllabus(web, m[1], current.submissions)],
  ["GET", /^\/api\/v1\/teacher\/history$/, (web) => teacherHistory(web, current.teacher)],
  ["GET", /^\/api\/v1\/teacher\/history\/([^/]+)$/, (web, m) => teacherHistoryCareer(web, m[1], current.teacher)],
  ["GET", /^\/api\/v1\/teacher\/support-documents$/, (web) => current.resources.supportDocuments(web)],
  ["GET", /^\/api\/v1\/teacher\/library-catalog\/search$/, (web) => current.resources.catalogSearch(web)],
  ["GET", /^\/api\/v1\/revisions\/([^/]+)\/documents$/, (web, m) => revisionDocuments(web, m[1], current.documents)],
  ["POST", /^\/api\/v1\/revisions\/([^/]+)\/documents$/, (web, m) => requestRevisionDocuments(web, m[1], current.documentRequests)],
  ["GET", /^\/api\/v1\/exports\/([^/]+)\/pdf$/, (web, m) => downloadExport(web, m[1], current.documents)],
]

const limiter: RateLimiter = {
  attempt: (key, max, decay, now) => state.limiter.attempt(key, max, decay, now),
  attempts: (key, now) => state.limiter.attempts(key, now),
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

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/silabos",
    ...(call.cookie === false ? {} : { cookie: COOKIE }),
    ...(call.body === undefined ? {} : { "content-type": "application/json" }),
    ...call.headers,
  }
}

async function answerOf(response: Response): Promise<Omit<Answer, "writes" | "sessions">> {
  const headers = Object.fromEntries(HEADERS.map((name) => [name, name === "set-cookie" ? response.headers.getSetCookie().join("\n") || null : response.headers.get(name)]))
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()).toString("base64"), headers }
}

async function legacy(call: Call): Promise<Response> {
  const url = new URL(call.path, "http://localhost:3000")
  const web = new Request(url, { method: call.method, headers: headersOf(call), body: call.body === undefined ? undefined : JSON.stringify(call.body) })
  for (const [method, pattern, handle] of ROUTES) {
    const match = pattern.exec(url.pathname)
    if (match && (method === call.method || (method === "GET" && call.method === "HEAD"))) {
      const decoded = Object.assign([...match].map((part) => decodeURIComponent(part)), { index: match.index, input: match.input }) as unknown as RegExpExecArray
      const { result, cookies } = await withCookieQueue(() => handle(web, decoded))
      return cookies.length === 0 ? result : withSetCookies(result, cookies)
    }
  }
  return unmatchedRoute(web)
}

let app: NestExpressApplication

async function nest(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const server = request(app.getHttpServer())
  let pending = server[call.method.toLowerCase() as "get"](call.path).buffer(true).parse((response, done) => {
    const chunks: Buffer[] = []
    response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    response.on("end", () => done(null, Buffer.concat(chunks)))
  })
  for (const [name, value] of Object.entries({ ...headersOf(call), "x-forwarded-host": "localhost:3000" })) pending = pending.set(name, value)
  const response = await (call.body === undefined ? pending : pending.send(JSON.stringify(call.body)))
  const headers = Object.fromEntries(
    HEADERS.map((name) => {
      const value = response.headers[name] as string | string[] | undefined
      return [name, Array.isArray(value) ? value.join("\n") : (value ?? null)]
    }),
  )
  return { status: response.status, body: (response.body as Buffer).toString("base64"), headers }
}

async function both(...calls: Call[]): Promise<{ legacy: Answer[]; nest: Answer[] }> {
  const run = async (send: (call: Call) => Promise<Omit<Answer, "writes" | "sessions">>) => {
    state = freshState()
    current = deps()
    const answers: Answer[] = []
    for (const call of calls) {
      const answer = await send(call)
      answers.push({ ...answer, writes: [...state.writes], sessions: [...state.world.sessions.values()].map((record) => record.payload) })
    }
    return answers
  }
  return { legacy: await run(async (call) => answerOf(await legacy(call))), nest: await run(nest) }
}

const text = (answer: Answer) => Buffer.from(answer.body, "base64").toString("utf8")

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await both(...calls)
  expect(after).toEqual(before)
  return after
}

const asCoordinator = () => ({ world: world(COORDINATOR) })

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, SyllabusModule, ExportsModule, FallbackModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(bridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(limiter)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(CONVOCATION_DEPS)
    .useValue(live(() => current.convocation))
    .overrideProvider(CONVOCATION_WRITE_DEPS)
    .useValue(live(() => current.convocationWrites))
    .overrideProvider(COORDINATION_REVIEW_DEPS)
    .useValue(live(() => current.reviews))
    .overrideProvider(REVIEW_DETAIL_DEPS)
    .useValue(live(() => current.details))
    .overrideProvider(REVIEW_DECISION_DEPS)
    .useValue(live(() => current.decisions))
    .overrideProvider(REVIEW_APPROVAL_DEPS)
    .useValue(live(() => current.approvals))
    .overrideProvider(TEACHER_SYLLABUS_DEPS)
    .useValue(live(() => current.teacher))
    .overrideProvider(SYLLABUS_DETAIL_DEPS)
    .useValue(live(() => current.detail))
    .overrideProvider(DRAFT_START_DEPS)
    .useValue(live(() => current.starts))
    .overrideProvider(DRAFT_FIELD_DEPS)
    .useValue(live(() => current.fields))
    .overrideProvider(DRAFT_VALIDATION_DEPS)
    .useValue(live(() => current.validations))
    .overrideProvider(SUBMISSION_DEPS)
    .useValue(live(() => current.submissions))
    .overrideProvider(TEACHER_RESOURCES)
    .useValue(live(() => current.resources))
    .overrideProvider(DOCUMENT_DEPS)
    .useValue(live(() => current.documents))
    .overrideProvider(DOCUMENT_REQUEST_DEPS)
    .useValue(live(() => current.documentRequests))
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  scenario = () => ({})
})

const statuses = (answers: Answer[]) => answers.map((answer) => answer.status)

describe("the syllabus flow served by Nest answers exactly like the route handlers it replaces", () => {
  describe("coordination convocations", () => {
    it("lists, shows, pauses and resumes with the same answers and writes", async () => {
      scenario = () => ({ ...asCoordinator(), convocationState: "abierta", lock: { state: "abierta", processState: "abierto", version: 1 } })
      const answers = await expectSame(
        { method: "GET", path: "/api/v1/coordination/convocations?q=2026&state=abierta&page=1" },
        { method: "GET", path: `/api/v1/coordination/convocations/${CONVOCATION}` },
        { method: "POST", path: `/api/v1/coordination/convocations/${CONVOCATION}/pausar` },
      )
      expect(statuses(answers)).toEqual([200, 200, 200])
      scenario = () => ({ ...asCoordinator(), convocationState: "pausada", lock: { state: "pausada", processState: "abierto", version: 1 } })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/coordination/convocations/${CONVOCATION}/reanudar` }))).toEqual([200])
    })

    it("answers validation, state changes and missing convocations the same way", async () => {
      scenario = () => ({ ...asCoordinator(), convocationState: "abierta", lock: { state: "pausada", processState: "abierto", version: 1 } })
      const answers = await expectSame(
        { method: "GET", path: "/api/v1/coordination/convocations?state=otro&q[]=x" },
        { method: "POST", path: `/api/v1/coordination/convocations/${CONVOCATION}/pausar` },
        { method: "POST", path: `/api/v1/coordination/convocations/${CONVOCATION}/reanudar` },
        { method: "GET", path: `/api/v1/coordination/convocations/${MISSING}` },
        { method: "GET", path: "/api/v1/coordination/convocations/no-es-uuid" },
        { method: "POST", path: `/api/v1/coordination/convocations/${MISSING}/reanudar` },
      )
      expect(statuses(answers)).toEqual([422, 422, 403, 404, 404, 404])
      scenario = () => ({ ...asCoordinator(), convocationState: "pausada", lock: { state: "pausada", processState: "pausado", version: 1 } })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/coordination/convocations/${CONVOCATION}/reanudar` }))).toEqual([422])
    })

    it("creates a convocation and rejects a missing or closed process the same way", async () => {
      scenario = () => ({ ...asCoordinator(), lock: { state: "preparacion", processState: "abierto", version: 1 } })
      const created = await expectSame({ method: "POST", path: "/api/v1/coordination/convocations", body: { process_id: PROCESS } })
      expect(created[0].status).toBe(201)
      scenario = () => ({ ...asCoordinator(), processState: "pausado" })
      const answers = await expectSame(
        { method: "POST", path: "/api/v1/coordination/convocations", body: {} },
        { method: "POST", path: "/api/v1/coordination/convocations", body: { process_id: MISSING } },
        { method: "POST", path: "/api/v1/coordination/convocations", body: { process_id: PROCESS } },
      )
      expect(statuses(answers)).toEqual([422, 422, 422])
    })

    it("refuses a teacher and a guest the same way", async () => {
      const answers = await expectSame(
        { method: "GET", path: "/api/v1/coordination/convocations" },
        { method: "POST", path: "/api/v1/coordination/convocations", body: { process_id: PROCESS } },
        { method: "GET", path: `/api/v1/coordination/convocations/${CONVOCATION}` },
        { method: "GET", path: "/api/v1/coordination/convocations", cookie: false },
        { method: "POST", path: `/api/v1/coordination/convocations/${CONVOCATION}/pausar`, cookie: false },
      )
      expect(statuses(answers)).toEqual([403, 403, 403, 401, 401])
    })
  })

  describe("coordination reviews", () => {
    it("lists reviews and history with sort and dir the same way", async () => {
      scenario = asCoordinator
      const answers = await expectSame(
        { method: "GET", path: "/api/v1/coordination/reviews?search=redes&sort=submitted&dir=desc&page=2" },
        { method: "GET", path: "/api/v1/coordination/reviews?sort=otro&dir=arriba" },
        { method: "GET", path: `/api/v1/coordination/history?q=red&period=${PERIOD}&sort=approved&dir=asc` },
        { method: "GET", path: `/api/v1/coordination/history?period=${MISSING}` },
        { method: "GET", path: "/api/v1/coordination/history?period=no-es-uuid&sort=x" },
      )
      expect(statuses(answers)).toEqual([200, 422, 200, 422, 422])
    })

    it("compares two revisions and rejects missing or foreign ones the same way", async () => {
      scenario = asCoordinator
      const answers = await expectSame(
        { method: "GET", path: `/api/v1/coordination/reviews/${LATER_REVISION}/compare/${REVISION}` },
        { method: "GET", path: `/api/v1/coordination/reviews/${REVISION}/compare/${MISSING}` },
        { method: "GET", path: `/api/v1/coordination/reviews/${MISSING}/compare/${REVISION}` },
      )
      expect(statuses(answers)).toEqual([200, 404, 404])
      scenario = () => ({ ...asCoordinator(), facts: facts({ careerId: OTHER_CAREER }) })
      expect(statuses(await expectSame({ method: "GET", path: `/api/v1/coordination/reviews/${REVISION}/compare/${LATER_REVISION}` }))).toEqual([403])
    })

    it("answers the review detail for missing revisions, other careers and guests the same way", async () => {
      scenario = () => ({ ...asCoordinator(), facts: facts({ careerId: OTHER_CAREER, state: "en_revision" }) })
      const answers = await expectSame(
        { method: "GET", path: `/api/v1/coordination/reviews/${REVISION}` },
        { method: "GET", path: `/api/v1/coordination/reviews/${MISSING}` },
        { method: "GET", path: "/api/v1/coordination/reviews/no-es-uuid" },
        { method: "GET", path: `/api/v1/coordination/reviews/${REVISION}`, cookie: false },
      )
      expect(statuses(answers)).toEqual([403, 404, 404, 401])
    })

    it("requests a correction with the same validation, block and stale-revision answers", async () => {
      scenario = () => ({ ...asCoordinator(), facts: facts({ state: "en_revision" }), lock: { state: "en_revision", processState: "abierto", version: 4 } })
      const answers = await expectSame(
        { method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/request-correction`, body: { justification: "corta" } },
        { method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/request-correction`, body: { justification: ["lista"] } },
        { method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/request-correction`, body: { justification: "La bibliografía no cumple el formato APA." } },
        { method: "POST", path: `/api/v1/coordination/reviews/${MISSING}/request-correction`, body: {} },
      )
      expect(statuses(answers)).toEqual([422, 422, 422, 404])
      expect(text(answers[2])).toContain("La revisión dejó de estar disponible para solicitar corrección.")
      scenario = () => ({ ...asCoordinator(), facts: facts({ state: "en_revision", convocationState: "pausada" }) })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/request-correction`, body: { justification: "La bibliografía no cumple." } }))).toEqual([403])
    })

    it("approves with a signature the same way, including the replayed approval and a stale revision", async () => {
      scenario = () => ({ ...asCoordinator(), facts: facts({ state: "en_revision" }), lock: { state: "en_revision", processState: "abierto", version: 4 }, approved: true })
      const replay = await expectSame({ method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/approve`, body: { signature: null } })
      expect(replay[0].status).toBe(200)
      scenario = () => ({ ...asCoordinator(), facts: facts({ state: "en_revision" }), lock: { state: "en_revision", processState: "abierto", version: 4 } })
      const answers = await expectSame(
        { method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/approve`, body: { signature: "texto" } },
        { method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/approve`, body: { signature: null } },
        { method: "POST", path: `/api/v1/coordination/reviews/${REVISION}/approve`, body: { signature: null }, cookie: false },
      )
      expect(statuses(answers)).toEqual([422, 422, 401])
      expect(text(answers[1])).toContain("Solo puede aprobarse la revisión vigente.")
    })

    it("resets an approved syllabus with the same validation and state answers", async () => {
      scenario = () => ({ ...asCoordinator(), facts: facts({ state: "aprobado" }), lock: { state: "borrador", processState: "abierto", version: 4 } })
      const answers = await expectSame(
        { method: "POST", path: `/api/v1/coordination/syllabi/${SYLLABUS}/reset`, body: { reason: "no" } },
        { method: "POST", path: `/api/v1/coordination/syllabi/${SYLLABUS}/reset`, body: { reason: "  Cambió la malla  " } },
        { method: "POST", path: `/api/v1/coordination/syllabi/${MISSING}/reset`, body: { reason: "Cambió la malla" } },
      )
      expect(statuses(answers)).toEqual([422, 422, 404])
      scenario = asCoordinator
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/coordination/syllabi/${SYLLABUS}/reset`, body: { reason: "Cambió la malla" } }))).toEqual([403])
    })
  })

  describe("teacher", () => {
    it("lists syllabi and history the same way", async () => {
      const answers = await expectSame(
        { method: "GET", path: "/api/v1/teacher/syllabi?q=redes&state=borrador&page=1" },
        { method: "GET", path: "/api/v1/teacher/syllabi?state=otro" },
        { method: "GET", path: "/api/v1/teacher/history" },
        { method: "GET", path: `/api/v1/teacher/history/${CAREER}` },
        { method: "GET", path: `/api/v1/teacher/history/${OTHER_CAREER}` },
      )
      expect(statuses(answers)).toEqual([200, 422, 200, 200, 404])
    })

    it("answers the career history route check before the session the same way", async () => {
      await expectSame({ method: "GET", path: "/api/v1/teacher/history/no-es-uuid" }, { method: "GET", path: "/api/v1/teacher/history/no-es-uuid", cookie: false })
      scenario = asCoordinator
      expect(statuses(await expectSame({ method: "GET", path: "/api/v1/teacher/syllabi" }, { method: "GET", path: "/api/v1/teacher/history" }))).toEqual([403, 403])
    })

    it("answers the syllabus detail for missing, foreign and guest requests the same way", async () => {
      scenario = () => ({ facts: facts({ currentTeacher: false, writtenByUser: false }) })
      const answers = await expectSame(
        { method: "GET", path: `/api/v1/teacher/syllabi/${SYLLABUS}` },
        { method: "GET", path: `/api/v1/teacher/syllabi/${MISSING}` },
        { method: "GET", path: `/api/v1/teacher/syllabi/${SYLLABUS}`, cookie: false },
      )
      expect(statuses(answers)).toEqual([403, 404, 401])
    })

    it("starts and copies a draft with the same state, source and validation answers", async () => {
      scenario = () => ({ facts: facts({ state: "sin_iniciar" }), lock: { state: "borrador", processState: "abierto", version: 1 } })
      const answers = await expectSame(
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/start` },
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/copy-from/${MISSING}`, body: { version_bloqueo: 1 } },
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/copy-from/no-es-uuid`, body: { version_bloqueo: 1 } },
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/copy-from/${SOURCE}`, body: { version_bloqueo: "x" } },
        { method: "POST", path: `/api/v1/teacher/syllabi/${MISSING}/start` },
      )
      expect(statuses(answers)).toEqual([422, 404, 404, 422, 404])
      scenario = () => ({ facts: facts({ state: "borrador" }) })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/start` }))).toEqual([403])
    })

    it("autosaves a field with the same 409 version conflict, 422 validation and 404 answers", async () => {
      const answers = await expectSame(
        { method: "PATCH", path: `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${FIELD}`, body: { version_bloqueo: 2, value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] } } },
        { method: "PATCH", path: `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${FIELD}`, body: { version_bloqueo: 2, value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] } }, headers: { accept: "text/html" } },
        { method: "PATCH", path: `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${FIELD}`, body: { value: "texto" } },
        { method: "PATCH", path: `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${MISSING}`, body: { version_bloqueo: 3 } },
        { method: "PATCH", path: `/api/v1/teacher/syllabi/${MISSING}/fields/${FIELD}`, body: { version_bloqueo: 3 } },
      )
      expect(statuses(answers)).toEqual([409, 409, 422, 404, 404])
      expect(JSON.parse(text(answers[0]))).toMatchObject({ code: "conflicto_version_borrador", version_bloqueo_actual: 3 })
      scenario = () => ({ facts: facts({ state: "en_revision" }) })
      expect(statuses(await expectSame({ method: "PATCH", path: `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${FIELD}`, body: { version_bloqueo: 3 } }))).toEqual([403])
    })

    it("validates a draft with the same answers for a locked state and a missing syllabus", async () => {
      scenario = () => ({ facts: facts({ state: "en_revision" }) })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/validate` }, { method: "POST", path: `/api/v1/teacher/syllabi/${MISSING}/validate` }))).toEqual([403, 404])
    })

    it("signs the same canonical statement and answers conflicts, deadlines and validation the same way", async () => {
      const answers = await expectSame(
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/signing-statement`, body: { version_bloqueo: 3 } },
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/signing-statement`, body: { version_bloqueo: 2 } },
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/signing-statement`, body: {} },
        { method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/submit`, body: { version_bloqueo: 3, signature: "x" } },
        { method: "POST", path: `/api/v1/teacher/syllabi/${MISSING}/submit`, body: { version_bloqueo: 3, idempotency_key: KEY } },
      )
      expect(statuses(answers)).toEqual([200, 409, 422, 422, 404])
      expect(JSON.parse(text(answers[0])).statement).toMatch(/[0-9a-f]{64}/)
      scenario = () => ({ facts: facts({ dueOn: "2026-11-01" }), signed: true })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/teacher/syllabi/${SYLLABUS}/signing-statement`, body: { version_bloqueo: 3 } }))).toEqual([422])
    })

    it("serves support documents and refuses the catalog search to another role the same way", async () => {
      const answers = await expectSame({ method: "GET", path: "/api/v1/teacher/support-documents" }, { method: "GET", path: "/api/v1/teacher/support-documents", cookie: false })
      expect(statuses(answers)).toEqual([200, 401])
      scenario = asCoordinator
      await expectSame({ method: "GET", path: "/api/v1/teacher/library-catalog/search?q=redes" }, { method: "GET", path: "/api/v1/teacher/library-catalog/search?q=redes", cookie: false })
    })
  })

  describe("documents and exports", () => {
    it("lists the PDFs of an approved revision and answers an unapproved one the same way", async () => {
      const answers = await expectSame({ method: "GET", path: `/api/v1/revisions/${REVISION}/documents` }, { method: "GET", path: `/api/v1/revisions/${MISSING}/documents` })
      expect(statuses(answers)).toEqual([200, 404])
      scenario = () => ({ approval: null })
      expect(statuses(await expectSame({ method: "GET", path: `/api/v1/revisions/${REVISION}/documents` }))).toEqual([404])
    })

    it("requests a PDF with the same idempotency, validation and rate limit answers", async () => {
      scenario = () => ({ artifact: { state: "completado", requestedBy: golden.userId, object: null } })
      const answers = await expectSame(
        { method: "POST", path: `/api/v1/revisions/${REVISION}/documents`, body: { idempotency_key: KEY } },
        { method: "POST", path: `/api/v1/revisions/${REVISION}/documents`, body: { idempotency_key: "x" } },
        { method: "POST", path: `/api/v1/revisions/${MISSING}/documents`, body: { idempotency_key: KEY } },
      )
      expect(statuses(answers)).toEqual([202, 422, 404])
      expect(answers[0].headers["x-ratelimit-remaining"]).toBe("19")
      scenario = () => ({ artifact: { state: "en_cola", requestedBy: "otro", object: null } })
      expect(statuses(await expectSame({ method: "POST", path: `/api/v1/revisions/${REVISION}/documents`, body: { idempotency_key: KEY } }))).toEqual([403])
      const throttled = await expectSame(...Array.from({ length: 21 }, () => ({ method: "POST", path: `/api/v1/revisions/${REVISION}/documents`, body: { idempotency_key: KEY } })))
      expect(throttled.at(-1)?.status).toBe(429)
    })

    it("downloads a PDF only when it is ready, with the same answers", async () => {
      const pending = await expectSame({ method: "GET", path: `/api/v1/exports/${ARTIFACT}/pdf` }, { method: "GET", path: `/api/v1/exports/${MISSING}/pdf` }, { method: "GET", path: "/api/v1/exports/x/pdf", cookie: false })
      expect(statuses(pending)).toEqual([403, 404, 401])
      scenario = () => ({ artifact: { state: "completado", requestedBy: golden.userId, object: { id: "o-1", disk: "public", path: "x.pdf" } } })
      expect(statuses(await expectSame({ method: "GET", path: `/api/v1/exports/${ARTIFACT}/pdf` }))).toEqual([404])
    })
  })

  it.each([
    ["DELETE", "/api/v1/coordination/convocations"],
    ["GET", `/api/v1/coordination/convocations/${CONVOCATION}/pausar`],
    ["POST", `/api/v1/coordination/convocations/${CONVOCATION}/otra`],
    ["PUT", `/api/v1/coordination/reviews/${REVISION}`],
    ["GET", `/api/v1/coordination/reviews/${REVISION}/approve`],
    ["GET", `/api/v1/coordination/syllabi/${SYLLABUS}/reset`],
    ["POST", "/api/v1/teacher/syllabi"],
    ["GET", `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${FIELD}`],
    ["POST", `/api/v1/teacher/syllabi/${SYLLABUS}/fields/${FIELD}`],
    ["OPTIONS", `/api/v1/teacher/syllabi/${SYLLABUS}/submit`],
    ["DELETE", `/api/v1/revisions/${REVISION}/documents`],
    ["POST", `/api/v1/exports/${ARTIFACT}/pdf`],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
  })
})
