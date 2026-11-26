// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import golden from "../http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { editPart, readBook, xlsx } from "../excel/testing"
import { createRateLimiter } from "../http/throttle"
import type { CareerWriteTx } from "./careerWrites"
import type { CurriculumTx } from "./curriculumWrites"
import type { GovernanceWriteTx } from "./governanceWrites"
import { careerImportTemplate, curriculumImportTemplate, importCareers, importCurriculum, type StructureImportDeps } from "./structureImports"

const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const FACULTY = "01a1c5bc-79c0-7000-8000-000000000001"
const MALLA = "01a1c5bc-9000-7000-8000-000000000001"
const OLD_MALLA = "01a1c5bc-9000-7000-8000-000000000002"
const OTHER_MALLA = "01a1c5bc-9000-7000-8000-000000000003"
const FACULTY_NAME = "Facultad de Ciencias Administrativas"
const CAREERS_HEADER = ["Facultad", "Modalidad", "Código de carrera", "Nombre de la carrera", "Número de ciclos"]
const CURRICULUM_HEADER = ["Código", "Nombre de la materia", "Ciclo", "Unidad de organización", "Modalidad", "Horas ACD", "Horas APE", "Horas AA", "Créditos", "Prerrequisitos (códigos)"]
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`

type Subject = { id: string; careerId: string; mallaId: string; code: string; cycle: number; position: number; columns: Record<string, unknown> }
type State = {
  careers: { id: string; code: string; name: string; cycles: number; active: boolean; columns?: Record<string, unknown> }[]
  mallas: { id: string; careerId: string; cycles: number }[]
  subjects: Subject[]
  requirements: { id: string; subjectId: string; requirementId: string; extra: unknown[] }[]
  synced: number
  locked: boolean
}

let state: State
let bridge: FakeWorld
let ids: number

function signIn(role: string, careerId: string | null): void {
  bridge = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: golden.roleId })), lastActivity: NOW - 10 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role, careerId, careerLabel: careerId === null ? null : "Software" })],
  }
}

async function staged<T>(work: () => Promise<T>): Promise<T> {
  const snapshot = structuredClone(state)
  try {
    return await work()
  } catch (error) {
    state = snapshot
    throw error
  }
}

const nextId = () => `01a1c5bc-0000-7000-8000-${String(++ids).padStart(12, "0")}`

function careerTx(): CareerWriteTx {
  return {
    careerLocked: async () => state.locked,
    lockMalla: async (careerId: string, mallaId: string) => {
      const malla = state.mallas.find((candidate) => candidate.id === mallaId && candidate.careerId === careerId)
      return malla ? { id: malla.id, cycleCount: malla.cycles } : null
    },
    lastPosition: async (mallaId: string, cycle: unknown) => {
      const positions = state.subjects.filter((subject) => subject.mallaId === mallaId && subject.cycle === Number(cycle)).map((subject) => subject.position)
      return positions.length === 0 ? null : Math.max(...positions)
    },
    insertSubject: async (careerId: string, mallaId: string, columns: Record<string, unknown>) => {
      const id = nextId()
      state.subjects.push({ id, careerId, mallaId, code: String(columns.codigo_asignatura), cycle: Number(columns.ciclo_asignatura), position: Number(columns.orden_asignatura_en_ciclo), columns })
      return id
    },
  } as unknown as CareerWriteTx
}

function requirementTx(): CurriculumTx {
  return {
    guard: (_confirmed: boolean, _careerId: string, change: () => Promise<unknown>) => change(),
    careerLocked: async () => state.locked,
    lockMalla: async (careerId: string, mallaId: string) => {
      const malla = state.mallas.find((candidate) => candidate.id === mallaId && candidate.careerId === careerId)
      return malla ? { id: malla.id, cycleCount: malla.cycles } : null
    },
    lockSubjects: async (mallaId: string, subjectIds: string[]) =>
      state.subjects.filter((subject) => subject.mallaId === mallaId && subjectIds.includes(subject.id)).map((subject) => ({ id: subject.id, cycle: subject.cycle })),
    prerequisites: async () => state.requirements,
    findRequirement: async (subjectId: string, requirementId: string) => state.requirements.find((row) => row.subjectId === subjectId && row.requirementId === requirementId) ?? null,
    insertRequirement: async (subjectId: string, requirementId: string, ...extra: unknown[]) => {
      const id = nextId()
      state.requirements.push({ id, subjectId, requirementId, extra })
      return id
    },
    sync: async () => void state.synced++,
  } as unknown as CurriculumTx
}

function governanceTx(): GovernanceWriteTx {
  return {
    replace: (_confirmed: boolean, change: () => Promise<unknown>) => change(),
    createCareer: async (data: { code: string; name: string; cycleCount: number; facultyId: string; modality: string }) => {
      const id = nextId()
      state.careers.push({ id, code: data.code, name: data.name, cycles: data.cycleCount, active: true, columns: { ...data } })
      return id
    },
  } as unknown as GovernanceWriteTx
}

function deps(limiter = createRateLimiter()): StructureImportDeps {
  return {
    bridge: fakeDeps(bridge),
    limiter,
    now: () => NOW,
    store: {
      activeFaculties: async () => [{ id: FACULTY, name: FACULTY_NAME }],
      facultiesForImport: async () => [{ id: FACULTY, name: FACULTY_NAME }],
      careerCodes: async () => state.careers.map((career) => career.code),
      careerActive: async (id) => state.careers.some((career) => career.id === id && career.active),
      malla: async (careerId, mallaId) => {
        const malla = state.mallas.find((candidate) => candidate.id === mallaId && candidate.careerId === careerId)
        return malla ? { id: malla.id, cycleCount: malla.cycles } : null
      },
      mallaSubjects: async (id) => state.subjects.filter((subject) => subject.mallaId === id).map((subject) => ({ id: subject.id, code: subject.code, cycle: subject.cycle })),
    },
    governance: (work) => staged(() => work(governanceTx())),
    curriculum: (work) => staged(() => work({ subjects: careerTx(), requirements: requirementTx() })),
  }
}

function post(url: string, file: Buffer | null, fields: Record<string, string> = {}): Request {
  const form = new FormData()
  if (file !== null) form.append("file", new File([new Uint8Array(file)], "datos.xlsx"))
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return new Request(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { accept: "application/json", referer: "http://localhost:3000/", cookie, "x-csrf-token": golden.csrfToken },
    body: form,
  })
}

function get(url: string): Request {
  return new Request(`http://localhost:3000${url}`, { headers: { accept: "application/json", referer: "http://localhost:3000/", cookie } })
}

const careers = (file: Buffer | null, fields: Record<string, string> = {}, limiter?: ReturnType<typeof createRateLimiter>) =>
  importCareers(post("/api/v1/admin/academic/careers/import", file, fields), deps(limiter))
const curriculum = (file: Buffer | null, fields: Record<string, string> = {}) =>
  importCurriculum(post("/api/v1/coordination/academic/curriculum-import", file, { malla_id: MALLA, ...fields }), deps())
const json = async (response: Response) => JSON.parse(await response.text())

beforeEach(() => {
  ids = 0
  state = {
    careers: [{ id: CAREER, code: "SW-8", name: "Software", cycles: 4, active: true }],
    mallas: [
      { id: MALLA, careerId: CAREER, cycles: 4 },
      { id: OLD_MALLA, careerId: CAREER, cycles: 2 },
    ],
    subjects: [{ id: "01a1c5bc-7cbf-7091-860c-63a02b91e998", careerId: CAREER, mallaId: MALLA, code: "SW-B1-001", cycle: 1, position: 0, columns: {} }],
    requirements: [],
    synced: 0,
    locked: false,
  }
  signIn("administrador", null)
})

describe("POST /api/v1/admin/academic/careers/import", () => {
  it("imports careers all or nothing", async () => {
    const bad = await xlsx([CAREERS_HEADER, [FACULTY_NAME, "Presencial", "NC-1", "Carrera Uno", "10"], ["Inexistente", "Virtual", "NC-2", "Carrera Dos", "0"]])
    const rejected = await careers(bad, { confirm: "1" })
    expect(rejected.status).toBe(200)
    expect(await json(rejected)).toEqual({
      rows: [
        { line: 2, values: { facultad: FACULTY_NAME, modalidad: "Presencial", codigo: "NC-1", nombre: "Carrera Uno", ciclos: "10" }, errors: [] },
        {
          line: 3,
          values: { facultad: "Inexistente", modalidad: "Virtual", codigo: "NC-2", nombre: "Carrera Dos", ciclos: "0" },
          errors: ["La facultad no existe o está inactiva.", "La modalidad no es válida.", "El número de ciclos debe estar entre 1 y 30."],
        },
      ],
      valid: false,
      created: 0,
    })
    expect(state.careers).toHaveLength(1)

    const good = await xlsx([CAREERS_HEADER, [FACULTY_NAME.toUpperCase(), "en linea", "NC-1", " Carrera Uno ", 10]])
    const preview = await careers(good)
    expect((await json(preview)).created).toBe(0)
    expect(state.careers).toHaveLength(1)
    const created = await careers(good, { confirm: "1" })
    expect(await created.text()).toBe(
      '{"rows":[{"line":2,"values":{"facultad":"FACULTAD DE CIENCIAS ADMINISTRATIVAS","modalidad":"en linea","codigo":"NC-1","nombre":"Carrera Uno","ciclos":"10"},"errors":[]}],"valid":true,"created":1}',
    )
    expect(state.careers[1]).toMatchObject({ code: "NC-1", name: "Carrera Uno", cycles: 10, columns: { facultyId: FACULTY, modality: "en_linea" } })
  })

  it("reports taken and repeated codes with the row of the first one", async () => {
    const file = await xlsx([CAREERS_HEADER, [FACULTY_NAME, "Híbrida", "sw-8", "Repetida", "3"], [FACULTY_NAME, "Híbrida", "NC-X", "A", "3"], [FACULTY_NAME, "Híbrida", "nc-x", "B", "3.5"]])
    expect((await json(await careers(file))).rows.map((row: { errors: string[] }) => row.errors)).toEqual([
      ["Ya existe una carrera con este código."],
      [],
      ["El código se repite en la fila 3.", "El número de ciclos debe estar entre 1 y 30."],
    ])
  })

  it("validates the upload before the role and the role before reading the file", async () => {
    signIn("docente", CAREER)
    expect(await (await careers(null)).text()).toBe('{"message":"El campo archivo es obligatorio.","errors":{"file":["El campo archivo es obligatorio."]}}')
    const unreadable = await xlsx([["Facultad"], ["X"]])
    const forbidden = await careers(unreadable)
    expect(forbidden.status).toBe(403)
    expect(await forbidden.text()).toBe('{"message":"No puede importar carreras con el rol activo."}')
    signIn("administrador", null)
    expect(await (await curriculum(unreadable)).text()).toBe('{"message":"Solo la coordinación de la carrera puede importar la malla."}')
  })

  it("rejects files that are not .xlsx and confirmations that are not booleans", async () => {
    const pdf = await careers(Buffer.from("%PDF-1.4"), { confirm: "true" })
    expect(await json(pdf)).toEqual({
      message: "El campo archivo debe ser un archivo de tipo: xlsx. (y 1 error más)",
      errors: { file: ["El campo archivo debe ser un archivo de tipo: xlsx."], confirm: ["El campo confirmación debe ser verdadero o falso."] },
    })
  })

  it("counts empty rows toward the scanned row limit and rejects sheets declaring too many columns", async () => {
    const empty = await xlsx([CAREERS_HEADER, ...Array.from({ length: 650 }, () => [" ", "", "", "", ""])])
    expect((await json(await careers(empty))).errors.file).toEqual(["El archivo tiene demasiadas filas, contando las vacías. Use hasta 500 filas y borre las filas sobrantes."])
    const wide = await editPart(await xlsx([CAREERS_HEADER, [FACULTY_NAME, "Presencial", "NC-9", "Nueve", "10"]]), "xl/worksheets/sheet1.xml", (xml) =>
      xml.replace(/<dimension\b[^>]*\/>/, '<dimension ref="A1:XFD3"/>'),
    )
    const rejected = await careers(wide, { confirm: "1" })
    expect(rejected.status).toBe(422)
    expect((await json(rejected)).errors.file).toEqual(["El archivo tiene más de 64 columnas. Use la plantilla .xlsx."])
    expect(state.careers).toHaveLength(1)
  })

  it("imports the downloaded template once filled in", async () => {
    const template = Buffer.from(await (await careerImportTemplate(get("/api/v1/admin/academic/careers/import-template"), deps())).arrayBuffer())
    const book = await readBook(template)
    book.getWorksheet("Datos")!.getRow(2).values = [FACULTY_NAME, "Presencial", "NC-T", "Carrera Plantilla", "8"]
    const filled = Buffer.from(await book.xlsx.writeBuffer())
    expect((await json(await careers(filled, { confirm: "1" }))).created).toBe(1)
    expect(state.careers.map((career) => career.code)).toContain("NC-T")
  })

  it("limits imports to ten per minute", async () => {
    const limiter = createRateLimiter()
    const file = await xlsx([CAREERS_HEADER, [FACULTY_NAME, "Presencial", "NC-1", "Uno", "1"]])
    for (let attempt = 0; attempt < 10; attempt++) expect((await careers(file, {}, limiter)).status).toBe(200)
    const limited = await careers(file, {}, limiter)
    expect(limited.status).toBe(429)
  })
})

describe("GET career and curriculum import templates", () => {
  it("downloads the career template with faculty and modality lists for administrators only", async () => {
    const response = await careerImportTemplate(get("/api/v1/admin/academic/careers/import-template"), deps())
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=plantilla-carreras.xlsx")
    const book = await readBook(Buffer.from(await response.arrayBuffer()))
    expect(book.getWorksheet("Datos")!.getCell("A2").dataValidation).toMatchObject({ type: "list", formulae: ["Listas!$A$1:$A$1"] })
    expect(book.getWorksheet("Datos")!.getCell("B2").dataValidation).toMatchObject({ type: "list", formulae: ["Listas!$B$1:$B$3"] })
    expect(book.getWorksheet("Listas")!.getCell("A1").value).toBe(FACULTY_NAME)
    signIn("coordinador", CAREER)
    expect(await (await careerImportTemplate(get("/api/v1/admin/academic/careers/import-template"), deps())).text()).toBe(
      '{"message":"No puede importar carreras con el rol activo."}',
    )
  })

  it("downloads the curriculum template for the coordination of an active career", async () => {
    signIn("coordinador", CAREER)
    const response = await curriculumImportTemplate(get("/api/v1/coordination/academic/curriculum-import/template"), deps())
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=plantilla-malla.xlsx")
    const sheet = (await readBook(Buffer.from(await response.arrayBuffer()))).getWorksheet("Datos") as ExcelJS.Worksheet
    expect(sheet.getCell("F1").value).toBe("Genera sílabo")
    expect(sheet.getRow(1).values).toEqual([undefined, ...CURRICULUM_HEADER.slice(0, 5), "Genera sílabo", ...CURRICULUM_HEADER.slice(5), undefined, expect.any(String)])
    expect(String(sheet.getCell("M2").value)).toContain("Prerrequisitos (de un ciclo anterior): códigos separados por coma")
    expect(String(sheet.getCell("M2").value)).not.toMatch(/correquisito/i)
    signIn("docente", CAREER)
    expect((await curriculumImportTemplate(get("/api/v1/coordination/academic/curriculum-import/template"), deps())).status).toBe(403)
  })
})

describe("POST /api/v1/coordination/academic/curriculum-import", () => {
  beforeEach(() => signIn("coordinador", CAREER))

  it("imports the curriculum with its requirements all or nothing", async () => {
    const bad = await xlsx([CURRICULUM_HEADER, ["IMP-001", "Programación I", "1", "Unidad básica", "Presencial", "48", "32", "64", "3", "NO-EXISTE"]])
    const rejected = await json(await curriculum(bad, { confirm: "1" }))
    expect(rejected).toMatchObject({ valid: false, created: 0 })
    expect(rejected.rows[0].errors).toEqual(["El requisito NO-EXISTE no está en la malla ni en el archivo."])
    const file = await xlsx([
      CURRICULUM_HEADER,
      ["IMP-001", "Programación I", "1", "Unidad básica", "Presencial", "48", "32", "64", "3", ""],
      ["IMP-002", "Programación II", "2", "Unidad profesional", "", "48,5", "32", "64", "3", "IMP-001; sw-b1-001"],
    ])
    expect(await json(await curriculum(file, { confirm: "1" }))).toMatchObject({ valid: true, created: 2 })
    expect(state.subjects.find((subject) => subject.code === "IMP-001")!.columns).toMatchObject({ modalidad_asignatura: "presencial" })
    const second = state.subjects.find((subject) => subject.code === "IMP-002")!
    expect(second.columns).toMatchObject({ horas_docencia: 48.5, unidad_curricular_asignatura: "profesional", modalidad_asignatura: null, genera_silabo_asignatura: true })
    expect(state.requirements.map((row) => [row.subjectId, row.extra])).toEqual([
      [second.id, []],
      [second.id, []],
    ])
    expect(state.synced).toBe(2)
  })

  it("imports into a career without subjects", async () => {
    state.subjects = []
    const file = await xlsx([CURRICULUM_HEADER, ["VAC-001", "Base", "1", "Unidad básica", "", "1", "1", "1", "1", ""], ["VAC-002", "Siguiente", "2", "Unidad básica", "", "1", "1", "1", "1", "VAC-001"]])
    expect((await json(await curriculum(file, { confirm: "1" }))).created).toBe(2)
    expect(state.subjects).toHaveLength(2)
  })

  it("checks that requirements follow the cycles", async () => {
    const wrong = await xlsx([CURRICULUM_HEADER, ["CIC-001", "Base", "1", "Unidad básica", "", "1", "1", "1", "1", ""], ["CIC-002", "Par", "1", "Unidad básica", "", "1", "1", "1", "1", "CIC-001"]])
    const body = await json(await curriculum(wrong))
    expect(body.valid).toBe(false)
    expect(body.rows[1].errors[0]).toBe("El prerrequisito CIC-001 debe estar en un ciclo anterior.")
  })

  it("ignores the corequisite column of files made with an older template and keeps their prerequisites", async () => {
    state.subjects = []
    const file = await xlsx([
      [...CURRICULUM_HEADER, "Correquisitos (códigos)"],
      ["COR-001", "Base", "1", "Unidad básica", "", "1", "1", "1", "1", "", ""],
      ["COR-002", "Par", "1", "Unidad básica", "", "1", "1", "1", "1", "", "COR-001"],
      ["COR-003", "Siguiente", "2", "Unidad básica", "", "1", "1", "1", "1", "COR-001", "COR-002"],
    ])
    expect(await json(await curriculum(file, { confirm: "1" }))).toMatchObject({ valid: true, created: 3 })
    const ids = new Map(state.subjects.map((subject) => [subject.code, subject.id]))
    expect(state.requirements.map((row) => [row.subjectId, row.requirementId, row.extra])).toEqual([[ids.get("COR-003"), ids.get("COR-001"), []]])
  })

  it("marks subjects without syllabus and keeps files of the old template working", async () => {
    const header = [...CURRICULUM_HEADER.slice(0, 5), "Genera sílabo", ...CURRICULUM_HEADER.slice(5)]
    const bad = await xlsx([header, ["SIL-001", "Optativa", "1", "Unidad básica", "", "Quizás", "48", "32", "64", "3", ""]])
    expect((await json(await curriculum(bad, { confirm: "1" }))).rows[0].errors).toEqual(["Genera sílabo debe ser Sí o No."])
    const file = await xlsx([
      header,
      ["SIL-001", "Con sílabo", "1", "Unidad básica", "", "Sí", "48", "32", "64", "3", ""],
      ["SIL-002", "Sin sílabo", "1", "Unidad básica", "", "No", "48", "32", "64", "3", ""],
      ["SIL-003", "Vacía", "1", "Unidad básica", "", "", "48", "32", "64", "3", ""],
    ])
    expect((await json(await curriculum(file, { confirm: "1" }))).created).toBe(3)
    const old = await xlsx([CURRICULUM_HEADER, ["SIL-004", "De plantilla anterior", "1", "Unidad básica", "", "48", "32", "64", "3", ""]])
    expect((await json(await curriculum(old, { confirm: "1" }))).created).toBe(1)
    const generates = (code: string) => state.subjects.find((subject) => subject.code === code)?.columns.genera_silabo_asignatura
    expect(["SIL-001", "SIL-002", "SIL-003", "SIL-004"].map(generates)).toEqual([true, false, true, true])
    expect(state.subjects.filter((subject) => subject.cycle === 1).map((subject) => subject.position)).toEqual([0, 1, 2, 3, 4])
  })

  it("keeps PHP's renumbered keys when codes are integers", async () => {
    const file = await xlsx([CURRICULUM_HEADER, ["101", "Num A", "1", "Unidad básica", "", "1", "1", "1", "1", ""], ["102", "Num B", "1", "Unidad básica", "", "1", "1", "1", "1", "101"]])
    expect((await json(await curriculum(file))).rows.map((row: { errors: string[] }) => row.errors)).toEqual([[], []])
  })

  it("loads into the malla it names: that malla's cycles, codes and prerequisites", async () => {
    const file = await xlsx([
      CURRICULUM_HEADER,
      ["SW-B1-001", "Algoritmos (malla anterior)", "1", "Unidad básica", "", "1", "1", "1", "1", ""],
      ["OLD-002", "Siguiente", "2", "Unidad básica", "", "1", "1", "1", "1", "SW-B1-001"],
      ["OLD-003", "Fuera de la malla", "3", "Unidad básica", "", "1", "1", "1", "1", ""],
    ])
    const preview = await json(await curriculum(file, { malla_id: OLD_MALLA }))
    expect(preview.rows.map((row: { errors: string[] }) => row.errors)).toEqual([[], [], ["El ciclo debe estar entre 1 y 2."]])
    const fits = await xlsx([CURRICULUM_HEADER, ["SW-B1-001", "Algoritmos (malla anterior)", "1", "Unidad básica", "", "1", "1", "1", "1", ""], ["OLD-002", "Siguiente", "2", "Unidad básica", "", "1", "1", "1", "1", "SW-B1-001"]])
    expect(await json(await curriculum(fits, { malla_id: OLD_MALLA, confirm: "1" }))).toMatchObject({ valid: true, created: 2 })
    const added = state.subjects.filter((subject) => subject.mallaId === OLD_MALLA)
    expect(added.map((subject) => [subject.code, subject.careerId])).toEqual([
      ["SW-B1-001", CAREER],
      ["OLD-002", CAREER],
    ])
    expect(state.requirements.map((row) => [row.subjectId, row.requirementId])).toEqual([[added[1].id, added[0].id]])
  })

  it("requires a malla of the career and creates nothing otherwise", async () => {
    const file = await xlsx([CURRICULUM_HEADER, ["IMP-001", "Programación I", "1", "Unidad básica", "", "48", "32", "64", "3", ""]])
    state.mallas.push({ id: OTHER_MALLA, careerId: "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9", cycles: 4 })
    const missing = importCurriculum(post("/api/v1/coordination/academic/curriculum-import", file, { confirm: "1" }), deps())
    expect(await (await missing).text()).toBe('{"message":"El campo malla es obligatorio.","errors":{"malla_id":["El campo malla es obligatorio."]}}')
    const foreign = await curriculum(file, { malla_id: OTHER_MALLA, confirm: "1" })
    expect(foreign.status).toBe(422)
    expect((await json(foreign)).errors).toEqual({ malla_id: ["El valor seleccionado en malla no es válido."] })
    expect(state.subjects).toHaveLength(1)
  })

  it("stops on an open convocation and creates nothing", async () => {
    state.locked = true
    const file = await xlsx([CURRICULUM_HEADER, ["IMP-001", "Programación I", "1", "Unidad básica", "", "48", "32", "64", "3", ""]])
    const response = await curriculum(file, { confirm: "1" })
    expect(await response.text()).toBe('{"message":"Periodo académico activo","errors":{"process":["Periodo académico activo"]}}')
    expect(state.subjects).toHaveLength(1)
  })
})

describe("curriculum import through /api/v1/admin/careers/{career}/academic/curriculum-import", () => {
  const OTHER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
  const adminImport = (careerId: string, file: Buffer, mallaId = OTHER_MALLA) =>
    importCurriculum(post(`/api/v1/admin/careers/${careerId}/academic/curriculum-import`, file, { confirm: "1", malla_id: mallaId }), deps(), careerId)
  const row = () => xlsx([CURRICULUM_HEADER, ["ADM-001", "Redes I", "1", "Unidad básica", "", "48", "32", "64", "3", ""]])

  beforeEach(() => {
    state.careers.push({ id: OTHER, code: "RD-8", name: "Redes", cycles: 4, active: true })
    state.mallas.push({ id: OTHER_MALLA, careerId: OTHER, cycles: 4 })
  })

  it("lets the administrator download the template and import into the requested career", async () => {
    const template = await curriculumImportTemplate(get(`/api/v1/admin/careers/${OTHER}/academic/curriculum-import/template`), deps(), OTHER)
    expect(template.headers.get("content-disposition")).toBe("attachment; filename=plantilla-malla.xlsx")
    expect(await json(await adminImport(OTHER, await row()))).toMatchObject({ valid: true, created: 1 })
    expect(state.subjects.find((subject) => subject.code === "ADM-001")?.careerId).toBe(OTHER)
  })

  it("answers 404 to the administrator for an unknown career", async () => {
    expect((await adminImport("01a1c5bc-79cf-7000-8000-000000000009", await row())).status).toBe(404)
    expect(state.subjects).toHaveLength(1)
  })

  it("refuses a coordinator who sends another career and creates nothing", async () => {
    signIn("coordinador", CAREER)
    expect((await adminImport(OTHER, await row())).status).toBe(403)
    expect((await curriculumImportTemplate(get(`/api/v1/admin/careers/${OTHER}/academic/curriculum-import/template`), deps(), OTHER)).status).toBe(403)
    expect(state.subjects).toHaveLength(1)
  })
})
