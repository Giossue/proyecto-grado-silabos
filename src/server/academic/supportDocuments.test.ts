// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { coordinationSupportDocuments, teacherSupportDocuments, type SupportDocumentRecord, type SupportDocumentRepository } from "./supportDocuments"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
const FORBIDDEN = '{"message":""}'

let world: FakeWorld
let activeCareers: Set<string>
let documents: Map<string, SupportDocumentRecord[]>

const repository = (): SupportDocumentRepository => ({
  careerActive: async (id) => activeCareers.has(id),
  forCareer: async (id) => documents.get(id) ?? [],
})

const deps = () => ({ bridge: fakeDeps(world), documents: repository() })

function asRole(role: string, careerId: string | null = CAREER) {
  world.assignments = [makeAssignment({ role, careerId })]
}

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  activeCareers = new Set([CAREER, OTHER])
  documents = new Map([
    [
      CAREER,
      [
        { id: "d-1", title: "Proyecto de carrera", size: 1024, view: "lista", uploadedAt: "2026-11-23T15:04:05+00:00" },
        { id: "d-2", title: "Malla", size: 20971520, view: "pendiente", uploadedAt: "2026-11-22T00:00:00+00:00" },
      ],
    ],
    [OTHER, [{ id: "d-9", title: "Ajeno", size: 1, view: "sin_vista", uploadedAt: "2026-11-22T00:00:00+00:00" }]],
  ])
})

const LIST =
  '{"data":[{"id":"d-1","title":"Proyecto de carrera","size":1024,"view":"lista","uploaded_at":"2026-11-23T15:04:05+00:00"},' +
  '{"id":"d-2","title":"Malla","size":20971520,"view":"pendiente","uploaded_at":"2026-11-22T00:00:00+00:00"}]}'

describe("GET /api/v1/teacher/support-documents", () => {
  const request = () => apiRequest("/api/v1/teacher/support-documents", { cookie })

  it.each(["docente", "coordinador"])("lists the documents of the %s's career only", async (role) => {
    asRole(role)
    expect(await read(await teacherSupportDocuments(request(), deps()))).toEqual({ status: 200, text: LIST })
  })

  it("answers an empty list to a teacher of a career without documents", async () => {
    documents.delete(OTHER)
    asRole("docente", OTHER)
    expect(await read(await teacherSupportDocuments(request(), deps()))).toEqual({ status: 200, text: '{"data":[]}' })
  })

  it("answers 403 to the library, to the administrator and to an inactive career", async () => {
    asRole("bibliotecario", null)
    expect(await read(await teacherSupportDocuments(request(), deps()))).toEqual({ status: 403, text: FORBIDDEN })
    asRole("administrador", null)
    expect(await read(await teacherSupportDocuments(request(), deps()))).toEqual({ status: 403, text: FORBIDDEN })
    asRole("docente")
    activeCareers.delete(CAREER)
    expect(await read(await teacherSupportDocuments(request(), deps()))).toEqual({ status: 403, text: FORBIDDEN })
  })
})

describe("GET /api/v1/coordination/support-documents", () => {
  const request = () => apiRequest("/api/v1/coordination/support-documents", { cookie })

  it("lists the coordinator's career documents", async () => {
    asRole("coordinador")
    expect(await read(await coordinationSupportDocuments(request(), deps()))).toEqual({ status: 200, text: LIST })
  })

  it("answers 403 to a teacher", async () => {
    asRole("docente")
    expect(await read(await coordinationSupportDocuments(request(), deps()))).toEqual({ status: 403, text: FORBIDDEN })
  })

  it("answers 401 without a session", async () => {
    expect(await read(await coordinationSupportDocuments(apiRequest("/api/v1/coordination/support-documents"), deps()))).toEqual({
      status: 401,
      text: '{"message":"Unauthenticated."}',
    })
  })
})
