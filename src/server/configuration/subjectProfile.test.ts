// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, fieldId, goldenCatalog, goldenFields, goldenPresentation, goldenTemplate, type FakeTemplateWorld } from "./testing"
import { showSubjectProfile, type SubjectProfileDeps } from "./subjectProfile"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const SUBJECT = "01a1c5bc-7a00-7000-8000-0000000000aa"
const EMPTY_FORBIDDEN = '{"message":""}'

let world: FakeWorld
let templates: FakeTemplateWorld
let subjects: Map<string, string>
let activeCareers: Set<string>

const deps = (): SubjectProfileDeps => ({
  bridge: fakeDeps(world),
  store: fakeTemplateStore(templates),
  subjectCareer: async (id) => subjects.get(id) ?? null,
  careerActive: async (id) => activeCareers.has(id),
})

const get = (subject = SUBJECT) => showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie }), subject, deps())

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

const careerIndexes = goldenFields.map((field, index) => ({ field, index })).filter(({ field }) => field.quien_llena !== "institucional" && field.expected.writable === "true")
const ok = (encoded: string): string => JSON.stringify(JSON.parse(encoded).ok)

function expectedBody(values: string, complete: boolean): string {
  const fields = careerIndexes
    .map(
      ({ field, index }) =>
        `{"id":"${fieldId(index)}","key":"${field.key}","label":${JSON.stringify(field.label)},"quien_llena":"${field.quien_llena}","content":${field.content_json},` +
        `"template":${field.expected.template},"section":${JSON.stringify(field.section_title)},"position":${index}}`,
    )
    .join(",")
  const variables = (JSON.parse(goldenCatalog) as { key: string; sample: string }[]).map((item) => `${JSON.stringify(item.key)}:${JSON.stringify(item.sample)}`).join(",")
  return `{"fields":[${fields}],"values":${values},"complete":${complete},"definition":${goldenPresentation},"variables":{${variables}}}`
}

function asRole(role: string, careerId: string | null) {
  world.assignments = [makeAssignment({ role, careerId })]
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  templates = { template: goldenTemplate(), values: [] }
  subjects = new Map([[SUBJECT, CAREER]])
  activeCareers = new Set([CAREER, OTHER_CAREER])
})

describe("GET academic/asignaturas/{asignatura}/ficha", () => {
  it("lists every career field with a space to write, without values, for the coordinator of the career", async () => {
    asRole("coordinador", CAREER)

    const response = await read(await get())

    expect(response.status).toBe(200)
    expect(JSON.parse(response.text)).toEqual(JSON.parse(expectedBody("{}", false)))
  })

  it("the administrator sees the profile of any career with the stored values following the template", async () => {
    asRole("administrador", null)
    const respuestas = goldenFields.findIndex((field) => field.key === "respuestas")
    const descripcion = goldenFields.findIndex((field) => field.key === "descripcion")
    const firmas = goldenFields.findIndex((field) => field.key === "firmas")
    templates.values = [
      { fieldId: fieldId(respuestas), subjectId: SUBJECT, value: goldenFields[respuestas].stored },
      { fieldId: fieldId(firmas), subjectId: SUBJECT, value: goldenFields[firmas].stored },
      { fieldId: fieldId(descripcion), subjectId: SUBJECT, value: goldenFields[descripcion].stored },
      { fieldId: fieldId(descripcion), subjectId: "01a1c5bc-7a00-7000-8000-0000000000bb", value: null },
    ]

    const response = await read(await get())

    const values = `{"${fieldId(respuestas)}":${ok(goldenFields[respuestas].expected.follow)},"${fieldId(descripcion)}":${ok(goldenFields[descripcion].expected.follow)}}`
    expect(response.status).toBe(200)
    expect(JSON.parse(response.text)).toEqual(JSON.parse(expectedBody(values, true)))
  })

  it("a stored value that is not a document is listed as null", async () => {
    asRole("coordinador", CAREER)
    const descripcion = goldenFields.findIndex((field) => field.key === "descripcion")
    templates.values = [{ fieldId: fieldId(descripcion), subjectId: SUBJECT, value: "texto suelto" }]

    const response = await read(await get())

    expect(JSON.parse(response.text)).toEqual(JSON.parse(expectedBody(`{"${fieldId(descripcion)}":null}`, false)))
  })

  it("another career, a teacher and an inactive career get abort(403) with an empty message", async () => {
    asRole("coordinador", OTHER_CAREER)
    expect(await read(await get())).toEqual({ status: 403, text: EMPTY_FORBIDDEN })

    asRole("docente", CAREER)
    expect(await read(await get())).toEqual({ status: 403, text: EMPTY_FORBIDDEN })

    asRole("coordinador", CAREER)
    activeCareers.delete(CAREER)
    expect(await read(await get())).toEqual({ status: 403, text: EMPTY_FORBIDDEN })
  })

  it("without a session answers 401 like Laravel", async () => {
    const response = await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`), SUBJECT, deps())
    expect(await read(response)).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
  })

  it("answers Laravel's model 404 for a missing subject and a missing template, and the router 404 for a non-UUID id", async () => {
    asRole("coordinador", CAREER)
    const unknown = await get("01a1c5bc-7a00-7000-8000-0000000000ff")
    expect([unknown.status, await unknown.text()]).toEqual([404, '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Subject] 01a1c5bc-7a00-7000-8000-0000000000ff"}'])
    expect((await get("no-es-uuid")).status).toBe(404)
    templates.template = null
    const missing = await get()
    expect([missing.status, await missing.text()]).toEqual([404, '{"message":"No query results for model [App\\\\Modules\\\\Configuration\\\\Infrastructure\\\\Persistence\\\\Models\\\\SyllabusTemplate]."}'])
  })
})
