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
const CLOSING_REFUSED = "No se puede cerrar la malla: sus materias tienen sílabos en un proceso de sílabos abierto."

let world: FakeWorld
let log: string[]
let mallas: MallaRecord[]
let withOpenSyllabi: Set<string>

const malla = (id: string, careerId: string, code: string, state: string, cycleCount = 8, subjectCount = 0): MallaRecord => ({
  id,
  careerId,
  code,
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
    mallaCodeTaken: async (careerId, code, except) => mallas.some((item) => item.careerId === careerId && item.code === code && item.id !== except),
    async transaction(work) {
      log.push("begin")
      try {
        const result = await work({
          lockMalla: async (careerId, id) => mallas.find((item) => item.careerId === careerId && item.id === id) ?? null,
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
    malla(OLD, CAREER, "2015", "cerrada", 10, 2),
    // A stray resolution on the record must never reach the payload.
    { ...malla(CURRENT, CAREER, "SW-9", "vigente", 3, 6), resolution: "RCU-2022-043" } as MallaRecord,
    malla(PREVIOUS, CAREER, "SW-8", "cerrada", 4, 7),
    malla(FOREIGN, OTHER_CAREER, "RED", "vigente", 8, 1),
  ]
})

describe("GET /api/v1/coordination/academic/mallas", () => {
  it("lists the mallas of the career by code, vigente first then cerradas by code, without a name or a resolution", async () => {
    const response = await list()
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      mallas: [
        { id: CURRENT, code: "SW-9", cycle_count: 3, state: "vigente", subject_count: 6 },
        { id: OLD, code: "2015", cycle_count: 10, state: "cerrada", subject_count: 2 },
        { id: PREVIOUS, code: "SW-8", cycle_count: 4, state: "cerrada", subject_count: 7 },
      ],
    })
  })

  it("lists several vigente mallas first, by code, then the cerradas by code", async () => {
    mallas.push(malla(NEW_ID, CAREER, "2026", "vigente", 9, 0))
    const response = await list()
    expect((response.json?.mallas as { id: string; state: string }[]).map((item) => [item.id, item.state])).toEqual([
      [NEW_ID, "vigente"],
      [CURRENT, "vigente"],
      [OLD, "cerrada"],
      [PREVIOUS, "cerrada"],
    ])
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
  it("creates a vigente malla with its trimmed code, ignoring a name, a resolution and a state", async () => {
    const response = await create({ code: "  2026  ", name: "Malla 2026", resolution: "RCU-2026-010", cycle_count: 9, state: "cerrada" })
    expect(response.status).toBe(201)
    expect(response.json).toEqual({ message: "Malla creada.", id: NEW_ID })
    expect(log).toEqual(["begin", `insert:${CAREER}:${JSON.stringify({ code: "2026", cycleCount: 9, state: "vigente" })}`, "commit"])
  })

  it("asks for the code: a name alone does not create a malla", async () => {
    const response = await create({ name: "Malla 2026", cycle_count: 9 })
    expect(response.status).toBe(422)
    expect(response.json?.errors).toEqual({ code: ["El campo código es obligatorio."] })
    expect(log).toEqual([])
  })

  it("asks only for the code and the cycles", async () => {
    const response = await create({})
    expect(response.json?.errors).toEqual({ code: ["El campo código es obligatorio."], cycle_count: ["El campo cantidad de ciclos es obligatorio."] })
    expect(log).toEqual([])
  })

  it("a second vigente malla coexists with the current vigente one: nothing is closed", async () => {
    const response = await create({ code: "2026", cycle_count: 9 })
    expect(response.status).toBe(201)
    expect(response.json).toEqual({ message: "Malla creada.", id: NEW_ID })
    expect(log).toEqual(["begin", `insert:${CAREER}:${JSON.stringify({ code: "2026", cycleCount: 9, state: "vigente" })}`, "commit"])
  })

  it("creates a vigente malla even when the current vigente one has syllabi in an open period", async () => {
    withOpenSyllabi.add(CURRENT)
    const response = await create({ code: "2026", cycle_count: 9 })
    expect(response.status).toBe(201)
    expect(log).toEqual(["begin", `insert:${CAREER}:${JSON.stringify({ code: "2026", cycleCount: 9, state: "vigente" })}`, "commit"])
  })

  it("refuses a code already used in the career (also with spaces around), but accepts a code used by another career", async () => {
    const duplicate = await create({ code: " SW-8 ", cycle_count: 4 })
    expect(duplicate.status).toBe(422)
    expect(duplicate.json?.errors).toEqual({ code: ["Ya existe una malla con ese código en esta carrera."] })
    expect((await create({ code: "RED", cycle_count: 4 })).status).toBe(201)
  })
})

describe("PATCH /api/v1/coordination/academic/mallas/{malla}", () => {
  it("changes the code, ignoring a name and a resolution and writing only what changed", async () => {
    const response = await patch(PREVIOUS, { code: " 2019 ", name: "Malla 2019", resolution: "RCU-2019-001", state: "cerrada" })
    expect(response.json).toEqual({ message: "Malla actualizada." })
    expect(log).toEqual(["begin", `update:${PREVIOUS}:${JSON.stringify({ codigo_malla: "2019" })}`, "commit"])
  })

  it("refuses the removed en_transicion state", async () => {
    const response = await patch(PREVIOUS, { state: "en_transicion" })
    expect(response.json?.errors).toEqual({ state: ["El valor seleccionado en estado no es válido."] })
    expect(log).toEqual([])
  })

  it("a name alone changes nothing", async () => {
    const response = await patch(PREVIOUS, { name: "Malla 2019" })
    expect(response.json).toEqual({ message: "Malla actualizada." })
    expect(log).toEqual(["begin", "commit"])
  })

  it("reopening a closed malla as vigente leaves the other vigente malla untouched", async () => {
    withOpenSyllabi.add(CURRENT)
    const response = await patch(PREVIOUS, { state: "vigente" })
    expect(response.status).toBe(200)
    expect(response.json).toEqual({ message: "Malla actualizada." })
    expect(log).toEqual(["begin", `update:${PREVIOUS}:${JSON.stringify({ estado_malla: "vigente" })}`, "commit"])
  })

  it("refuses to close a malla whose subjects have syllabi in an open period", async () => {
    withOpenSyllabi.add(CURRENT)
    const refused = await patch(CURRENT, { state: "cerrada" })
    expect(refused.status).toBe(422)
    expect(refused.json?.errors).toEqual({ state: [CLOSING_REFUSED] })
    expect(log).toEqual(["begin", "rollback"])
    log = []
    withOpenSyllabi.clear()
    expect((await patch(CURRENT, { state: "cerrada" })).status).toBe(200)
    expect(log).toEqual(["begin", `update:${CURRENT}:${JSON.stringify({ estado_malla: "cerrada" })}`, "commit"])
  })

  it("refuses a duplicate code and answers 404 for a malla of another career", async () => {
    expect((await patch(PREVIOUS, { code: "SW-9" })).json?.errors).toEqual({ code: ["Ya existe una malla con ese código en esta carrera."] })
    expect((await patch(PREVIOUS, { code: "SW-8" })).status).toBe(200)
    const foreign = await patch(FOREIGN, { code: "Otra" })
    expect(foreign.status).toBe(404)
    expect(log.filter((line) => line.startsWith("update"))).toEqual([])
  })
})
