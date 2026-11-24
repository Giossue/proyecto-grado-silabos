// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { GenerationRejected, purgeRequired } from "../syllabus/inProgressWork"
import {
  createGovernanceRecord,
  periodLabel,
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
let forwarded: Request[]
let log: string[]
let audits: AuditEventInput[]
let faculties: Map<string, FacultyRow & { active: boolean }>
let careers: Map<string, CareerRow & { active: boolean; roles: boolean; inProgress: boolean }>
let periods: Map<string, PeriodRow & { running: boolean }>
let created: (CareerData | PeriodData)[]
let purge: Record<string, string[]> | null
let finalized: boolean

function deps(): GovernanceWriteDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    now: () => NOW,
    activeFacultyExists: async (id) => faculties.get(id)?.active === true,
    facultyExists: async (id) => faculties.has(id),
    careerCodeTaken: async (code, except) => [...careers.values()].some((career) => career.code === code && career.id !== except),
    async transaction(work) {
      log.push("begin")
      const staged: AuditEventInput[] = []
      try {
        const result = await work({
          createCareer: async (data) => (created.push(data), NEW_ID),
          createPeriod: async (data) => (created.push(data), NEW_ID),
          lockFaculty: async (id) => faculties.get(id) ?? null,
          lockCareer: async (id) => careers.get(id) ?? null,
          lockPeriod: async (id) => periods.get(id) ?? null,
          lockActiveFaculty: async (id) => faculties.get(id)?.active === true,
          facultyNames: async (ids) => new Map(ids.filter((id) => faculties.has(id)).map((id) => [id, faculties.get(id)?.name as string])),
          careersOfFaculty: async (id) => [...careers.values()].filter((career) => career.facultyId === id).map((career) => career.id),
          periodRunning: async (id) => periods.get(id)?.running === true,
          updateColumns: async (entity, id, columns) => void log.push(`update:${entity}:${id}:${JSON.stringify(columns)}`),
          facultyHasActiveCareers: async (id) => [...careers.values()].some((career) => career.facultyId === id && career.active),
          careerInProgress: async (id) => careers.get(id)?.inProgress === true,
          careerHasActiveRoles: async (id) => careers.get(id)?.roles === true,
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
          recordAudit: async (event) => void staged.push(event),
        })
        audits.push(...staged)
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
const careerBody = { faculty_id: FACULTY, modality: "Presencial", code: "SW-8", nombre: "Software" }

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  forwarded = []
  log = []
  audits = []
  created = []
  purge = null
  finalized = false
  faculties = new Map([
    [FACULTY, { id: FACULTY, name: "Facultad de Ciencias", campus: "Campus Laguacoto", libraries: "[]", active: true }],
    [OTHER_FACULTY, { id: OTHER_FACULTY, name: "Facultad Nueva", campus: "Campus Laguacoto", libraries: '["UEB"]', active: true }],
  ])
  careers = new Map([[CAREER, { id: CAREER, facultyId: FACULTY, code: "SW-8", name: "Software", modality: "Presencial", active: true, roles: false, inProgress: false }]])
  periods = new Map([[PERIOD, { id: PERIOD, code: "Noviembre-Marzo 2026-2027", startsOn: "2026-11-02", endsOn: "2027-03-12", weeks: 16, running: false }]])
})

describe("POST /api/v1/admin/academic/{entity}", () => {
  it("the administrator creates a career with its code and cycle count, audited", async () => {
    const response = await create("carrera", { faculty_id: FACULTY, modality: "Presencial", code: "SW-10", nombre: "Software nueva", cycle_count: "8" })
    expect(response.status).toBe(201)
    expect(response.text).toBe(`{"message":"Registro institucional creado.","id":"${NEW_ID}"}`)
    expect(created).toEqual([{ facultyId: FACULTY, modality: "Presencial", code: "SW-10", name: "Software nueva", cycleCount: 8 }])
    expect(audits.map((event) => [event.action, event.resourceType, event.resourceId, event.metadata])).toEqual([["academico.carrera.creacion", "carrera", NEW_ID, {}]])
  })

  it("rejects a career without code or cycle count, a taken code and an inactive faculty", async () => {
    expect((await create("carrera", { faculty_id: FACULTY, modality: "Presencial", nombre: "X" })).json?.errors).toEqual({
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
    expect(periodLabel("2026-11-02", "2027-03-12")).toBe("Noviembre-Marzo 2026-2027")
    expect((await create("periodo", { starts_on: "2027-04-05", ends_on: "2027-08-20" })).status).toBe(201)
    expect((await create("periodo", { starts_on: "2027-04-05", ends_on: "2027-08-20", teaching_weeks: 16 })).status).toBe(201)
    expect(created).toEqual([
      { code: "Abril-Agosto 2027", startsOn: "2027-04-05", endsOn: "2027-08-20", weeks: 20 },
      { code: "Abril-Agosto 2027", startsOn: "2027-04-05", endsOn: "2027-08-20", weeks: 16 },
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

  it("is forbidden for a coordinator and leaves faculties (they need a logo) and unusual dates to Laravel", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await create("carrera", { ...careerBody, cycle_count: 8 })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    expect((await create("facultad", { nombre: "F" })).status).toBe(299)
    expect((await create("periodo", { starts_on: "next monday", ends_on: "2027-03-20" })).status).toBe(299)
    expect(forwarded).toHaveLength(2)
  })
})

describe("PATCH /api/v1/admin/academic/{entity}/{record}", () => {
  it("updates only what changed in a career, audits before and after and keeps its syllabi in sync", async () => {
    const response = await update("carrera", CAREER, { ...careerBody, faculty_id: OTHER_FACULTY, modality: "En línea", nombre: "Software renovada" })
    expect(response.text).toBe('{"message":"Datos institucionales actualizados y auditados."}')
    expect(log).toEqual([
      "begin",
      `guard:false:${CAREER}:null`,
      `update:carrera:${CAREER}:${JSON.stringify({ facultad_id: OTHER_FACULTY, nombre_carrera: "Software renovada", modalidad_carrera: "En línea" })}`,
      `sync:false:${CAREER}`,
      "commit",
    ])
    expect(audits.map((event) => [event.action, event.metadata])).toEqual([
      [
        "academico.carrera.actualizacion",
        {
          changed_fields: "Facultad, Nombre, modalidad_carrera",
          before_faculty_id: FACULTY,
          after_faculty_id: OTHER_FACULTY,
          before_faculty: "Facultad de Ciencias",
          after_faculty: "Facultad Nueva",
          before_name: "Software",
          after_name: "Software renovada",
          before_modalidad_carrera: "Presencial",
          after_modalidad_carrera: "En línea",
        },
      ],
    ])
  })

  it("does not write or audit when nothing changed, and needs an active faculty to move a career", async () => {
    expect((await update("carrera", CAREER, careerBody)).status).toBe(200)
    expect(audits).toEqual([])
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

  it("updates a faculty and syncs every career of it, but leaves a logo upload to Laravel", async () => {
    expect((await update("facultad", FACULTY, { nombre: "Facultad renovada", campus: "Campus Laguacoto", catalog_libraries: ["UEB"] })).status).toBe(200)
    expect(audits[0].metadata).toEqual({
      changed_fields: "Nombre, Bibliotecas de Koha",
      before_name: "Facultad de Ciencias",
      after_name: "Facultad renovada",
      before_catalog_libraries: "",
      after_catalog_libraries: "UEB",
    })
    expect(log).toContain(`sync:false:${CAREER}`)
    expect((await update("facultad", FACULTY, { nombre: "F", campus: "Campus Laguacoto", logo: "archivo" })).status).toBe(299)
  })

  it("locks a period while its convocation runs and asks before regenerating its syllabi", async () => {
    periods.set(PERIOD, { ...(periods.get(PERIOD) as PeriodRow & { running: boolean }), running: true })
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2027-03-12" })).json?.errors).toEqual({ process: ["Convocatoria activa"] })
    periods.set(PERIOD, { ...(periods.get(PERIOD) as PeriodRow & { running: boolean }), running: false })
    purge = purgeRequired(3)
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2027-03-12", teaching_weeks: 15 })).json?.errors).toEqual(purge)
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2027-03-12", teaching_weeks: 15, confirm_purge: "1" })).status).toBe(200)
    expect(audits.map((event) => event.metadata)).toEqual([{ changed_fields: "Semanas lectivas", before_teaching_weeks: 16, after_teaching_weeks: 15 }])
    expect((await update("periodo", PERIOD, { starts_on: "2026-11-02", ends_on: "2026-10-12" })).json?.errors).toEqual({
      ends_on: ["El campo fecha de fin debe ser una fecha posterior o igual a fecha de inicio."],
    })
  })
})

describe("PATCH /api/v1/admin/academic/{entity}/{record}/status", () => {
  it("deactivates and reactivates a career with audit, without deleting it", async () => {
    expect((await status("carrera", CAREER, { active: false })).text).toBe('{"message":"Registro desactivado sin borrar su historial."}')
    expect((await status("carrera", CAREER, { active: "1" })).text).toBe('{"message":"Registro reactivado."}')
    expect(audits.map((event) => [event.action, event.metadata])).toEqual([
      ["academico.carrera.desactivacion", { active: false, retired_users: 0 }],
      ["academico.carrera.reactivacion", { active: true }],
    ])
    expect(log.filter((entry) => entry.startsWith("active:"))).toEqual([`active:carrera:${CAREER}:false`, `active:carrera:${CAREER}:true`])
  })

  it("explains why a faculty with active careers or a career in a running convocation cannot be deactivated", async () => {
    expect((await status("facultad", FACULTY, { active: false })).json?.errors).toEqual({ record: ["Desactive primero las carreras activas de esta facultad."] })
    careers.set(CAREER, { ...(careers.get(CAREER) as CareerRow & { active: boolean; roles: boolean; inProgress: boolean }), inProgress: true })
    expect((await status("carrera", CAREER, { active: false })).json?.errors).toEqual({ record: ["La carrera participa en una convocatoria en curso. Espere a que se cierre."] })
    expect(audits).toEqual([])
  })

  it("leaves retiring the coordinator and teachers of a career to Laravel, and forbids coordinators", async () => {
    careers.set(CAREER, { ...(careers.get(CAREER) as CareerRow & { active: boolean; roles: boolean; inProgress: boolean }), roles: true })
    expect((await status("carrera", CAREER, { active: false })).status).toBe(299)
    expect(log.at(-1)).toBe("rollback")
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await status("carrera", CAREER, { active: true })).text).toBe(FORBIDDEN)
    expect((await status("carrera", CAREER, { active: "x" })).status).toBe(403)
  })
})
