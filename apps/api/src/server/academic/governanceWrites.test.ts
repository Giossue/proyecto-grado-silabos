// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { decodePng } from "../files/png"
import { createStorageWriter, type StorageWriter } from "../http/storageWriter"
import type { StoredObjectInput } from "./supportDocumentWrites"
import { GenerationRejected, purgeRequired } from "../syllabus/inProgressWorkHelpers"
import {
  createGovernanceRecord,
  periodLabel,
  postGovernanceRecord,
  periodWeeks,
  setGovernanceStatus,
  updateGovernanceRecord,
  type CareerData,
  type CareerRow,
  type FacultyRow,
  type GovernanceWriteDeps,
  type PeriodData,
  type PeriodRow,
} from "./governanceWrites"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const FACULTY = "01a1c5bc-798f-72af-b64b-3cd174a1687b"
const OTHER_FACULTY = "01a1c5bc-798f-72af-b64b-000000000fac"
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const PERIOD = "01a1c5bc-79d3-730d-84f4-6a91c41c8a75"
const NEW_ID = "01a2aaaa-0000-7000-8000-000000000001"

let world: FakeWorld
let log: string[]
let faculties: Map<string, FacultyRow & { active: boolean }>
let careers: Map<string, CareerRow & { active: boolean; roles: boolean; inProgress: boolean }>
let periods: Map<string, PeriodRow & { running: boolean }>
let created: (CareerData | PeriodData)[]
let purge: Record<string, string[]> | null
let finalized: boolean
let root: string
let storage: StorageWriter
let objects: StoredObjectInput[]
let createdFaculties: unknown[]

function deps(): GovernanceWriteDeps {
  return {
    bridge: fakeDeps(world),
    now: () => NOW,
    activeFacultyExists: async (id) => faculties.get(id)?.active === true,
    facultyExists: async (id) => faculties.has(id),
    careerCodeTaken: async (code, except) => [...careers.values()].some((career) => career.code === code && career.id !== except),
    deletions: { bridge: fakeDeps(world), store: { careerActive: async () => true, transaction: async () => Promise.reject(new Error("unused")) } },
    files: { storage, newObjectId: () => "01a2aaaa-0000-7000-8000-00000000f11e", newLogoId: () => "6b1d0c1e-3a5f-4c2b-9d8e-7f6a5b4c3d2e" },
    async transaction(work) {
      log.push("begin")
      try {
        const result = await work({
          createCareer: async (data) => (created.push(data), NEW_ID),
          createPeriod: async (data) => (created.push(data), NEW_ID),
          createFaculty: async (data) => (createdFaculties.push(data), NEW_ID),
          insertObject: async (row) => void objects.push(row),
          lockFaculty: async (id) => faculties.get(id) ?? null,
          lockCareer: async (id) => careers.get(id) ?? null,
          lockPeriod: async (id) => periods.get(id) ?? null,
          lockActiveFaculty: async (id) => faculties.get(id)?.active === true,
          careersOfFaculty: async (id) => [...careers.values()].filter((career) => career.facultyId === id).map((career) => career.id),
          periodRunning: async (id) => periods.get(id)?.running === true,
          updateColumns: async (entity, id, columns) => void log.push(`update:${entity}:${id}:${JSON.stringify(columns)}`),
          facultyHasActiveCareers: async (id) => [...careers.values()].some((career) => career.facultyId === id && career.active),
          careerInProgress: async (id) => careers.get(id)?.inProgress === true,
          retireCareerUsers: async (id) => {
            log.push(`retire:${id}`)
            return careers.get(id)?.roles === true ? 2 : 0
          },
          setActive: async (entity, id, active) => void log.push(`active:${entity}:${id}:${active}`),
          replace: async (confirmed, change, periodId) => {
            log.push(`replace:${confirmed}:${periodId}`)
            if (periodId !== null && purge !== null && !confirmed) throw new GenerationRejected(purge)
            return change()
          },
          guard: async (confirmed, careerIds, change, periodId) => {
            log.push(`guard:${confirmed}:${careerIds?.join(",") ?? "null"}:${periodId}`)
            const result = await change()
            if (finalized && !confirmed) throw new GenerationRejected({ purge_required: ["finalizada"], purge_count: ["0"], purge_mode: ["convocatoria_finalizada"] })
            return result
          },
          sync: async (confirmed, careerIds) => void log.push(`sync:${confirmed}:${careerIds.join(",")}`),
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
    body: JSON.stringify(body),
  })
  const response = await handler(request)
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const create = (entity: string, body: unknown) => send("POST", `/api/v1/admin/academic/${entity}`, body, (request) => createGovernanceRecord(request, entity, deps()))
const update = (entity: string, id: string, body: unknown) =>
  send("PATCH", `/api/v1/admin/academic/${entity}/${id}`, body, (request) => updateGovernanceRecord(request, entity, id, deps()))
const status = (entity: string, id: string, body: unknown) =>
  send("PATCH", `/api/v1/admin/academic/${entity}/${id}/status`, body, (request) => setGovernanceStatus(request, entity, id, deps()))
const careerBody = { faculty_id: FACULTY, modality: "presencial", code: "SW-8", nombre: "Software" }

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  root = mkdtempSync(path.join(tmpdir(), "silabos-facultad-"))
  storage = createStorageWriter(root)
  objects = []
  createdFaculties = []
  log = []
  created = []
  purge = null
  finalized = false
  faculties = new Map([
    [FACULTY, { id: FACULTY, name: "Facultad de Ciencias", libraries: "[]", active: true }],
    [OTHER_FACULTY, { id: OTHER_FACULTY, name: "Facultad Nueva", libraries: '["UEB"]', active: true }],
  ])
  careers = new Map([[CAREER, { id: CAREER, facultyId: FACULTY, code: "SW-8", name: "Software", modality: "presencial", active: true, roles: false, inProgress: false }]])
  periods = new Map([[PERIOD, { id: PERIOD, code: "Noviembre-Marzo 2026-2027", startsOn: "2026-11-02", endsOn: "2027-03-12", weeks: 16, running: false }]])
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const logo = (name: string) => readFileSync(path.join(__dirname, "..", "files", "__fixtures__", "logos", name))

async function sendForm(method: string, url: string, fields: Record<string, string>, file: { name: string; content: Buffer } | null, handler: (request: Request) => Promise<Response>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  if (file !== null) form.append("logo", new File([new Uint8Array(file.content)], file.name))
  const base = apiRequest(url, { cookie, method, headers: { "x-csrf-token": golden.csrfToken } })
  const response = await handler(new Request(base, { body: form }))
  const text = await response.text()
  return { status: response.status, text }
}

describe("faculties with their logo", () => {
  const LOGO_PATH = `logos/facultades/${NEW_ID}/6b1d0c1e-3a5f-4c2b-9d8e-7f6a5b4c3d2e.png`

  it("creates a faculty with its catalog libraries and its logo fitted to 600 x 180", async () => {
    const response = await sendForm("POST", "/api/v1/admin/academic/facultad", { nombre: "Facultad de Salud", catalog_libraries: '["UEB","SALUD"]' }, { name: "logo.png", content: logo("rgba-800x400.png") }, (request) =>
      createGovernanceRecord(request, "facultad", deps()),
    )
    expect(response).toEqual({ status: 201, text: `{"message":"Registro institucional creado.","id":"${NEW_ID}"}` })
    expect(createdFaculties).toEqual([{ name: "Facultad de Salud", libraries: ["UEB", "SALUD"] }])
    const stored = readFileSync(storage.path("private", LOGO_PATH))
    expect([decodePng(stored).width, decodePng(stored).height]).toEqual([600, 180])
    expect(statSync(storage.path("private", LOGO_PATH)).mode & 0o777).toBe(0o600)
    expect(objects).toEqual([
      expect.objectContaining({ id: "01a2aaaa-0000-7000-8000-00000000f11e", disk: "private", path: LOGO_PATH, name: `logo-facultad-${NEW_ID}.png`, mime: "image/png", size: stored.length, classification: "logo_facultad", ownerId: null }),
    ])
    expect(log).toContain(`update:facultad:${NEW_ID}:${JSON.stringify({ logo_archivo_id: "01a2aaaa-0000-7000-8000-00000000f11e" })}`)
  })

  it("requires a transparent PNG logo when creating, and no longer asks for a campus", async () => {
    expect(await sendForm("POST", "/api/v1/admin/academic/facultad", { nombre: "F" }, null, (request) => createGovernanceRecord(request, "facultad", deps()))).toEqual({
      status: 422,
      text: '{"message":"El campo logotipo es obligatorio.","errors":{"logo":["El campo logotipo es obligatorio."]}}',
    })
    expect(await sendForm("POST", "/api/v1/admin/academic/facultad", { nombre: "F" }, { name: "logo.png", content: logo("opaque-64.png") }, (request) => createGovernanceRecord(request, "facultad", deps()))).toEqual({
      status: 422,
      text: '{"message":"El logo debe ser un PNG sin fondo (con transparencia).","errors":{"logo":["El logo debe ser un PNG sin fondo (con transparencia)."]}}',
    })
    expect(createdFaculties).toEqual([])
    expect(objects).toEqual([])
  })

  it("ignores a campus sent by an old client: the faculty is created without one", async () => {
    const response = await sendForm("POST", "/api/v1/admin/academic/facultad", { nombre: "Facultad de Salud", campus: "Campus Laguacoto" }, { name: "logo.png", content: logo("rgba-800x400.png") }, (request) =>
      createGovernanceRecord(request, "facultad", deps()),
    )
    expect(response.status).toBe(201)
    expect(createdFaculties).toEqual([{ name: "Facultad de Salud", libraries: [] }])
  })

  it("replaces the logo of a faculty sent as POST with _method=PATCH", async () => {
    const response = await sendForm("POST", `/api/v1/admin/academic/facultad/${FACULTY}`, { _method: "PATCH", nombre: "Facultad renovada" }, { name: "logo.png", content: logo("ga-300x300.png") }, (request) =>
      postGovernanceRecord(request, "facultad", FACULTY, deps()),
    )
    expect(response).toEqual({ status: 200, text: '{"message":"Datos institucionales actualizados."}' })
    const logoPath = `logos/facultades/${FACULTY}/6b1d0c1e-3a5f-4c2b-9d8e-7f6a5b4c3d2e.png`
    expect(await storage.exists("private", logoPath)).toBe(true)
    expect(log).toContain(`update:facultad:${FACULTY}:${JSON.stringify({ nombre_facultad: "Facultad renovada", logo_archivo_id: "01a2aaaa-0000-7000-8000-00000000f11e" })}`)
    expect(log).toContain(`sync:false:${CAREER}`)
  })

  it("rejects a logo that is not a file when updating", async () => {
    expect((await update("facultad", FACULTY, { nombre: "F", logo: "archivo" })).json?.errors).toEqual({
      logo: ["El campo logotipo debe ser un archivo.", "El campo logotipo debe ser un archivo de tipo: image/png.", "Suba un archivo PNG."],
    })
  })
})

describe("POST /api/v1/admin/academic/{entity}", () => {
  it("the administrator creates a career with its code and cycle count", async () => {
    const response = await create("carrera", { faculty_id: FACULTY, modality: "presencial", code: "SW-10", nombre: "Software nueva", cycle_count: "8" })
    expect(response.status).toBe(201)
    expect(response.text).toBe(`{"message":"Registro institucional creado.","id":"${NEW_ID}"}`)
    expect(created).toEqual([{ facultyId: FACULTY, modality: "presencial", code: "SW-10", name: "Software nueva", cycleCount: 8 }])
  })

  it("rejects a career without code or cycle count, a taken code and an inactive faculty", async () => {
    expect((await create("carrera", { faculty_id: FACULTY, modality: "presencial", nombre: "X" })).json?.errors).toEqual({
      code: ["El campo código es obligatorio."],
      cycle_count: ["El campo cantidad de ciclos es obligatorio."],
    })
    expect((await create("carrera", { ...careerBody, cycle_count: 8 })).json?.errors).toEqual({ code: ["Ya existe una carrera con ese código."] })
    faculties.set(FACULTY, { ...(faculties.get(FACULTY) as FacultyRow & { active: boolean }), active: false })
    expect((await create("carrera", { ...careerBody, code: "SW-11", cycle_count: 8 })).json?.errors).toEqual({ faculty_id: ["El valor seleccionado en facultad no es válido."] })
    expect(log).toEqual([])
  })

  it("creates a period whose weeks come from the dates unless corrected, named after its months", async () => {
    expect(periodWeeks("2027-04-05", "2027-08-20")).toBe(20)
    expect(periodLabel("2026-11-02", "2027-03-12")).toBe("NOVIEMBRE-MARZO 2026-2027")
    expect(periodLabel("2026-08-03", "2026-12-18")).toBe("AGOSTO-DICIEMBRE 2026")
    expect((await create("periodo", { starts_on: "2027-04-05", ends_on: "2027-08-20" })).status).toBe(201)
    expect((await create("periodo", { starts_on: "2027-04-05", ends_on: "2027-08-20", teaching_weeks: 16 })).status).toBe(201)
    expect(created).toEqual([
      { code: "ABRIL-AGOSTO 2027", startsOn: "2027-04-05", endsOn: "2027-08-20", weeks: 20 },
      { code: "ABRIL-AGOSTO 2027", startsOn: "2027-04-05", endsOn: "2027-08-20", weeks: 16 },
    ])
  })

  it("rejects inverted dates, a range longer than 52 calendar weeks and more class weeks than the range", async () => {
    expect((await create("periodo", { starts_on: "2027-08-05", ends_on: "2027-04-20" })).json?.errors).toEqual({
      ends_on: ["La fecha de fin debe ser igual o posterior a la fecha de inicio."],
    })
    expect((await create("periodo", { starts_on: "2027-01-04", ends_on: "2028-02-20" })).json?.errors).toEqual({ ends_on: ["El período no puede superar 52 semanas calendario."] })
    expect((await create("periodo", { starts_on: "2027-04-05", ends_on: "2027-05-20", teaching_weeks: 20 })).json?.errors).toEqual({
      teaching_weeks: ["Las semanas de clase no pueden superar las 7 semanas entre las fechas."],
    })
    expect((await create("periodo", { starts_on: "2027-02-30", ends_on: "2027-03-20" })).json?.errors).toEqual({ starts_on: ["El campo fecha de inicio debe ser una fecha válida."] })
  })

  it("is forbidden for a coordinator and reads dates like the date rule and Carbon", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await create("carrera", { ...careerBody, cycle_count: 8 })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    expect((await create("facultad", { nombre: "F" })).json?.errors).toEqual({ logo: ["El campo logotipo es obligatorio."] })
    expect((await create("periodo", { starts_on: "next monday", ends_on: "2027-03-20" })).json?.errors).toEqual({ starts_on: ["El campo fecha de inicio debe ser una fecha válida."] })
    expect((await create("periodo", { starts_on: "2026-13-01", ends_on: "2027-02-30" })).json?.errors).toEqual({
      starts_on: ["El campo fecha de inicio debe ser una fecha válida."],
      ends_on: ["El campo fecha de fin debe ser una fecha válida."],
    })
  })
})

describe("PATCH /api/v1/admin/academic/{entity}/{record}", () => {
  it("updates only what changed in a career and keeps its syllabi in sync", async () => {
    const response = await update("carrera", CAREER, { ...careerBody, faculty_id: OTHER_FACULTY, modality: "en_linea", nombre: "Software renovada" })
    expect(response.text).toBe('{"message":"Datos institucionales actualizados."}')
    expect(log).toEqual([
      "begin",
      `guard:false:${CAREER}:null`,
      `update:carrera:${CAREER}:${JSON.stringify({ facultad_id: OTHER_FACULTY, nombre_carrera: "Software renovada", modalidad_carrera: "en_linea" })}`,
      `sync:false:${CAREER}`,
      "commit",
    ])
  })

  it("does not write when nothing changed, and needs an active faculty to move a career", async () => {
    expect((await update("carrera", CAREER, careerBody)).status).toBe(200)
    expect(log.filter((entry) => entry.startsWith("update:"))).toEqual([])
    faculties.set(OTHER_FACULTY, { ...(faculties.get(OTHER_FACULTY) as FacultyRow & { active: boolean }), active: false })
    expect((await update("carrera", CAREER, { ...careerBody, faculty_id: OTHER_FACULTY })).json?.errors).toEqual({
      faculty_id: ["Seleccione una facultad activa para reasignar la carrera."],
    })
  })

  it("warns about a finalized convocation and passes confirm_purge to the guard", async () => {
    finalized = true
    expect((await update("carrera", CAREER, { ...careerBody, nombre: "Otra" })).json?.errors).toEqual({
      purge_required: ["finalizada"],
      purge_count: ["0"],
      purge_mode: ["convocatoria_finalizada"],
    })
    expect(log.at(-1)).toBe("rollback")
    expect((await update("carrera", CAREER, { ...careerBody, nombre: "Otra", confirm_purge: true })).status).toBe(200)
  })

  it("updates a faculty and syncs every career of it, never writing a campus", async () => {
    expect((await update("facultad", FACULTY, { nombre: "Facultad renovada", campus: "Campus Matriz Dr. Gabriel Galarza López", catalog_libraries: ["UEB"] })).status).toBe(200)
    expect(log).toContain(`update:facultad:${FACULTY}:${JSON.stringify({ nombre_facultad: "Facultad renovada", bibliotecas_koha_facultad: ["UEB"] })}`)
    expect(log).toContain(`sync:false:${CAREER}`)
  })

  it("locks a period while its convocation runs and asks before regenerating its syllabi", async () => {
    periods.set(PERIOD, { ...(periods.get(PERIOD) as PeriodRow & { running: boolean }), running: true })
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2027-03-12" })).json?.errors).toEqual({ process: ["Periodo académico activo"] })
    periods.set(PERIOD, { ...(periods.get(PERIOD) as PeriodRow & { running: boolean }), running: false })
    purge = purgeRequired(3)
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2027-03-12", teaching_weeks: 15 })).json?.errors).toEqual(purge)
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2027-03-12", teaching_weeks: 15, confirm_purge: "1" })).status).toBe(200)
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2026-10-12" })).json?.errors).toEqual({
      ends_on: ["El campo fecha de fin debe ser una fecha posterior o igual a fecha de inicio."],
    })
  })
})

describe("PATCH /api/v1/admin/academic/{entity}/{record}/status", () => {
  it("deactivates and reactivates a career without deleting it", async () => {
    expect((await status("carrera", CAREER, { active: false })).text).toBe('{"message":"Registro desactivado sin borrar su historial."}')
    expect((await status("carrera", CAREER, { active: "1" })).text).toBe('{"message":"Registro reactivado."}')
    expect(log.filter((entry) => entry.startsWith("active:"))).toEqual([`active:carrera:${CAREER}:false`, `active:carrera:${CAREER}:true`])
  })

  it("explains why a faculty with active careers or a career in a running convocation cannot be deactivated", async () => {
    expect((await status("facultad", FACULTY, { active: false })).json?.errors).toEqual({ record: ["Desactive primero las carreras activas de esta facultad."] })
    careers.set(CAREER, { ...(careers.get(CAREER) as CareerRow & { active: boolean; roles: boolean; inProgress: boolean }), inProgress: true })
    expect((await status("carrera", CAREER, { active: false })).json?.errors).toEqual({ record: ["La carrera participa en un periodo académico en curso. Espere a que se cierre."] })
  })

  it("retires the coordinator and teachers of a deactivated career, like SetAcademicRecordStatus::retireUsers, and forbids coordinators", async () => {
    careers.set(CAREER, { ...(careers.get(CAREER) as CareerRow & { active: boolean; roles: boolean; inProgress: boolean }), roles: true })
    expect((await status("carrera", CAREER, { active: false })).status).toBe(200)
    expect(log.filter((entry) => entry.startsWith("retire:") || entry.startsWith("active:"))).toEqual([`retire:${CAREER}`, `active:carrera:${CAREER}:false`])
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await status("carrera", CAREER, { active: true })).text).toBe(FORBIDDEN)
    expect((await status("carrera", CAREER, { active: "x" })).status).toBe(403)
  })
})

describe("career and period forms sent as multipart, as the admin screens send them", () => {
  it("creates a career from multipart form data without asking Laravel", async () => {
    const response = await sendForm("POST", "/api/v1/admin/academic/carrera", { faculty_id: FACULTY, modality: "presencial", nombre: "Software nueva", code: "SW-10", cycle_count: "8" }, null, (request) =>
      createGovernanceRecord(request, "carrera", deps()),
    )
    expect(response).toEqual({ status: 201, text: `{"message":"Registro institucional creado.","id":"${NEW_ID}"}` })
    expect(created).toEqual([{ facultyId: FACULTY, modality: "presencial", code: "SW-10", name: "Software nueva", cycleCount: 8 }])
  })

  it("updates a career from a multipart form with the spoofed PATCH method", async () => {
    const response = await sendForm("POST", `/api/v1/admin/academic/carrera/${CAREER}`, { _method: "PATCH", ...careerBody, nombre: "Software renovada", cycle_count: "3" }, null, (request) =>
      updateGovernanceRecord(request, "carrera", CAREER, deps()),
    )
    expect(response).toEqual({ status: 200, text: '{"message":"Datos institucionales actualizados."}' })
  })
})
