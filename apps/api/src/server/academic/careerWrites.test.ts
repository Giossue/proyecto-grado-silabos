// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected } from "../syllabus/inProgressWorkHelpers"
import {
  createCareerRecord,
  createParallels,
  replaceParallelTeacher,
  updateCareerRecord,
  updateParallel,
  type CareerWriteDeps,
  type ParallelRow,
  type SubjectRow,
} from "./careerWrites"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CREATED = '{"message":"Registro académico creado dentro de su carrera."}'
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
const SUBJECT = "01a1c5bc-7cbf-7091-860c-63a02b91e998"
const OTHER_SUBJECT = "01a1c5bc-7eca-70e6-99e0-23ff7ff043d3"
const PARALLEL = "01a1c5bc-7cf9-725c-957d-66e06c001a2d"
const OTHER_PARALLEL = "01a1c5bc-7f04-72c7-897e-c6e503b03fb2"
const TEACHER = "01a1c5bc-7b37-718f-861d-a86a8e7fe350"
const TEACHER_ROLE = "01a1c5bc-7ca5-7009-83f0-4ebc012572d5"
const CURRENT_ASSIGNMENT = "01a1c5bc-7d03-7162-95e7-db49fd8d2773"
const PURGE_STARTED =
  "El sílabo de este paralelo ya tiene trabajo del docente. Cambiar el docente lo elimina con todo su contenido (borrador, revisiones, aprobación, firmas y análisis de IA) y el nuevo docente lo empieza de cero."
const FINALIZED = { purge_required: ["finalizada"], purge_count: ["0"], purge_mode: ["convocatoria_finalizada"] }

type Grant = { id: string; userId: string; careerId: string; role: string; active: boolean; eligible: boolean }

let world: FakeWorld
let log: string[]
let subjects: Map<string, SubjectRow & { active: boolean }>
let parallels: Map<string, ParallelRow & { active: boolean }>
let assignments: { id: string; parallelId: string; roleId: string }[]
let grants: Grant[]
let users: Set<string>
let started: Set<string>
let sent: Set<string>
let locked: boolean
let finalized: boolean
let purge: Record<string, string[]> | null
let convocation: { id: string; state: string; processState: string } | null
let sequence: number

function nextId(): string {
  sequence += 1
  return `01a2aaaa-0000-7000-8000-00000000000${sequence}`
}

function subjectRow(id: string, careerId: string, overrides: Partial<SubjectRow["columns"]> = {}): SubjectRow & { active: boolean } {
  return {
    id,
    careerId,
    totalHours: 144,
    active: true,
    columns: {
      codigo_asignatura: "SW-B1-001",
      nombre_asignatura: "Algoritmos",
      ciclo_asignatura: 1,
      creditos_asignatura: "3.00",
      horas_docencia: "48.00",
      horas_practicas: "48.00",
      horas_autonomas: "48.00",
      orden_asignatura_en_ciclo: 0,
      unidad_curricular_asignatura: "basica",
      modalidad_asignatura: "Presencial",
      genera_silabo_asignatura: true,
      ...overrides,
    },
  }
}

function deps(): CareerWriteDeps {
  return {
    bridge: fakeDeps(world),
    careerActive: async (id) => id === CAREER || id === OTHER_CAREER,
    subjectInCareer: async (id, careerId) => subjects.get(id)?.careerId === careerId,
    activeSubjectInCareer: async (id, careerId) => subjects.get(id)?.careerId === careerId && subjects.get(id)?.active === true,
    subjectCodeTaken: async (careerId, code, except) =>
      [...subjects.values()].some((subject) => subject.careerId === careerId && subject.columns.codigo_asignatura === code && subject.id !== except),
    eligibleUserExists: async (id) => users.has(id),
    parallelInCareer: async (id, careerId) => {
      const parallel = parallels.get(id)
      return parallel !== undefined && subjects.get(parallel.subjectId)?.careerId === careerId && subjects.get(parallel.subjectId)?.active === true
    },
    async transaction(work) {
      log.push("begin")
      try {
        const result = await work({
          careerLocked: async () => locked,
          lockCareer: async (id) => (id === CAREER || id === OTHER_CAREER ? { id, cycleCount: 4 } : null),
          lastPosition: async (careerId, cycle) => {
            const positions = [...subjects.values()].filter((subject) => subject.careerId === careerId && subject.columns.ciclo_asignatura === cycle).map((subject) => Number(subject.columns.orden_asignatura_en_ciclo))
            return positions.length === 0 ? null : Math.max(...positions)
          },
          insertSubject: async (careerId, columns) => {
            const id = nextId()
            log.push(`insert-subject:${careerId}:${JSON.stringify(columns)}`)
            return id
          },
          subjectGeneratesSyllabus: async (id) => (subjects.get(id)?.columns.genera_silabo_asignatura as boolean | undefined) ?? null,
          lockSubject: async (id, careerId) => {
            const subject = subjects.get(id)
            return subject && subject.careerId === careerId ? structuredClone(subject) : null
          },
          updateSubject: async (id, columns) => {
            if ("orden_asignatura_en_ciclo" in columns && columns.orden_asignatura_en_ciclo === null) throw new Error("null value in column violates not-null constraint")
            log.push(`update-subject:${id}:${JSON.stringify(columns)}`)
          },
          subjectsOfParallel: async (id) => (parallels.has(id) ? [parallels.get(id)?.subjectId as string] : []),
          parallelsWithStartedSyllabus: async (ids) => ids.filter((id) => started.has(id)),
          lockParallel: async (id, careerId) => {
            const parallel = parallels.get(id)
            return parallel && subjects.get(parallel.subjectId)?.careerId === careerId ? { id: parallel.id, subjectId: parallel.subjectId, code: parallel.code, shift: parallel.shift } : null
          },
          hasCoordinatorRole: async (userId, careerId) => grants.some((grant) => grant.userId === userId && grant.careerId === careerId && grant.role === "coordinador" && grant.active),
          effectiveRoles: async (userId) => grants.filter((grant) => grant.userId === userId && grant.active).map((grant) => grant.role),
          teacherGrant: async (userId, careerId) => {
            const found = grants.filter((grant) => grant.userId === userId && grant.careerId === careerId && grant.role === "docente").sort((a, b) => Number(b.active) - Number(a.active))[0]
            return found ? { id: found.id, active: found.active } : null
          },
          insertTeacherGrant: async (userId, careerId) => {
            log.push(`grant:${userId}:${careerId}`)
            grants.push({ id: nextId(), userId, careerId, role: "docente", active: true, eligible: true })
          },
          activateGrant: async (id) => {
            log.push(`activate:${id}`)
            const grant = grants.find((item) => item.id === id) as Grant
            grant.active = true
          },
          eligibleTeacherRole: async (userId, careerId) =>
            grants.find((grant) => grant.userId === userId && grant.careerId === careerId && grant.role === "docente" && grant.active && grant.eligible)?.id ?? null,
          parallelHasActiveTeacher: async (id) => assignments.some((assignment) => assignment.parallelId === id),
          insertTeacherAssignment: async (roleId, parallelId) => {
            const id = nextId()
            log.push(`assign:${roleId}:${parallelId}`)
            assignments.push({ id, parallelId, roleId })
            return id
          },
          restartForParallel: async (id) => void log.push(`restart:${id}`),
          lockCurrentConvocation: async (careerId) => (careerId === CAREER ? convocation : null),
          generateParallelSyllabus: async (convocationId, parallelId) => void log.push(`generate:${convocationId}:${parallelId}`),
          activeTeacherAssignment: async (id) => assignments.find((assignment) => assignment.parallelId === id)?.id ?? null,
          lockTeacherAssignment: async (id, careerId) => {
            const assignment = assignments.find((item) => item.id === id)
            return assignment && subjects.get(parallels.get(assignment.parallelId)?.subjectId as string)?.careerId === careerId ? assignment.id : null
          },
          deleteTeacherAssignment: async (id) => {
            log.push(`unassign:${id}`)
            assignments = assignments.filter((assignment) => assignment.id !== id)
          },
          lockActiveSubject: async (id, careerId) => (subjects.get(id)?.careerId === careerId && subjects.get(id)?.active ? id : null),
          existingParallelCodes: async (subjectId, codes) =>
            [...parallels.values()].filter((parallel) => parallel.subjectId === subjectId && codes.includes(parallel.code.toUpperCase())).map((parallel) => parallel.code),
          insertParallel: async (subjectId, code, shift) => {
            const id = nextId()
            log.push(`insert-parallel:${subjectId}:${code}:${shift}`)
            parallels.set(id, { id, subjectId, code, shift: shift as string, active: true })
            return id
          },
          parallelCodeTaken: async (subjectId, exceptId, code) =>
            [...parallels.values()].some((parallel) => parallel.subjectId === subjectId && parallel.id !== exceptId && parallel.code.toUpperCase() === code),
          updateParallel: async (id, code, shift) => void log.push(`update-parallel:${id}:${code}:${shift}`),
          parallelHasSentSyllabus: async (id) => sent.has(id),
          restartSentForParallel: async (id) => void log.push(`restart-sent:${id}`),
          refreshParallel: async (id) => void log.push(`refresh:${id}`),
          guard: async (confirmed, careerId, change, subjectIds) => {
            log.push(`guard:${confirmed}:${careerId}:${subjectIds?.join(",") ?? "null"}`)
            const result = await change()
            if (finalized && !confirmed) throw new GenerationRejected(FINALIZED)
            return result
          },
          keepContent: async (confirmed, careerId, change) => {
            log.push(`keep:${confirmed}:${careerId}`)
            return change()
          },
          replace: async (confirmed, change, scope) => {
            log.push(`replace:${confirmed}:${JSON.stringify(scope)}`)
            if (purge !== null && !confirmed) throw new GenerationRejected(purge)
            return change()
          },
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

const create = (entity: string, body: unknown) => send("POST", `/api/v1/coordination/academic/${entity}`, body, (request) => createCareerRecord(request, entity, deps()))
const update = (entity: string, id: string, body: unknown) =>
  send("PATCH", `/api/v1/coordination/academic/${entity}/${id}`, body, (request) => updateCareerRecord(request, entity, id, deps()))
const storeParallels = (body: unknown) => send("POST", "/api/v1/coordination/academic/parallels", body, (request) => createParallels(request, deps()))
const editParallel = (id: string, body: unknown) => send("PATCH", `/api/v1/coordination/academic/parallels/${id}`, body, (request) => updateParallel(request, id, deps()))
const replaceTeacher = (id: string, body: unknown) =>
  send("PUT", `/api/v1/coordination/academic/parallels/${id}/teacher`, body, (request) => replaceParallelTeacher(request, id, deps()))
const subjectBody = { code: "SW-701", nombre: "Arquitectura Empresarial", cycle: 1, organization_unit: "profesional", horas_ac: 48, horas_pae: 32, horas_aa: 64, creditos: 4 }

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  log = []
  sequence = 0
  subjects = new Map([
    [SUBJECT, subjectRow(SUBJECT, CAREER)],
    [OTHER_SUBJECT, subjectRow(OTHER_SUBJECT, OTHER_CAREER)],
  ])
  parallels = new Map([
    [PARALLEL, { id: PARALLEL, subjectId: SUBJECT, code: "A", shift: "matutina", active: true }],
    [OTHER_PARALLEL, { id: OTHER_PARALLEL, subjectId: OTHER_SUBJECT, code: "A", shift: "matutina", active: true }],
  ])
  assignments = []
  grants = [
    { id: TEACHER_ROLE, userId: TEACHER, careerId: CAREER, role: "docente", active: true, eligible: true },
    { id: golden.roleId, userId: golden.userId, careerId: CAREER, role: "coordinador", active: true, eligible: true },
  ]
  users = new Set([TEACHER, golden.userId])
  started = new Set()
  sent = new Set()
  locked = false
  finalized = false
  purge = null
  convocation = null
})

describe("POST /api/v1/coordination/academic/asignatura", () => {
  it("the coordinator creates a subject directly in its career, at the end of its cycle", async () => {
    const response = await create("asignatura", subjectBody)
    expect(response.status).toBe(200)
    expect(response.text).toBe(CREATED)
    expect(log).toEqual([
      "begin",
      `insert-subject:${CAREER}:${JSON.stringify({
        codigo_asignatura: "SW-701",
        nombre_asignatura: "Arquitectura Empresarial",
        ciclo_asignatura: 1,
        creditos_asignatura: 4,
        horas_docencia: 48,
        horas_practicas: 32,
        horas_autonomas: 64,
        orden_asignatura_en_ciclo: 1,
        unidad_curricular_asignatura: "profesional",
        modalidad_asignatura: null,
        genera_silabo_asignatura: true,
      })}`,
      "commit",
    ])
  })

  it("takes an explicit position, a null position as the first one and the modality and syllabus switch as sent", async () => {
    await create("asignatura", { ...subjectBody, position: 5, modality: "En línea", generates_syllabus: "0" })
    await create("asignatura", { ...subjectBody, code: "SW-702", position: null, cycle: "3" })
    const inserted = log.filter((line) => line.startsWith("insert-subject")).map((line) => JSON.parse(line.slice(line.indexOf("{"))) as Record<string, unknown>)
    expect(inserted.map((row) => [row.orden_asignatura_en_ciclo, row.modalidad_asignatura, row.genera_silabo_asignatura, row.ciclo_asignatura])).toEqual([
      [5, "En línea", false, 1],
      [0, null, true, "3"],
    ])
  })

  it("rejects missing fields, a repeated code, a fractional total of hours and a cycle beyond the curriculum", async () => {
    expect((await create("asignatura", { nombre: "X", cycle: 1, organization_unit: "otra", horas_ac: 1 })).json?.errors).toEqual({
      code: ["El campo código es obligatorio."],
      organization_unit: ["El valor seleccionado en unidad de organización curricular no es válido."],
      creditos: ["El campo creditos es obligatorio."],
      horas_pae: ["El campo horas pae es obligatorio."],
      horas_aa: ["El campo horas aa es obligatorio."],
    })
    expect((await create("asignatura", { ...subjectBody, code: "SW-B1-001" })).json?.errors).toEqual({ code: ["Ya existe una materia con ese código."] })
    expect((await create("asignatura", { ...subjectBody, horas_ac: "48.5" })).json?.errors).toEqual({ horas_totales: ["El campo horas totales debe ser un número entero."] })
    const exceeded = await create("asignatura", { ...subjectBody, cycle: 5 })
    expect(exceeded.status).toBe(422)
    expect(exceeded.json?.errors).toEqual({ cycle: ["El ciclo excede la configuración de esta malla."] })
    expect(log).toEqual(["begin", "rollback"])
  })

  it("refuses while a convocation of the career is open and is forbidden for an administrator", async () => {
    locked = true
    expect((await create("asignatura", subjectBody)).json).toEqual({ message: "Periodo académico activo", errors: { process: ["Periodo académico activo"] } })
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    expect((await create("asignatura", subjectBody)).text).toBe(FORBIDDEN)
  })

  it("answers 404 for every other entity and reads multipart bodies natively", async () => {
    expect((await create("paralelo", {})).status).toBe(404)
    const form = await createCareerRecord(
      new Request(apiRequest("/api/v1/coordination/academic/asignatura", { cookie, method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" } }), { body: "--x--" }),
      "asignatura",
      deps(),
    )
    expect(form.status).toBe(422)
  })
})

describe("POST /api/v1/coordination/academic/asignacion_docente", () => {
  it("assigns a verified teacher to a parallel without one and restarts its syllabus", async () => {
    const response = await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL })
    expect(response.text).toBe(CREATED)
    expect(log).toEqual(["begin", `guard:false:${CAREER}:${SUBJECT}`, `assign:${TEACHER_ROLE}:${PARALLEL}`, `restart:${PARALLEL}`, "commit"])
  })

  it("asks before discarding a started syllabus and refuses a parallel that already has a teacher", async () => {
    started.add(PARALLEL)
    const asked = await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL })
    expect(asked.json).toEqual({ message: `${PURGE_STARTED} (y 1 error más)`, errors: { purge_required: [PURGE_STARTED], purge_count: ["1"] } })
    expect((await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL, confirm_purge: true })).status).toBe(200)
    expect((await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL, confirm_purge: "1" })).json?.errors).toEqual({
      user_id: ["El paralelo ya tiene un docente asignado."],
    })
  })

  it("makes a coordinator of the career its teacher, reopening its previous teacher role", async () => {
    await create("asignacion_docente", { user_id: golden.userId, parallel_id: PARALLEL })
    expect(log).toContain(`grant:${golden.userId}:${CAREER}`)
    assignments = []
    grants = grants.map((grant) => (grant.userId === golden.userId && grant.role === "docente" ? { ...grant, active: false } : grant))
    log = []
    await create("asignacion_docente", { user_id: golden.userId, parallel_id: PARALLEL })
    expect(log).toContain("activate:01a2aaaa-0000-7000-8000-000000000001")
  })

  it("refuses a teacher without a verified role in the career and an institutional coordinator", async () => {
    grants[0].eligible = false
    expect((await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL })).json?.errors).toEqual({
      user_id: ["El docente debe verificar su correo antes de recibir una asignación."],
    })
    grants.push({ id: "01a2bbbb-0000-7000-8000-000000000001", userId: golden.userId, careerId: "", role: "administrador", active: true, eligible: true })
    expect((await create("asignacion_docente", { user_id: golden.userId, parallel_id: PARALLEL })).json?.errors).toEqual({
      user_id: ["Administración y Biblioteca no pueden tener los roles Docente ni Coordinador."],
    })
  })

  it("validates the teacher and the parallel of the career", async () => {
    expect((await create("asignacion_docente", { user_id: "01a2cccc-0000-7000-8000-000000000001", parallel_id: OTHER_PARALLEL })).json?.errors).toEqual({
      user_id: ["El valor seleccionado en usuario no es válido."],
      parallel_id: ["El valor seleccionado en paralelo no es válido."],
    })
    expect((await create("asignacion_docente", { user_id: "x" })).json?.errors).toEqual({
      user_id: ["El campo usuario debe ser un UUID válido."],
      parallel_id: ["El campo paralelo es obligatorio."],
    })
  })

  it("a change that reaches a finalized process warns and rolls back", async () => {
    finalized = true
    expect((await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL })).json?.errors).toEqual(FINALIZED)
    expect(log.at(-1)).toBe("rollback")
  })
})

describe("PATCH /api/v1/coordination/academic/asignatura/{record}", () => {
  it("updates only what changed and keeps the syllabi content", async () => {
    const response = await update("asignatura", SUBJECT, {
      code: "SW-B1-001",
      nombre: "Algoritmos II",
      cycle: 2,
      organization_unit: "basica",
      modality: "Presencial",
      creditos: "3",
      horas_ac: 48,
      horas_pae: "40.5",
      horas_aa: "47.5",
    })
    expect(response.text).toBe('{"message":"Registro académico actualizado."}')
    expect(log).toEqual([
      "begin",
      `keep:false:${CAREER}`,
      `update-subject:${SUBJECT}:${JSON.stringify({ nombre_asignatura: "Algoritmos II", ciclo_asignatura: 2, horas_practicas: "40.5", horas_autonomas: "47.5" })}`,
      "commit",
    ])
  })

  it("writes nothing when nothing changes and only the changed columns otherwise", async () => {
    const same = { code: "SW-B1-001", nombre: "Algoritmos", cycle: "1", organization_unit: "basica", modality: "Presencial", creditos: 3, horas_ac: "48", horas_pae: "48.00", horas_aa: 48 }
    expect((await update("asignatura", SUBJECT, same)).status).toBe(200)
    expect(log.filter((line) => line.startsWith("update-subject"))).toEqual([])
    expect((await update("asignatura", SUBJECT, { ...same, organization_unit: "profesional", modality: null, position: 2 })).status).toBe(200)
    expect(log.filter((line) => line.startsWith("update-subject"))).toEqual([
      `update-subject:${SUBJECT}:${JSON.stringify({ orden_asignatura_en_ciclo: 2, unidad_curricular_asignatura: "profesional", modalidad_asignatura: null })}`,
    ])
  })

  it("turning off syllabus generation replaces the subject syllabi after confirming", async () => {
    purge = { purge_required: ["reemplaza"], purge_count: ["1"] }
    const body = { ...subjectBody, code: "SW-B1-001", generates_syllabus: false }
    expect((await update("asignatura", SUBJECT, body)).json?.errors).toEqual(purge)
    log = []
    await update("asignatura", SUBJECT, { ...body, confirm_purge: true })
    expect(log.slice(0, 3)).toEqual(["begin", `guard:true:${CAREER}:null`, `replace:true:${JSON.stringify({ careerIds: CAREER, subjectId: SUBJECT })}`])
  })

  it("is forbidden for a subject of another career, refuses while the convocation is open and answers 500 for a null position, like the NOT NULL column", async () => {
    expect((await update("asignatura", OTHER_SUBJECT, { ...subjectBody, code: "OTR-101" })).text).toBe(FORBIDDEN)
    locked = true
    expect((await update("asignatura", SUBJECT, subjectBody)).json?.errors).toEqual({ process: ["Periodo académico activo"] })
    locked = false
    expect(await update("asignatura", SUBJECT, { ...subjectBody, position: null })).toMatchObject({ status: 500, text: '{"message":"Server Error"}' })
    expect((await update("paralelo", SUBJECT, subjectBody)).status).toBe(404)
    expect(await update("asignatura", "abc", subjectBody)).toMatchObject({ status: 404, text: '{"message":"The route api/v1/coordination/academic/asignatura/abc could not be found."}' })
  })
})

describe("POST /api/v1/coordination/academic/parallels", () => {
  it("creates every code with the selected teacher", async () => {
    const response = await storeParallels({ subject_id: SUBJECT, codes: [" B ", "C", 5, ""], shift: "vespertina", user_id: TEACHER })
    expect(response.json).toEqual({ message: "2 paralelos creados dentro de su carrera." })
    expect(log).toEqual([
      "begin",
      `insert-parallel:${SUBJECT}:B:vespertina`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:01a2aaaa-0000-7000-8000-000000000001`,
      "restart:01a2aaaa-0000-7000-8000-000000000001",
      `insert-parallel:${SUBJECT}:C:vespertina`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:01a2aaaa-0000-7000-8000-000000000003`,
      "restart:01a2aaaa-0000-7000-8000-000000000003",
      "commit",
    ])
  })

  it("requires a shift and a teacher, rejects repeated codes and an existing code ignoring case", async () => {
    expect((await storeParallels({ subject_id: SUBJECT, codes: ["B", "B"] })).json?.errors).toEqual({
      shift: ["El campo jornada es obligatorio."],
      user_id: ["Seleccione el docente del paralelo."],
      "codes.0": ["El campo código de paralelo tiene un valor duplicado."],
      "codes.1": ["El campo código de paralelo tiene un valor duplicado."],
    })
    expect((await storeParallels({ subject_id: SUBJECT, codes: [], shift: "noche", user_id: "01a2cccc-0000-7000-8000-000000000001" })).json?.errors).toEqual({
      codes: ["El campo códigos de paralelo es obligatorio."],
      shift: ["El valor seleccionado en jornada no es válido."],
      user_id: ["Elija un docente activo con el correo verificado."],
    })
    expect((await storeParallels({ subject_id: SUBJECT, codes: ["a", "Z"], shift: "matutina", user_id: TEACHER })).json?.errors).toEqual({
      codes: ["Ya existe el paralelo A para esta materia."],
    })
    expect(log).toEqual(["begin", "rollback"])
  })

  it("a teacher of another career rolls back the parallels", async () => {
    grants[0].careerId = OTHER_CAREER
    expect((await storeParallels({ subject_id: SUBJECT, codes: ["B", "C"], shift: "matutina", user_id: TEACHER })).json?.errors).toEqual({
      user_id: ["El docente debe verificar su correo antes de recibir una asignación."],
    })
    expect(log.at(-1)).toBe("rollback")
  })

  it("only a subject of the coordinator's career receives parallels", async () => {
    expect((await storeParallels({ subject_id: OTHER_SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER })).json?.errors).toEqual({
      subject_id: ["El valor seleccionado en materia no es válido."],
    })
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await storeParallels({ subject_id: SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER })).text).toBe(FORBIDDEN)
  })
})

describe("a parallel that appears while the career convocation is open", () => {
  const CONVOCATION = "01a1c5bc-8000-7000-8000-000000000001"

  it("receives its syllabus right away when it is created", async () => {
    convocation = { id: CONVOCATION, state: "abierta", processState: "abierto" }
    expect((await storeParallels({ subject_id: SUBJECT, codes: ["B", "C"], shift: "vespertina", user_id: TEACHER })).json).toEqual({ message: "2 paralelos creados dentro de su carrera." })
    expect(log).toEqual([
      "begin",
      `insert-parallel:${SUBJECT}:B:vespertina`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:01a2aaaa-0000-7000-8000-000000000001`,
      "restart:01a2aaaa-0000-7000-8000-000000000001",
      `generate:${CONVOCATION}:01a2aaaa-0000-7000-8000-000000000001`,
      `insert-parallel:${SUBJECT}:C:vespertina`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:01a2aaaa-0000-7000-8000-000000000003`,
      "restart:01a2aaaa-0000-7000-8000-000000000003",
      `generate:${CONVOCATION}:01a2aaaa-0000-7000-8000-000000000003`,
      "commit",
    ])
  })

  it("receives its syllabus right away when it gets its teacher", async () => {
    convocation = { id: CONVOCATION, state: "abierta", processState: "abierto" }
    expect((await create("asignacion_docente", { user_id: TEACHER, parallel_id: PARALLEL })).text).toBe(CREATED)
    expect(log).toEqual(["begin", `guard:false:${CAREER}:${SUBJECT}`, `assign:${TEACHER_ROLE}:${PARALLEL}`, `restart:${PARALLEL}`, `generate:${CONVOCATION}:${PARALLEL}`, "commit"])
    log = []
    assignments = [{ id: CURRENT_ASSIGNMENT, parallelId: PARALLEL, roleId: "01a1c5bc-7ca2-72f3-9e6b-f76c0f49c499" }]
    expect((await replaceTeacher(PARALLEL, { user_id: TEACHER })).text).toBe(CREATED)
    expect(log).toEqual([
      "begin",
      `unassign:${CURRENT_ASSIGNMENT}`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:${PARALLEL}`,
      `restart:${PARALLEL}`,
      `generate:${CONVOCATION}:${PARALLEL}`,
      "commit",
    ])
  })

  it.each([
    ["a paused convocation", { state: "pausada", processState: "abierto" }],
    ["a paused institutional process", { state: "abierta", processState: "pausado" }],
    ["a convocation in preparation", { state: "preparacion", processState: "abierto" }],
    ["a finalized convocation", { state: "cerrada", processState: "cerrado" }],
  ])("waits with %s, as before", async (_, states) => {
    convocation = { id: CONVOCATION, ...states }
    expect((await storeParallels({ subject_id: SUBJECT, codes: ["B"], shift: "vespertina", user_id: TEACHER })).json).toEqual({ message: "1 paralelos creados dentro de su carrera." })
    expect(log).toEqual([
      "begin",
      `insert-parallel:${SUBJECT}:B:vespertina`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:01a2aaaa-0000-7000-8000-000000000001`,
      "restart:01a2aaaa-0000-7000-8000-000000000001",
      "commit",
    ])
  })

  it("rolls the syllabus back with the parallel when the assignment fails", async () => {
    convocation = { id: CONVOCATION, state: "abierta", processState: "abierto" }
    grants[0].careerId = OTHER_CAREER
    await storeParallels({ subject_id: SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER })
    expect(log.some((entry) => entry.startsWith("generate:"))).toBe(false)
    expect(log.at(-1)).toBe("rollback")
  })
})

describe("PATCH /api/v1/coordination/academic/parallels/{parallel}", () => {
  it("edits code and shift, trimming the code and refusing a code taken in the subject", async () => {
    parallels.set("01a2dddd-0000-7000-8000-000000000001", { id: "01a2dddd-0000-7000-8000-000000000001", subjectId: SUBJECT, code: "C", shift: "matutina", active: true })
    expect((await editParallel(PARALLEL, { code: "c", shift: "nocturna" })).json?.errors).toEqual({ code: ["Ya existe el paralelo c en esta materia."] })
    expect((await editParallel(PARALLEL, { code: "D", shift: null })).json?.errors).toEqual({ shift: ["El campo jornada es obligatorio."] })
    log = []
    expect((await editParallel(PARALLEL, { code: " D ", shift: "nocturna" })).json).toEqual({ message: "Paralelo actualizado." })
    expect(log).toEqual(["begin", `guard:false:${CAREER}:${SUBJECT}`, `update-parallel:${PARALLEL}:D:nocturna`, `refresh:${PARALLEL}`, "commit"])
  })

  it("asks before restarting a sent syllabus, restarts it after confirming and writes nothing without changes", async () => {
    sent.add(PARALLEL)
    const asked = await editParallel(PARALLEL, { code: "A", shift: "vespertina" })
    expect(asked.json?.errors).toEqual({
      purge_required: [
        "El sílabo de este paralelo ya está en revisión o aprobado. Cambiar el código o la jornada lo elimina con todo su contenido (revisiones, aprobación, firmas y análisis de IA) y el docente lo empieza de nuevo.",
      ],
      purge_count: ["1"],
    })
    log = []
    await editParallel(PARALLEL, { code: "A", shift: "vespertina", confirm_purge: "1" })
    expect(log).toEqual(["begin", `guard:true:${CAREER}:${SUBJECT}`, `update-parallel:${PARALLEL}:A:vespertina`, `restart-sent:${PARALLEL}`, `refresh:${PARALLEL}`, "commit"])
    log = []
    await editParallel(PARALLEL, { code: "A", shift: "matutina" })
    expect(log).toEqual(["begin", `guard:false:${CAREER}:${SUBJECT}`, "commit"])
  })

  it("a parallel of another career answers Laravel's model 404 and a malformed one the router 404", async () => {
    expect(await editParallel(OTHER_PARALLEL, { code: "B", shift: "nocturna" })).toMatchObject({ status: 404, text: '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Parallel]."}' })
    expect(await editParallel("abc", { code: "B", shift: "nocturna" })).toMatchObject({ status: 404, text: '{"message":"The route api/v1/coordination/academic/parallels/abc could not be found."}' })
    expect((await editParallel(PARALLEL, { code: "B", shift: "nocturna", confirm_purge: "x" })).json?.errors).toEqual({
      confirm_purge: ["El campo confirmación de borrado debe ser verdadero o falso."],
    })
  })
})

describe("PUT /api/v1/coordination/academic/parallels/{parallel}/teacher", () => {
  it("replaces the teacher in one step: removes the current assignment and assigns the new one", async () => {
    assignments = [{ id: CURRENT_ASSIGNMENT, parallelId: PARALLEL, roleId: "01a1c5bc-7ca2-72f3-9e6b-f76c0f49c499" }]
    expect((await replaceTeacher(PARALLEL, { user_id: TEACHER })).text).toBe(CREATED)
    expect(log).toEqual([
      "begin",
      `unassign:${CURRENT_ASSIGNMENT}`,
      `guard:false:${CAREER}:${SUBJECT}`,
      `assign:${TEACHER_ROLE}:${PARALLEL}`,
      `restart:${PARALLEL}`,
      "commit",
    ])
  })

  it("warns first when the syllabus was started or a finalized process is reached, leaving the assignment as it was", async () => {
    assignments = [{ id: CURRENT_ASSIGNMENT, parallelId: PARALLEL, roleId: TEACHER_ROLE }]
    started.add(PARALLEL)
    expect((await replaceTeacher(PARALLEL, { user_id: TEACHER })).json?.errors).toEqual({ purge_required: [PURGE_STARTED], purge_count: ["1"] })
    expect(log).toEqual(["begin", `unassign:${CURRENT_ASSIGNMENT}`, "rollback"])
    started.clear()
    assignments = [{ id: CURRENT_ASSIGNMENT, parallelId: PARALLEL, roleId: TEACHER_ROLE }]
    finalized = true
    expect((await replaceTeacher(PARALLEL, { user_id: TEACHER })).json?.errors).toEqual(FINALIZED)
  })

  it("validates the teacher with its own label and answers Laravel's model 404 for a foreign parallel", async () => {
    expect((await replaceTeacher(PARALLEL, {})).json?.errors).toEqual({ user_id: ["El campo docente es obligatorio."] })
    expect(await replaceTeacher(OTHER_PARALLEL, { user_id: TEACHER })).toMatchObject({ status: 404, text: '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Parallel]."}' })
  })
})

describe("the administrator works on any career through /api/v1/admin/careers/{career}/academic", () => {
  const OTHER_TEACHER_ROLE = "01a1c5bc-7ca5-7009-83f0-4ebc012572d6"
  const adminPath = (careerId: string, path: string) => `/api/v1/admin/careers/${careerId}/academic/${path}`

  beforeEach(() => {
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })]
    grants.push({ id: OTHER_TEACHER_ROLE, userId: TEACHER, careerId: OTHER_CAREER, role: "docente", active: true, eligible: true })
  })

  it("creates and edits subjects, creates parallels with their teacher, edits them and replaces their teacher in the requested career", async () => {
    expect((await send("POST", adminPath(OTHER_CAREER, "asignatura"), subjectBody, (request) => createCareerRecord(request, "asignatura", deps(), OTHER_CAREER))).text).toBe(CREATED)
    expect(log.some((entry) => entry.startsWith(`insert-subject:${OTHER_CAREER}:`))).toBe(true)
    log = []
    expect((await send("PATCH", adminPath(OTHER_CAREER, `asignatura/${OTHER_SUBJECT}`), { ...subjectBody, code: "SW-B1-001" }, (request) => updateCareerRecord(request, "asignatura", OTHER_SUBJECT, deps(), OTHER_CAREER))).status).toBe(200)
    expect(log).toContain(`keep:false:${OTHER_CAREER}`)
    log = []
    const created = await send("POST", adminPath(OTHER_CAREER, "parallels"), { subject_id: OTHER_SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER }, (request) => createParallels(request, deps(), OTHER_CAREER))
    expect(created.status).toBe(200)
    expect(log).toContain(`insert-parallel:${OTHER_SUBJECT}:B:matutina`)
    expect(log.some((entry) => entry.startsWith(`assign:${OTHER_TEACHER_ROLE}:`))).toBe(true)
    log = []
    expect((await send("PATCH", adminPath(OTHER_CAREER, `parallels/${OTHER_PARALLEL}`), { code: "C", shift: "matutina" }, (request) => updateParallel(request, OTHER_PARALLEL, deps(), OTHER_CAREER))).status).toBe(200)
    expect(log).toContain(`update-parallel:${OTHER_PARALLEL}:C:matutina`)
    log = []
    expect((await send("PUT", adminPath(OTHER_CAREER, `parallels/${OTHER_PARALLEL}/teacher`), { user_id: TEACHER }, (request) => replaceParallelTeacher(request, OTHER_PARALLEL, deps(), OTHER_CAREER))).text).toBe(CREATED)
    expect(log).toContain(`assign:${OTHER_TEACHER_ROLE}:${OTHER_PARALLEL}`)
  })

  it("assigns a teacher to a parallel of the requested career and keeps records of other careers out of reach", async () => {
    expect((await send("POST", adminPath(OTHER_CAREER, "asignacion_docente"), { user_id: TEACHER, parallel_id: OTHER_PARALLEL }, (request) => createCareerRecord(request, "asignacion_docente", deps(), OTHER_CAREER))).text).toBe(CREATED)
    expect(log).toContain(`assign:${OTHER_TEACHER_ROLE}:${OTHER_PARALLEL}`)
    log = []
    expect((await send("PATCH", adminPath(OTHER_CAREER, `parallels/${PARALLEL}`), { code: "C", shift: "matutina" }, (request) => updateParallel(request, PARALLEL, deps(), OTHER_CAREER))).status).toBe(404)
    expect(log.filter((entry) => entry.startsWith("update-parallel"))).toEqual([])
  })

  it("answers 404 for a career that does not exist or is inactive, writing nothing", async () => {
    const missing = "01a1c5bc-79cf-7000-8000-000000000009"
    const response = await send("POST", adminPath(missing, "parallels"), { subject_id: OTHER_SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER }, (request) => createParallels(request, deps(), missing))
    expect(response.status).toBe(404)
    expect(log).toEqual([])
  })

  it("is refused on the coordinator routes, which carry no career", async () => {
    expect((await storeParallels({ subject_id: OTHER_SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER })).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })
})

describe("a coordinator never reaches another career", () => {
  const adminPath = (path: string) => `/api/v1/admin/careers/${OTHER_CAREER}/academic/${path}`

  it("gets 403 and writes nothing when it sends another career identifier", async () => {
    const attempts = [
      await send("POST", adminPath("asignatura"), subjectBody, (request) => createCareerRecord(request, "asignatura", deps(), OTHER_CAREER)),
      await send("PATCH", adminPath(`asignatura/${OTHER_SUBJECT}`), subjectBody, (request) => updateCareerRecord(request, "asignatura", OTHER_SUBJECT, deps(), OTHER_CAREER)),
      await send("POST", adminPath("parallels"), { subject_id: OTHER_SUBJECT, codes: ["B"], shift: "matutina", user_id: TEACHER }, (request) => createParallels(request, deps(), OTHER_CAREER)),
      await send("PATCH", adminPath(`parallels/${OTHER_PARALLEL}`), { code: "C", shift: "matutina" }, (request) => updateParallel(request, OTHER_PARALLEL, deps(), OTHER_CAREER)),
      await send("PUT", adminPath(`parallels/${OTHER_PARALLEL}/teacher`), { user_id: TEACHER }, (request) => replaceParallelTeacher(request, OTHER_PARALLEL, deps(), OTHER_CAREER)),
    ]
    expect(attempts.map((attempt) => `${attempt.status} ${attempt.text}`)).toEqual(attempts.map(() => `403 ${FORBIDDEN}`))
    expect(log).toEqual([])
  })

  it("keeps working on its own career when the identifier is its own", async () => {
    expect((await send("POST", `/api/v1/admin/careers/${CAREER}/academic/asignatura`, subjectBody, (request) => createCareerRecord(request, "asignatura", deps(), CAREER))).text).toBe(CREATED)
  })

  it("answers 401 without a session", async () => {
    const request = new Request(apiRequest(adminPath("parallels"), { method: "POST", headers: { "content-type": "application/json" } }), { body: "{}" })
    const response = await createParallels(request, deps(), OTHER_CAREER)
    expect(response.status).toBe(401)
    expect(log).toEqual([])
  })
})
