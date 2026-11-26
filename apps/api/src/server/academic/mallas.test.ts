// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { createMalla, listMallas, updateMalla, type MallaDeps } from "./mallas"
import type { MallaRecord } from "./structure"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
const CURRENT = "01a1c5bc-9000-7000-8000-000000000001"
const PREVIOUS = "01a1c5bc-9000-7000-8000-000000000002"
const OLD = "01a1c5bc-9000-7000-8000-000000000003"
const FOREIGN = "01a1c5bc-9000-7000-8000-000000000004"
const NEW_ID = "01a2aaaa-0000-7000-8000-000000000009"
const CLOSING_REFUSED = "No se puede cerrar la malla: sus materias tienen sílabos en un periodo académico abierto."

let world: FakeWorld
let log: string[]
let mallas: MallaRecord[]
let withOpenSyllabi: Set<string>

const malla = (id: string, careerId: string, name: string, state: string, cycleCount = 8, subjectCount = 0): MallaRecord => ({
  id,
  careerId,
  name,
  resolution: null,
  cycleCount,
  state,
  subjectCount,
})

function deps(): MallaDeps {
  return {
    bridge: fakeDeps(world),
    careerActive: async (id) => id === CAREER || id === OTHER_CAREER,
    mallas: {
      mallas: async (careerId) => mallas.filter((item) => item.careerId === careerId),
      malla: async (careerId, id) => mallas.find((item) => item.careerId === careerId && item.id === id) ?? null,
    },
    mallaNameTaken: async (careerId, name, except) => mallas.some((item) => item.careerId === careerId && item.name === name && item.id !== except),
    async transaction(work) {
      log.push("begin")
      try {
        const result = await work({
          lockCareer: async (careerId) => void log.push(`lock-career:${careerId}`),
          lockMalla: async (careerId, id) => mallas.find((item) => item.careerId === careerId && item.id === id) ?? null,
          demoteVigente: async (careerId, except) => void log.push(`demote:${careerId}:${except ?? "null"}`),
          insertMalla: async (careerId, data) => {
            log.push(`insert:${careerId}:${JSON.stringify(data)}`)
            return NEW_ID
          },
          updateMalla: async (id, columns) => void log.push(`update:${id}:${JSON.stringify(columns)}`),
          hasOpenPeriodSyllabi: async (id) => withOpenSyllabi.has(id),
        })
        log.push("commit")
        return result
      } catch (error) {
        log.push("rollback")
        throw error
      }
    },
  }
}

async function send(method: string, path: string, body: unknown, handler: (request: Request) => Promise<Response>) {
  const request = new Request(apiRequest(path, { cookie, method, headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }), {
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await handler(request)
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const BASE = "/api/v1/coordination/academic/mallas"
const list = () => send("GET", BASE, undefined, (request) => listMallas(request, deps()))
const create = (body: unknown) => send("POST", BASE, body, (request) => createMalla(request, deps()))
const patch = (id: string, body: unknown) => send("PATCH", `${BASE}/${id}`, body, (request) => updateMalla(request, id, deps()))

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  log = []
  withOpenSyllabi = new Set()
  mallas = [
    malla(OLD, CAREER, "Malla 2015", "cerrada", 10, 2),
    malla(CURRENT, CAREER, "Malla SW-9", "vigente", 3, 6),
    malla(PREVIOUS, CAREER, "Malla SW-8", "en_transicion", 4, 7),
    malla(FOREIGN, OTHER_CAREER, "Malla RED", "vigente", 8, 1),
  ]
})

describe("GET /api/v1/coordination/academic/mallas", () => {
  it("lists the mallas of the career: vigente, en transición, then cerrada", async () => {
    const response = await list()
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      mallas: [
        { id: CURRENT, name: "Malla SW-9", resolution: null, cycle_count: 3, state: "vigente", subject_count: 6 },
        { id: PREVIOUS, name: "Malla SW-8", resolution: null, cycle_count: 4, state: "en_transicion", subject_count: 7 },
        { id: OLD, name: "Malla 2015", resolution: null, cycle_count: 10, state: "cerrada", subject_count: 2 },
      ],
    })
  })

  it("is forbidden for a teacher and gives the administrator the requested career", async () => {
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await list()).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })]
    const admin = await send("GET", `/api/v1/admin/careers/${OTHER_CAREER}/academic/mallas`, undefined, (request) => listMallas(request, deps(), OTHER_CAREER))
    expect((admin.json?.mallas as { id: string }[]).map((item) => item.id)).toEqual([FOREIGN])
  })
})

describe("POST /api/v1/coordination/academic/mallas", () => {
  it("creates a malla in the career", async () => {
    const response = await create({ name: "Malla 2026", resolution: "RCU-2026-010", cycle_count: 9, state: "en_transicion" })
    expect(response.status).toBe(201)
    expect(response.json).toEqual({ message: "Malla creada.", id: NEW_ID })
    expect(log).toEqual(["begin", `lock-career:${CAREER}`, `insert:${CAREER}:${JSON.stringify({ name: "Malla 2026", resolution: "RCU-2026-010", cycleCount: 9, state: "en_transicion" })}`, "commit"])
  })

  it("a new vigente malla turns the previous vigente one into en transición", async () => {
    await create({ name: "Malla 2026", cycle_count: 9, state: "vigente" })
    expect(log).toEqual(["begin", `lock-career:${CAREER}`, `demote:${CAREER}:null`, `insert:${CAREER}:${JSON.stringify({ name: "Malla 2026", resolution: null, cycleCount: 9, state: "vigente" })}`, "commit"])
  })

  it("refuses a name already used in the career, but accepts a name used by another career", async () => {
    expect((await create({ name: "Malla SW-8", cycle_count: 4, state: "en_transicion" })).json?.errors).toEqual({ name: ["Ya existe una malla con ese nombre en esta carrera."] })
    expect((await create({ name: "Malla RED", cycle_count: 4, state: "en_transicion" })).status).toBe(201)
  })
})

describe("PATCH /api/v1/coordination/academic/mallas/{malla}", () => {
  it("renames and records the resolution, writing only what changed", async () => {
    const response = await patch(PREVIOUS, { name: "Malla 2019", resolution: "RCU-2019-001", state: "en_transicion" })
    expect(response.json).toEqual({ message: "Malla actualizada." })
    expect(log).toEqual(["begin", `update:${PREVIOUS}:${JSON.stringify({ nombre_malla: "Malla 2019", resolucion_malla: "RCU-2019-001" })}`, "commit"])
  })

  it("making a malla vigente turns the previous vigente one into en transición", async () => {
    await patch(PREVIOUS, { state: "vigente" })
    expect(log).toEqual(["begin", `lock-career:${CAREER}`, `demote:${CAREER}:${PREVIOUS}`, `update:${PREVIOUS}:${JSON.stringify({ estado_malla: "vigente" })}`, "commit"])
  })

  it("refuses to close a malla whose subjects have syllabi in an open period", async () => {
    withOpenSyllabi.add(PREVIOUS)
    const refused = await patch(PREVIOUS, { state: "cerrada" })
    expect(refused.status).toBe(422)
    expect(refused.json?.errors).toEqual({ state: [CLOSING_REFUSED] })
    expect(log).toEqual(["begin", "rollback"])
    log = []
    withOpenSyllabi.clear()
    expect((await patch(PREVIOUS, { state: "cerrada" })).status).toBe(200)
    expect(log).toContain(`update:${PREVIOUS}:${JSON.stringify({ estado_malla: "cerrada" })}`)
  })

  it("refuses a duplicate name and answers 404 for a malla of another career", async () => {
    expect((await patch(PREVIOUS, { name: "Malla SW-9" })).json?.errors).toEqual({ name: ["Ya existe una malla con ese nombre en esta carrera."] })
    expect((await patch(PREVIOUS, { name: "Malla SW-8" })).status).toBe(200)
    const foreign = await patch(FOREIGN, { name: "Otra" })
    expect(foreign.status).toBe(404)
    expect(log.filter((line) => line.startsWith("update"))).toEqual([])
  })
})
