// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { closeProcess, type ClosingDeps } from "./processClosing"
import type { ProcessRow } from "./processes"
import { NeedsLaravel } from "./snapshotDocuments"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const PROCESS = "cd000000-0000-4000-8000-000000000001"
const DRAFT = "50000000-0000-4000-8000-000000000001"
const UNSTARTED = "50000000-0000-4000-8000-000000000002"

let world: FakeWorld
let forwarded: Request[]
let process: ProcessRow | null
let lockedState: string | null
let syllabi: { id: string; context: unknown }[]
let snapshot: (id: string) => Record<string, unknown>
let log: string[]

function deps(): ClosingDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    processes: { find: async (id) => (process !== null && process.id === id ? process : null) },
    now: () => NOW,
    async transaction(work) {
      log.push("begin")
      const result = await work({
        lockProcess: async (id) => {
          log.push(`lock:process:${id}`)
          return lockedState
        },
        closeProcess: async (id, keepPausedAt) => void log.push(`close:${id}:${keepPausedAt}`),
        lockOpenSyllabi: async (id) => {
          log.push(`lock:syllabi:${id}`)
          return syllabi
        },
        snapshot: async (id) => snapshot(id),
        storeContext: async (id, context) => void log.push(`context:${id}:${JSON.stringify(context)}`),
        closeConvocations: async (id) => void log.push(`convocations:${id}`),
      })
      log.push("commit")
      return result
    },
  }
}

async function close(body: unknown = {}, id = PROCESS) {
  const request = new Request(
    apiRequest(`/api/v1/admin/processes/${id}/cerrar`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify(body) },
  )
  const response = await closeProcess(request, id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

beforeEach(() => {
  forwarded = []
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })],
  }
  process = { id: PROCESS, state: "abierto", period: "2026-2", periodId: "p", periodEndsOn: "2027-03-01", startsOn: "2026-11-01", dueOn: "2026-12-01", convocationsCount: 2, extensions: 0 }
  lockedState = "abierto"
  syllabi = [
    { id: DRAFT, context: { career: { name: "Software" } } },
    { id: UNSTARTED, context: [] },
  ]
  snapshot = (id) => ({ schema_version: 9, syllabus: id })
  log = []
})

describe("POST admin/processes/{p}/cerrar", () => {
  it("freezes the unsent syllabi, closes the convocations and the process", async () => {
    expect(await close()).toMatchObject({ status: 200, json: { message: "Convocatoria cerrada. Sus sílabos quedan solo para consulta." } })
    expect(log).toEqual([
      "begin",
      `lock:process:${PROCESS}`,
      `close:${PROCESS}:false`,
      `lock:syllabi:${PROCESS}`,
      `context:${DRAFT}:${JSON.stringify({ career: { name: "Software" }, closed_document: { schema_version: 9, syllabus: DRAFT } })}`,
      `context:${UNSTARTED}:${JSON.stringify({ closed_document: { schema_version: 9, syllabus: UNSTARTED } })}`,
      `convocations:${PROCESS}`,
      "commit",
    ])
  })

  it("keeps the pause moment when it closes a paused process", async () => {
    process = { ...process!, state: "pausado" }
    lockedState = "pausado"
    await close()
    expect(log).toContain(`close:${PROCESS}:true`)
  })

  it("only lets Administration close an open or paused process", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect((await close()).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })]
    process = { ...process!, state: "cerrado" }
    expect((await close()).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("validates the confirmation flag and the state under the lock", async () => {
    expect((await close({ confirmar_rehacer: "quizás" })).json).toEqual({
      message: "El campo confirmación para rehacer los sílabos debe ser verdadero o falso.",
      errors: { confirmar_rehacer: ["El campo confirmación para rehacer los sílabos debe ser verdadero o falso."] },
    })
    lockedState = "cerrado"
    expect((await close()).json).toEqual({ message: "El proceso no está en un estado que admita esta acción.", errors: { process: ["El proceso no está en un estado que admita esta acción."] } })
  })

  it("answers Laravel's model 404 for an unknown or malformed process", async () => {
    expect(await close({}, "cd000000-0000-4000-8000-00000000ffff")).toMatchObject({ status: 404, text: modelNotFound("SyllabusProcess", "cd000000-0000-4000-8000-00000000ffff") })
    expect(await close({}, "abc")).toMatchObject({ status: 404, text: modelNotFound("SyllabusProcess", "abc") })
  })

  it("hands the whole closing to Laravel when a snapshot cannot be built here", async () => {
    snapshot = () => {
      throw new NeedsLaravel()
    }
    expect((await close()).status).toBe(299)
  })
})
