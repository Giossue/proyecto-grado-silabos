// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { canonicalHash } from "../documents/canonicalJson"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { SignatureRejected } from "../signatures/cmsVerifier"
import type { SignatureRow } from "../signatures/signDecision"
import { approveReview, type ReviewApprovalDeps } from "./reviewApproval"
import type { ReviewRevision } from "./reviewDetails"
import type { DetailSyllabus } from "./syllabusDetail"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const APPROVED = '{"message":"S\\u00edlabo firmado y aprobado."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "01a2094b-56da-719b-a847-c1c9a1aa0584"
const REVISION = "70000000-0000-4000-8000-000000000001"
const TEACHER = "a1000000-0000-4000-8000-000000000001"
const FINGERPRINT = "cd".repeat(32)
const STATEMENT = `silabos-ueb|silabo:${SYLLABUS}|accion:aprobacion_coordinacion|huella:${FINGERPRINT}`
const KEY = "4f3c2b1a-0d9e-4c8b-a7f6-e5d4c3b2a190"
const PAUSED = "La convocatoria de la carrera está en pausa: las revisiones se retoman cuando se reanude."
const ISO_NOW = new Date(NOW * 1000).toISOString().slice(0, 19) + "+00:00"

let world: FakeWorld
let forwarded: Request[]
let syllabus: DetailSyllabus
let revision: ReviewRevision
let renderable: boolean
let lockedBlock: string | null
let locked: { id: string; state: string; version: number; convocationId: string; parallelId: string } | null
let latest: string | null
let stage: string | null
let submitter: string
let review: string | null
let approved: boolean
let signedRoles: string[]
let log: string[]
let signatures: SignatureRow[]
let audits: AuditEventInput[]
let reviews: { id: string; revisionId: string; reviewerId: string; at: number }[]
let approvals: { id: string; revisionId: string; key: string; fingerprint: string; approverId: string; at: number }[]
let artifacts: { id: string; revisionId: string; key: string; requestedBy: string; requestedAt: number }[]
let dispatched: string[]
let ids: number

function deps(): ReviewApprovalDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    store: {
      revision: async (id) => (id === revision.id ? revision : null),
      syllabus: async () => syllabus,
      userName: async () => "María José Pérez López",
    },
    settings: () => ({ trustedBundle: null, production: false, now: () => NOW, requireHolderMatch: true }),
    verify: async (content, cms) => {
      if (cms !== "firma-valida") throw new SignatureRejected("La firma no corresponde a la declaración.")
      log.push(`verify:${content}`)
      return { holder: "MARIA JOSE PEREZ LOPEZ", serial: "0C", issuer: "C=EC, CN=AUTORIDAD", validTo: NOW + 1000 }
    },
    renderable: async () => renderable,
    now: () => NOW,
    newId: () => `0a000000-0000-7000-8000-${String(++ids).padStart(12, "0")}`,
    newKey: () => KEY,
    async transaction(work) {
      const staged = { signatures: [] as SignatureRow[], audits: [] as AuditEventInput[], reviews: [] as typeof reviews, approvals: [] as typeof approvals, artifacts: [] as typeof artifacts, dispatched: [] as string[], log: [] as string[] }
      const result = await work({
        lockedDecisionBlock: async () => {
          staged.log.push("lock:process+convocation")
          return lockedBlock
        },
        lockSyllabus: async (id) => {
          staged.log.push(`lock:syllabus:${id}`)
          return locked
        },
        approvalExists: async () => approved,
        latestRevisionId: async () => latest,
        revisionStage: async () => stage,
        submitterId: async () => submitter,
        coordinationReviewId: async () => review,
        insertCoordinationReview: async (row) => void staged.reviews.push(row),
        insertApproval: async (row) => void staged.approvals.push(row),
        markApproved: async (id, version) => void staged.log.push(`syllabus:${id}:aprobado:${version}`),
        signed: async (_id, role) => signedRoles.includes(role),
        insertSignature: async (row) => {
          staged.signatures.push(row)
          return "f0000000-0000-4000-8000-000000000001"
        },
        recordAudit: async (event) => void staged.audits.push(event),
        exports: {
          existingArtifact: async (revisionId, key) => {
            const row = [...artifacts, ...staged.artifacts].find((item) => item.revisionId === revisionId && item.key === key)
            return row ? { id: row.id, state: "pendiente", requestedBy: row.requestedBy } : null
          },
          lockSyllabus: async (id) => id === SYLLABUS,
          lockRevision: async (id) => (id === REVISION ? { syllabusId: SYLLABUS, number: 2 } : null),
          approved: async (id) => staged.approvals.some((row) => row.revisionId === id),
          insertArtifact: async (row) => void staged.artifacts.push(row),
          dispatchExport: (id) => void staged.dispatched.push(id),
          recordAudit: async (event) => void staged.audits.push(event),
        },
      })
      signatures.push(...staged.signatures)
      audits.push(...staged.audits)
      reviews.push(...staged.reviews)
      approvals.push(...staged.approvals)
      artifacts.push(...staged.artifacts)
      dispatched.push(...staged.dispatched)
      log.push(...staged.log)
      return result
    },
  }
}

async function approve(body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) {
  const request = new Request(apiRequest(`/api/v1/coordination/reviews/${REVISION}/approve`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, ...headers } }), {
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
  const response = await approveReview(request, REVISION, deps())
  return { status: response.status, text: await response.text() }
}

const signature = (statement = STATEMENT, cms = "firma-valida") => ({ signature: { statement, cms } })
const actions = () => audits.map((event) => event.action)

beforeEach(() => {
  forwarded = []
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  syllabus = {
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
    version: 7,
    context: [],
  }
  revision = { id: REVISION, syllabusId: SYLLABUS, number: 2, submittedAt: NOW - 100, submittedBy: "Ana", fingerprint: FINGERPRINT }
  renderable = true
  lockedBlock = null
  locked = { id: SYLLABUS, state: "en_revision", version: 7, convocationId: syllabus.convocationId, parallelId: "d0000000-0000-4000-8000-000000000001" }
  latest = REVISION
  stage = "coordinacion"
  submitter = TEACHER
  review = null
  approved = false
  signedRoles = ["docente", "biblioteca"]
  log = []
  signatures = []
  audits = []
  reviews = []
  approvals = []
  artifacts = []
  dispatched = []
  ids = 0
})

describe("POST coordination/reviews/{revision}/approve", () => {
  it("signs, records the review and the approval, approves the syllabus and requests the PDF after commit", async () => {
    expect(await approve(signature())).toEqual({ status: 200, text: APPROVED })
    expect(log).toEqual([`verify:${STATEMENT}`, "lock:process+convocation", `lock:syllabus:${SYLLABUS}`, `syllabus:${SYLLABUS}:aprobado:8`])
    expect(signatures).toEqual([expect.objectContaining({ syllabusId: SYLLABUS, revisionId: REVISION, role: "coordinacion", userId: golden.userId, statement: STATEMENT, holder: "MARIA JOSE PEREZ LOPEZ", signedAt: NOW })])
    expect(reviews).toEqual([{ id: "0a000000-0000-7000-8000-000000000001", revisionId: REVISION, reviewerId: golden.userId, at: NOW }])
    const fingerprint = canonicalHash({ revision_id: REVISION, revision_fingerprint: FINGERPRINT, approved_by: golden.userId, approved_at: ISO_NOW, idempotency_key: KEY })
    expect(approvals).toEqual([{ id: "0a000000-0000-7000-8000-000000000002", revisionId: REVISION, key: KEY, fingerprint, approverId: golden.userId, at: NOW }])
    expect(actions()).toEqual(["silabo.firmado", "silabo.revisado_coordinacion", "silabo.aprobado", "documento.exportacion_solicitada"])
    expect(audits[1]).toMatchObject({ resourceType: "revision_coordinacion", resourceId: reviews[0].id, metadata: { revision_number: 2 }, roleAssignmentId: golden.roleId })
    expect(audits[2]).toEqual({
      actorId: golden.userId,
      roleAssignmentId: golden.roleId,
      action: "silabo.aprobado",
      resourceType: "aprobacion",
      resourceId: approvals[0].id,
      result: "exito",
      metadata: { revision_number: 2, from_state: "en_revision", to_state: "aprobado", fingerprint, self_approved: false },
      occurredAt: NOW,
    })
    expect(artifacts).toEqual([{ id: "0a000000-0000-7000-8000-000000000003", revisionId: REVISION, key: approvals[0].id, requestedBy: golden.userId, requestedAt: NOW }])
    expect(audits[3]).toMatchObject({ resourceId: artifacts[0].id, metadata: { revision_number: 2, renderer_version: "phpword-docx-v4+libreoffice-pdf-v1" } })
    expect(dispatched).toEqual([artifacts[0].id])
  })

  it("is idempotent once the revision is approved", async () => {
    approved = true
    expect(await approve(signature("otra", "x"))).toEqual({ status: 200, text: APPROVED })
    expect([signatures, reviews, approvals, artifacts, audits, dispatched]).toEqual([[], [], [], [], [], []])
  })

  it("keeps an existing coordination review and marks a self approval", async () => {
    review = "0e000000-0000-4000-8000-000000000001"
    submitter = golden.userId
    signedRoles = ["docente", "biblioteca", "coordinacion"]
    expect(await approve({})).toEqual({ status: 200, text: APPROVED })
    expect(reviews).toEqual([])
    expect(actions()).toEqual(["silabo.aprobado", "documento.exportacion_solicitada"])
    expect(audits[0].metadata.self_approved).toBe(true)
  })

  it("asks for the coordination signature and rejects a statement for another decision", async () => {
    expect(await approve({})).toEqual({
      status: 422,
      text: '{"message":"Firme con su firma electr\\u00f3nica.","errors":{"signature":["Firme con su firma electr\\u00f3nica."]}}',
    })
    expect(await approve(signature(STATEMENT.replace("aprobacion_coordinacion", "aprobacion_biblioteca")))).toEqual({
      status: 422,
      text: '{"message":"La declaraci\\u00f3n firmada no corresponde. Vuelva a firmar.","errors":{"signature":["La declaraci\\u00f3n firmada no corresponde. Vuelva a firmar."]}}',
    })
    expect([signatures, reviews, approvals, artifacts, audits, dispatched]).toEqual([[], [], [], [], [], []])
  })

  it("validates the signature shape like Laravel", async () => {
    expect(await approve({ signature: "firma" })).toEqual({
      status: 422,
      text: '{"message":"El campo firma electr\\u00f3nica debe ser una lista.","errors":{"signature":["El campo firma electr\\u00f3nica debe ser una lista."]}}',
    })
    expect(await approve({ signature: { statement: "", cms: "x" } })).toEqual({
      status: 422,
      text: '{"message":"La firma no es v\\u00e1lida.","errors":{"signature":["La firma no es v\\u00e1lida."]}}',
    })
  })

  it("only approves the current revision while it waits for coordination", async () => {
    stage = "biblioteca"
    expect(await approve(signature())).toEqual({
      status: 422,
      text: '{"message":"La revisi\\u00f3n ya no espera la decisi\\u00f3n de coordinaci\\u00f3n.","errors":{"revision":["La revisi\\u00f3n ya no espera la decisi\\u00f3n de coordinaci\\u00f3n."]}}',
    })
    stage = "coordinacion"
    latest = "70000000-0000-4000-8000-000000000002"
    expect(await approve(signature())).toEqual({
      status: 422,
      text: '{"message":"Solo puede aprobarse la revisi\\u00f3n vigente.","errors":{"revision":["Solo puede aprobarse la revisi\\u00f3n vigente."]}}',
    })
    latest = REVISION
    lockedBlock = PAUSED
    expect((await approve(signature())).text).toBe(`{"message":"${PAUSED.replace("á", "\\u00e1")}","errors":{"revision":["${PAUSED.replace("á", "\\u00e1")}"]}}`)
    expect(approvals).toEqual([])
  })

  it("is forbidden to other roles and careers and blocked while the convocation is paused", async () => {
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null, careerLabel: null })]
    expect(await approve(signature())).toEqual({ status: 403, text: FORBIDDEN })
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000002" })]
    expect(await approve(signature())).toEqual({ status: 403, text: FORBIDDEN })
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    syllabus = { ...syllabus, convocationState: "pausada" }
    expect(await approve(signature())).toEqual({ status: 403, text: `{"message":"${PAUSED.replace("á", "\\u00e1")}"}` })
    expect(approvals).toEqual([])
  })

  it("leaves to Laravel what Next cannot render or read", async () => {
    renderable = false
    expect(await approve(signature())).toEqual({ status: 299, text: "from-laravel" })
    renderable = true
    expect(await approve("signature=x", { "content-type": "application/x-www-form-urlencoded" })).toEqual({ status: 299, text: "from-laravel" })
    locked = null
    expect(await approve(signature())).toEqual({ status: 299, text: "from-laravel" })
    expect(forwarded).toHaveLength(3)
    expect(approvals).toEqual([])
  })
})
