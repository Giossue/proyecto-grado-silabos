// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected, purgeRequired } from "../syllabus/inProgressWork"
import type { PhpRecord } from "./phpValues"
import { showSubjectProfile } from "./subjectProfile"
import { updateSubjectProfile, type SubjectProfileTx, type SubjectProfileWriteDeps } from "./subjectProfileWrites"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "./testing"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const SUBJECT = "01a1c5bc-7a00-7000-8000-0000000000aa"
const EMPTY_FORBIDDEN = '{\n    "message": ""\n}'
const STRUCTURE = "Complete solo los espacios de respuesta. El texto, los encabezados y la estructura los define Administración."

const index = (key: string) => goldenFields.findIndex((field) => field.key === key)
const DESCRIPCION = fieldId(index("descripcion"))
const OBJETIVO = fieldId(index("objetivo_general"))
const RESPUESTAS = fieldId(index("respuestas"))
const BIBLIOGRAFIA_INSTITUCIONAL = fieldId(index("firmas"))

const text = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] })
const stored = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: value }] }] })

let world: FakeWorld
let templates: FakeTemplateWorld
let forwarded: Request[]
let subjects: Map<string, string>
let lockedCareers: Set<string>
let purge: Record<string, string[]> | null
let log: string[]

function deps(): SubjectProfileWriteDeps {
  const tx: SubjectProfileTx = {
    store: fakeTemplateStore(templates),
    lockSubject: async (id) => {
      log.push(`lock:subject:${id}`)
      const careerId = subjects.get(id)
      return careerId === undefined ? null : { careerId }
    },
    careerLocked: async (careerId) => lockedCareers.has(careerId),
    deleteValue: async (subjectId, field) => {
      log.push(`delete:${field}`)
      templates.values = templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field))
    },
    saveValue: async (subjectId, field, document) => {
      log.push(`save:${field}`)
      templates.values = [...templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field)), { fieldId: field, subjectId, value: document }]
    },
    keepContent: async (confirmed, careerId, subjectIds, change) => {
      log.push(`keep:${confirmed}:${careerId}:${subjectIds.join(",")}`)
      const result = await change()
      if (purge !== null && !confirmed) throw new GenerationRejected(purge)
      return result
    },
  }
  return {
    bridge: fakeDeps(world, forwarded),
    store: fakeTemplateStore(templates),
    subjectCareer: async (id) => subjects.get(id) ?? null,
    careerActive: async () => true,
    async transaction(work) {
      const values = templates.values
      log.push("begin")
      try {
        const result = await work(tx)
        log.push("commit")
        return result
      } catch (error) {
        templates.values = values
        log.push("rollback")
        throw error
      }
    },
  }
}

async function put(body: unknown, subject = SUBJECT) {
  const request = new Request(
    apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie, method: "PUT", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify(body) },
  )
  const response = await updateSubjectProfile(request, subject, deps())
  const raw = await response.text()
  return { status: response.status, text: raw, json: raw.startsWith("{") ? (JSON.parse(raw) as Record<string, unknown>) : null }
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
  forwarded = []
  subjects = new Map([[SUBJECT, CAREER]])
  lockedCareers = new Set()
  purge = null
  log = []
  asRole("coordinador", CAREER)
})

describe("PUT academic/asignaturas/{asignatura}/ficha", () => {
  it("saves what coordination wrote, drops the fields left empty and answers the profile like GET", async () => {
    templates.values = [{ fieldId: OBJETIVO, subjectId: SUBJECT, value: stored("Objetivo anterior") }]

    const response = await put({ values: { [DESCRIPCION]: text("Texto de descripcion"), [OBJETIVO]: null } })

    expect(response.status).toBe(200)
    expect(log).toEqual(["begin", `keep:false:${CAREER}:${SUBJECT}`, `lock:subject:${SUBJECT}`, `save:${DESCRIPCION}`, `delete:${OBJETIVO}`, "commit"])
    expect(templates.values).toEqual([{ fieldId: DESCRIPCION, subjectId: SUBJECT, value: stored("Texto de descripcion") }])
    const shown = await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { cookie }), SUBJECT, deps())
    expect(response.text).toBe(await shown.text())
  })

  it("the administrator saves any career and a document equal to the template is not stored", async () => {
    asRole("administrador", null)
    const response = await put({ values: { [DESCRIPCION]: { type: "doc", content: [{ type: "paragraph" }] } } })
    expect(response.status).toBe(200)
    expect(log).toContain(`delete:${DESCRIPCION}`)
    expect(templates.values).toEqual([])
  })

  it("only accepts fields of the career project, before opening the transaction", async () => {
    const message = "El proyecto de carrera incluye un campo que ya no existe en la plantilla."
    expect((await put({ values: { [BIBLIOGRAFIA_INSTITUCIONAL]: text("No") } })).json).toEqual({ message, errors: { values: [message] } })
    expect((await put({ values: { "01a1c5bc-7a00-7000-8000-00000000dead": text("No") } })).json?.errors).toEqual({ values: [message] })
    asRole("docente", CAREER)
    expect((await put({ values: { "01a1c5bc-7a00-7000-8000-00000000dead": text("No") } })).status).toBe(422)
    expect(log).toEqual([])
  })

  it("validates values like SaveSubjectProfileRequest", async () => {
    expect((await put({})).json?.errors).toEqual({ values: ["El campo datos del proyecto de carrera debe estar presente."] })
    expect((await put({ values: "x" })).json?.errors).toEqual({ values: ["El campo datos del proyecto de carrera debe ser una lista."] })
    expect((await put({ values: { [DESCRIPCION]: "texto" } })).json?.errors).toEqual({ [`values.${DESCRIPCION}`]: ["El campo dato del proyecto de carrera debe ser una lista."] })
    expect(log).toEqual([])
  })

  it("rejects a value that is not a document or changes the fixed format, under the attribute of the field", async () => {
    expect((await put({ values: { [DESCRIPCION]: { type: "html" } } })).json?.errors).toEqual({
      [`values.${DESCRIPCION}`]: ["El contenido debe ser un documento de texto, listas o tablas."],
    })
    const respuestas = JSON.parse(goldenFields[index("respuestas")].expected.template) as PhpRecord
    const changed = { ...respuestas, content: [{ type: "paragraph", content: [{ type: "text", text: "Otro texto" }] }, ...(respuestas.content as unknown[]).slice(1)] }
    expect((await put({ values: { [RESPUESTAS]: changed } })).json?.errors).toEqual({ [`values.${RESPUESTAS}`]: [STRUCTURE] })
    expect(log.at(-1)).toBe("rollback")
    expect(templates.values).toEqual([])
  })

  it("does not let coordination remove an option that a condition of the template uses", async () => {
    const respuestas = JSON.parse(goldenFields[index("respuestas")].expected.template) as PhpRecord
    const [first, ...rest] = respuestas.content as PhpRecord[]
    const [label, response] = first.content as PhpRecord[]
    const attrs = response.attrs as PhpRecord
    const withoutSi = { ...first, content: [label, { ...response, attrs: { ...attrs, options: [{ const: "no", title: "No" }] } }] }
    const result = await put({ values: { [RESPUESTAS]: { ...respuestas, content: [withoutSi, ...rest] } } })
    expect(result.json?.errors).toEqual({
      [`values.${RESPUESTAS}`]: ["No puede quitar una opción que la plantilla usa para mostrar u ocultar otra parte del sílabo. Déjela o pida a Administración que cambie esa condición."],
    })
    const tooFew = { ...first, content: [label, { ...response, attrs: { ...attrs, options: [] } }] }
    expect((await put({ values: { [RESPUESTAS]: { ...respuestas, content: [tooFew, ...rest] } } })).json?.errors).toEqual({
      [`values.${RESPUESTAS}`]: ["Deje al menos una opción en la respuesta de la plantilla."],
    })
  })

  it("another career and a teacher get abort(403) inside the transaction, which is rolled back", async () => {
    asRole("coordinador", OTHER_CAREER)
    expect(await put({ values: { [DESCRIPCION]: text("x") } })).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    asRole("docente", CAREER)
    expect(await put({ values: [] })).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    expect(log.filter((entry) => entry === "rollback")).toHaveLength(2)
  })

  it("an open convocation of the career locks its career project", async () => {
    lockedCareers.add(CAREER)
    expect((await put({ values: { [DESCRIPCION]: text("x") } })).json?.errors).toEqual({ process: ["Convocatoria activa"] })
    expect(templates.values).toEqual([])
  })

  it("asks to confirm before sending syllabi in progress back to draft, and passes confirm_purge", async () => {
    purge = purgeRequired(2)
    const asked = await put({ values: { [DESCRIPCION]: text("x") } })
    expect(asked.status).toBe(422)
    expect(asked.json?.errors).toEqual(purge)
    expect(templates.values).toEqual([])
    const confirmed = await put({ values: { [DESCRIPCION]: text("x") }, confirm_purge: true })
    expect(confirmed.status).toBe(200)
    expect(log).toContain(`keep:true:${CAREER}:${SUBJECT}`)
  })

  it("without a CSRF token answers 419 and leaves an unknown or non-UUID subject to Laravel", async () => {
    const anonymous = await updateSubjectProfile(
      new Request(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { method: "PUT", headers: { "content-type": "application/json" } }), { body: "{}" }),
      SUBJECT,
      deps(),
    )
    expect(anonymous.status).toBe(419)
    expect((await put({ values: [] }, "01a1c5bc-7a00-7000-8000-0000000000ff")).status).toBe(299)
    expect((await put({ values: [] }, "no-es-uuid")).status).toBe(404)
    expect(forwarded).toHaveLength(1)
  })
})
