// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { buildIdentification } from "../syllabus/identificationCard"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "./testing"
import { previewSubjectProfile, subjectAcademicContext, type SubjectContextRow, type SubjectPreviewDeps } from "./subjectProfilePreview"
import type { PhpRecord } from "./phpValues"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const FACULTY = "01a1c5bc-798f-72af-b64b-3cd174a1687b"
const SUBJECT = "01a1c5bc-7a00-7000-8000-0000000000aa"
const EMPTY_FORBIDDEN = '{\n    "message": ""\n}'

const SUBJECT_ROW: SubjectContextRow = {
  id: SUBJECT,
  code: "SW-P7-037",
  name: "Inteligencia artificial",
  cycle: 7,
  position: 2,
  unit: "profesional",
  credits: "2.00",
  total_hours: 96,
  hours_ac: "32.00",
  hours_pae: "16.50",
  hours_aa: "48.00",
  career_id: CAREER,
  career_code: "SW",
  career_name: "Software",
  cycle_count: 8,
  faculty_id: FACULTY,
  faculty: "Ciencias Administrativas",
  faculty_logo: null,
}

let root: string
let world: FakeWorld
let templates: FakeTemplateWorld
let forwarded: Request[]
let subjects: Map<string, string>
let contexts: Map<string, PhpRecord>

const deps = (): SubjectPreviewDeps => ({
  bridge: fakeDeps(world, forwarded),
  store: fakeTemplateStore(templates),
  subjectCareer: async (id) => subjects.get(id) ?? null,
  careerActive: async (id) => [CAREER, OTHER_CAREER].includes(id),
  subjectContext: async (id) => contexts.get(id) ?? null,
  logos: { faculty: async () => null },
})

const get = (subject = SUBJECT) =>
  previewSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha/vista-previa`, { cookie, headers: { host: "localhost:3000" } }), subject, deps())

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

function asRole(role: string, careerId: string | null) {
  world.assignments = [makeAssignment({ role, careerId })]
}

type Field = { id: string; key: string; value: unknown; document: unknown; template?: unknown }

function fieldsOf(body: { sections: { fields: Field[] }[] }): Map<string, Field> {
  return new Map(body.sections.flatMap((section) => section.fields).map((field) => [field.key, field]))
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-preview-"))
  process.env.LARAVEL_STORAGE_PATH = path.join(root, "storage", "app")
  process.env.LARAVEL_PUBLIC_PATH = path.join(root, "public")
})

afterAll(async () => {
  delete process.env.LARAVEL_STORAGE_PATH
  delete process.env.LARAVEL_PUBLIC_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  templates = { template: goldenTemplate(), values: [] }
  forwarded = []
  subjects = new Map([[SUBJECT, CAREER]])
  contexts = new Map([
    [
      SUBJECT,
      subjectAcademicContext(SUBJECT_ROW, [
        { type: "prerrequisito", code: "SW-P6-032" },
        { type: "correquisito", code: "SW-P7-040" },
        { type: "prerrequisito", code: "SW-P5-021" },
      ]),
    ],
  ])
})

describe("GET academic/asignaturas/{asignatura}/ficha/vista-previa", () => {
  it("builds the curriculum snapshot of the subject with the keys of AcademicContextSnapshot::forSubject", () => {
    const context = contexts.get(SUBJECT)!
    expect(Object.keys(context)).toEqual(["schema_version", "career", "curriculum", "subject"])
    expect(context.career).toEqual({ id: CAREER, code: "SW", name: "Software", faculty: "Ciencias Administrativas", faculty_id: FACULTY, faculty_logo: null })
    expect(context.curriculum).toEqual({ id: CAREER, cycle_count: 8 })
    expect(context.subject).toEqual({
      id: SUBJECT,
      code: "SW-P7-037",
      name: "Inteligencia artificial",
      cycle: 7,
      position: 2,
      organization_unit: "Unidad profesional",
      credits: "2.00",
      total_hours: 96,
      hours_ac: "32.00",
      hours_pae: "16.50",
      hours_aa: "48.00",
      prerequisites: ["SW-P5-021", "SW-P6-032"],
      corequisites: ["SW-P7-040"],
    })
    expect(buildIdentification(context, [], [], [])).toMatchObject({
      faculty: "Ciencias Administrativas",
      career: "Software",
      subject: "Inteligencia artificial",
      cycle: "Séptimo",
      code: "SW-P7-037",
      prerequisites: "SW-P5-021, SW-P6-032",
      corequisites: "SW-P7-040",
      organization_unit: "Unidad profesional",
      hours_ac: "32",
      hours_pae: "16.5",
      credits: "2",
      modality: "",
      period: "",
      teacher: "",
    })
  })

  it("shows the coordinator the syllabus with curriculum data and the saved profile only", async () => {
    asRole("coordinador", CAREER)
    const descriptionIndex = goldenFields.findIndex((field) => field.key === "descripcion")
    templates.values = [{ fieldId: fieldId(descriptionIndex), subjectId: SUBJECT, value: goldenFields[descriptionIndex].stored }]

    const response = await read(await get())

    expect(response.status).toBe(200)
    const body = JSON.parse(response.text)
    expect(Object.keys(body)).toEqual(["presentation", "sections"])
    expect(Object.keys(body.presentation)).toEqual(["document", "appearance", "title", "logos"])
    expect(body.presentation.logos).toEqual({
      institution: "http://localhost:3000/logos/institucion?v=0",
      faculty: "http://localhost:3000/images/silabo/facultad.jpeg?v=0",
    })
    const fields = fieldsOf(body)
    expect(JSON.stringify(fields.get("descripcion")!.value)).toContain("Escrito por carrera")
    const objective = goldenFields.find((field) => field.key === "objetivo_general")!
    expect(fields.get("objetivo_general")!.value).toEqual(JSON.parse(objective.expected.normalized))
    expect(response.text).toContain("Inteligencia artificial")
    expect(response.text).toContain("SW-P5-021, SW-P6-032")
  })

  it("lets the administrator preview any subject", async () => {
    asRole("administrador", null)
    expect((await get()).status).toBe(200)
  })

  it("forbids another career and the teacher with an empty 403", async () => {
    asRole("coordinador", OTHER_CAREER)
    expect(await read(await get())).toEqual({ status: 403, text: EMPTY_FORBIDDEN })
    asRole("docente", CAREER)
    expect(await read(await get())).toEqual({ status: 403, text: EMPTY_FORBIDDEN })
  })

  it("leaves unknown subjects, non-UUID ids and an undefined template to Laravel", async () => {
    asRole("coordinador", CAREER)
    expect((await get("01a1c5bc-7a00-7000-8000-0000000000ff")).status).toBe(299)
    expect((await get("abc")).status).toBe(404)
    templates.template = { ...goldenTemplate(), definition: null }
    expect((await get()).status).toBe(299)
    expect(forwarded).toHaveLength(2)
  })

  it("answers 401 without a session", async () => {
    const response = await previewSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha/vista-previa`), SUBJECT, deps())
    expect(await read(response)).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
  })
})
