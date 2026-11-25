// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, fieldId, goldenTemplate, TEMPLATE_ID, type FakeTemplateWorld } from "../configuration/testing"
import type { PhpRecord } from "../configuration/phpValues"
import { updateDraftField, type DraftFieldDeps, type DraftFieldRecord, type DraftSyllabus } from "./draftField"
import type { IdentificationSource } from "./identificationCard"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const SUBJECT = "a0000000-0000-4000-8000-000000000001"
const NEW_VALUE = "01a1c5ba-eeee-7000-8000-000000000001"
const TEXT_FIELD = fieldId(8)
const UNITS_FIELD = fieldId(6)
const INSTITUTIONAL_FIELD = fieldId(15)
const SAVED_AT = "2027-01-15T10:00:00+00:00"

let world: FakeWorld
let templates: FakeTemplateWorld
let facts: DraftSyllabus | null
let locked: { id: string; state: string; version: number; subjectId: string } | null
let fields: Map<string, DraftFieldRecord>
let values: Map<string, unknown>
let log: string[]
let saved: { syllabusId: string; fieldId: string; document: PhpRecord; newId: string }[]
let drafts: { id: string; version: number; savedAt: number }[]
let committed: boolean
let today: string
let teachers: IdentificationSource["teachers"]

const doc = (text: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

function liveField(index: number): DraftFieldRecord {
  const field = goldenTemplate().sections.flatMap((section) => section.blocks.flatMap((block) => block.fields))[index]
  return { id: field.id, templateId: TEMPLATE_ID, responsible: field.responsible, content: field.content, key: field.key, live: true }
}

function deps(): DraftFieldDeps {
  return {
    bridge: fakeDeps(world),
    templates: fakeTemplateStore(templates),
    today: () => today,
    now: () => Date.parse(SAVED_AT) / 1000,
    newId: () => NEW_VALUE,
    store: {
      syllabus: async (id, userId) => {
        log.push(`facts:${userId}`)
        return facts !== null && facts.id === id.toLowerCase() ? facts : null
      },
      field: async (id) => fields.get(id.toLowerCase()) ?? null,
      storedValue: async (syllabusId, field) => {
        log.push("stored")
        return values.get(`${syllabusId}:${field}`) ?? null
      },
      identification: async () => ({ context: { subject: { name: "Redes" }, career: { name: "Software" } }, parallelCode: "A", parallelShift: "matutina", teachers }),
      transaction: async (work) => {
        log.push("begin")
        const before = new Map(values)
        const writes = [saved.length, drafts.length]
        try {
          const result = await work({
            lockSyllabus: async (id) => {
              log.push(`lock:${id}`)
              return locked
            },
            templateStore: fakeTemplateStore(templates),
            values: async (syllabusId) => new Map([...values].filter(([key]) => key.startsWith(`${syllabusId}:`)).map(([key, value]) => [key.slice(syllabusId.length + 1), value])),
            valueExists: async (syllabusId, field) => {
              log.push("exists")
              return values.has(`${syllabusId}:${field}`)
            },
            saveValue: async (syllabusId, field, document, newId) => {
              log.push("save")
              saved.push({ syllabusId, fieldId: field, document, newId })
              values.set(`${syllabusId}:${field}`, document)
            },
            saveDraft: async (id, version, savedAt) => {
              log.push("draft")
              drafts.push({ id, version, savedAt })
            },
          })
          committed = true
          log.push("commit")
          return result
        } catch (error) {
          values.clear()
          for (const [key, value] of before) values.set(key, value)
          saved.length = writes[0]
          drafts.length = writes[1]
          log.push("rollback")
          throw error
        }
      },
    },
  }
}

async function patch(body: unknown, { field = TEXT_FIELD, syllabus = SYLLABUS, headers = {} }: { field?: string; syllabus?: string; headers?: Record<string, string> } = {}) {
  const base = apiRequest(`/api/v1/teacher/syllabi/${syllabus}/fields/${field}`, {
    method: "PATCH",
    cookie,
    headers: { "content-type": "application/json", "x-csrf-token": golden.csrfToken, ...headers },
  })
  const response = await updateDraftField(new Request(base, { body: typeof body === "string" ? body : JSON.stringify(body) }), syllabus, field, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "docente", careerId: CAREER })],
  }
  templates = { template: goldenTemplate(), values: [] }
  facts = {
    id: SYLLABUS,
    state: "borrador",
    careerId: CAREER,
    convocationState: "abierta",
    processState: "abierto",
    dueOn: "2027-01-20",
    currentTeacher: true,
    writtenByUser: false,
    hasLibrarySubmission: false,
    subjectId: SUBJECT,
  }
  locked = { id: SYLLABUS, state: "borrador", version: 3, subjectId: SUBJECT }
  fields = new Map([TEXT_FIELD, UNITS_FIELD, INSTITUTIONAL_FIELD].map((id, index) => [id, liveField([8, 6, 15][index])]))
  values = new Map()
  log = []
  saved = []
  drafts = []
  committed = false
  today = "2027-01-15"
  teachers = [{ name: "Ana Pérez", email: "ana@ueb.edu.ec", formation: "Magíster" }]
})

describe("PATCH /api/v1/teacher/syllabi/{syllabus}/fields/{field}", () => {
  it("autosaves the field, bumps the draft version and answers with the resolved document", async () => {
    const template = goldenTemplate()
    if (template.definition) delete template.definition.response_policy
    templates.template = template
    const value = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Docente: " }, { type: "variable", attrs: { id: "nombre_docente" } }] }] }
    const { status, text, json } = await patch({ version_bloqueo: 3, value })
    expect(status).toBe(200)
    expect(log).toEqual([`facts:${golden.userId}`, "begin", `lock:${SYLLABUS}`, "save", "draft", "commit", "stored"])
    const normalized = {
      type: "doc",
      content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Docente: " }, { type: "variable", attrs: { id: "nombre_docente", label: "nombre_docente" } }] }],
    }
    expect(saved).toEqual([{ syllabusId: SYLLABUS, fieldId: TEXT_FIELD, document: normalized, newId: NEW_VALUE }])
    expect(drafts).toEqual([{ id: SYLLABUS, version: 4, savedAt: Date.parse(SAVED_AT) / 1000 }])
    expect(Object.keys(json ?? {})).toEqual(["message", "version_bloqueo", "guardado_en", "document"])
    expect(json?.message).toBe("Borrador guardado.")
    expect(json?.version_bloqueo).toBe(4)
    expect(json?.guardado_en).toBe(SAVED_AT)
    expect(json?.document).toEqual({
      type: "doc",
      content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Docente: " }, { type: "text", text: "Ana Pérez", marks: [] }] }],
    })
    expect(text).toBe(JSON.stringify(JSON.parse(text)))
  })

  it("answers a stale version with the recoverable conflict and writes nothing", async () => {
    const { status, text } = await patch({ version_bloqueo: 1, value: doc("Escritura obsoleta.") })
    expect(status).toBe(409)
    expect(text).toBe(
      JSON.stringify({ message: "El borrador cambió en otra sesión. Recarga antes de continuar.", code: "conflicto_version_borrador", version_bloqueo_actual: 3 }),
    )
    expect(saved).toEqual([])
    expect(drafts).toEqual([])
    expect(log).toContain("rollback")
  })

  it("keeps only the message of the conflict when the client does not expect JSON", async () => {
    const { status, text } = await patch({ version_bloqueo: 1, value: doc("x") }, { headers: { accept: "text/html" } })
    expect(status).toBe(409)
    expect(text).toBe(JSON.stringify({ message: "El borrador cambió en otra sesión. Recarga antes de continuar." }))
  })

  it("saves the empty document when the value is null", async () => {
    const { status } = await patch({ version_bloqueo: 3, value: null })
    expect(status).toBe(200)
    expect(saved[0].document).toEqual({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] })
  })

  it("only lets the teacher answer when the template protects its responses", async () => {
    const { status, json } = await patch({ version_bloqueo: 3, value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "variable", attrs: { id: "nombre_docente" } }] }] } })
    expect(status).toBe(422)
    expect(json?.errors).toEqual({ value: ["Complete solo los espacios de respuesta. El texto, los encabezados y la estructura los define Administración."] })
    expect(log).toContain("rollback")
    expect(saved).toEqual([])
  })

  it("rejects a variable that does not exist before locking anything", async () => {
    const { status, json } = await patch({ version_bloqueo: 3, value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "variable", attrs: { id: "variable_inexistente" } }] }] } })
    expect(status).toBe(422)
    expect(Object.keys(json?.errors as object)).toEqual(["value"])
    expect(log).not.toContain("begin")
  })

  it("rejects HTML sent as the value without writing", async () => {
    const { status, json } = await patch({ version_bloqueo: 3, value: "<script>contenido no permitido</script>" })
    expect(status).toBe(422)
    expect(Object.keys(json?.errors as object)).toEqual(["value"])
    expect(saved).toEqual([])
  })

  it("validates the lock version and the presence of the value", async () => {
    const { status, json } = await patch({ version_bloqueo: "x" })
    expect(status).toBe(422)
    expect(json).toEqual({
      message: "El campo versión de edición debe ser un número entero. (y 1 error más)",
      errors: { version_bloqueo: ["El campo versión de edición debe ser un número entero."], value: ["El campo valor debe estar presente."] },
    })
  })

  it("denies a field that belongs to the institution", async () => {
    const { status, json } = await patch({ version_bloqueo: 3, value: doc("Intento de sobrescritura") }, { field: INSTITUTIONAL_FIELD })
    expect(status).toBe(422)
    expect(json).toEqual({
      message: "Este campo pertenece a Coordinación o a la institución y el docente no puede cambiarlo.",
      errors: { field: ["Este campo pertenece a Coordinación o a la institución y el docente no puede cambiarlo."] },
    })
    expect(saved).toEqual([])
  })

  it("denies a field of another template or a retired one the syllabus never answered", async () => {
    fields.set(TEXT_FIELD, { ...liveField(8), templateId: "01a1c5ba-10b4-7129-925f-000000000000" })
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).json?.errors).toEqual({ field: ["El campo no pertenece a la plantilla vigente."] })
    fields.set(TEXT_FIELD, { ...liveField(8), live: false })
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).json?.errors).toEqual({ field: ["El campo no pertenece a la plantilla vigente."] })
    values.set(`${SYLLABUS}:${TEXT_FIELD}`, doc("antes"))
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).status).toBe(200)
  })

  it("keeps the blocks defined by the template", async () => {
    const template = goldenTemplate()
    if (template.definition) delete template.definition.response_policy
    templates.template = template
    const { status, json } = await patch({ version_bloqueo: 3, value: doc("Sin bloque") }, { field: UNITS_FIELD })
    expect(status).toBe(422)
    expect(json?.errors).toEqual({ value: ["Los bloques de este campo los define la plantilla; el docente solo los responde."] })
  })

  it("rejects a syllabus that stopped being editable while waiting for the lock", async () => {
    locked = { id: SYLLABUS, state: "en_revision", version: 3, subjectId: SUBJECT }
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).json?.errors).toEqual({ syllabus: ["El expediente no está en estado editable."] })
  })

  it("forbids a coordinator, a paused convocation, an expired deadline and a sent syllabus", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await patch({ version_bloqueo: 3, value: "PV-16 no autorizado" })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    facts = { ...(facts as DraftSyllabus), convocationState: "pausada" }
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).status).toBe(403)
    facts = { ...(facts as DraftSyllabus), convocationState: "abierta", processState: "pausado" }
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).status).toBe(403)
    facts = { ...(facts as DraftSyllabus), processState: "abierto" }
    today = "2027-01-21"
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).status).toBe(403)
    today = "2027-01-20"
    facts = { ...(facts as DraftSyllabus), state: "en_revision" }
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).text).toBe(FORBIDDEN)
    facts = { ...(facts as DraftSyllabus), state: "correccion_solicitada", currentTeacher: false }
    expect((await patch({ version_bloqueo: 3, value: doc("x") })).status).toBe(403)
    expect(saved).toEqual([])
  })

  it("answers Laravel's 404 for unknown records and reads form bodies natively", async () => {
    expect(await patch({ version_bloqueo: 3, value: doc("x") }, { syllabus: "50000000-0000-4000-8000-00000000ffff" })).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "50000000-0000-4000-8000-00000000ffff") })
    expect((await patch({ version_bloqueo: 3, value: doc("x") }, { field: "01a1c5ba-0000-7000-8000-00000000ffff" })).status).toBe(404)
    expect(await patch({ version_bloqueo: 3, value: doc("x") }, { syllabus: "no-es-uuid" })).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "no-es-uuid") })
    expect((await patch("version_bloqueo=3", { headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(422)
    expect(saved).toEqual([])
    expect(committed).toBe(false)
  })
})

describe("PATCH a field with a character limit", () => {
  const limitTo = (limit: number) => {
    const template = goldenTemplate()
    template.definition!.field_limits = { tecnicas_ensenanza: limit }
    templates.template = template
  }

  it("saves an answer within the limit like any other field", async () => {
    limitTo(50)
    const result = await patch({ version_bloqueo: 3, value: doc("Aprendizaje basado en problemas") })
    expect(result.status).toBe(200)
    expect(saved).toHaveLength(1)
    expect(committed).toBe(true)
  })

  it("rejects an answer that grows past the limit and keeps the stored value", async () => {
    limitTo(5)
    values.set(`${SYLLABUS}:${TEXT_FIELD}`, doc("abc"))
    const result = await patch({ version_bloqueo: 3, value: doc("Aprendizaje") })
    expect(result).toMatchObject({ status: 422, json: { message: "Este campo admite hasta 5 caracteres.", errors: { value: ["Este campo admite hasta 5 caracteres."] } } })
    expect(values.get(`${SYLLABUS}:${TEXT_FIELD}`)).toEqual(doc("abc"))
    expect(drafts).toEqual([])
    expect(committed).toBe(false)
  })

  it("lets the teacher shorten an answer that was already over the limit", async () => {
    limitTo(5)
    values.set(`${SYLLABUS}:${TEXT_FIELD}`, doc("Aprendizaje basado"))
    expect((await patch({ version_bloqueo: 3, value: doc("Aprendizaje") })).status).toBe(200)
    expect(committed).toBe(true)
  })

  it("formats large limits with a space between thousands", async () => {
    limitTo(1000)
    const result = await patch({ version_bloqueo: 3, value: doc("x".repeat(1001)) })
    expect(result.json).toMatchObject({ errors: { value: ["Este campo admite hasta 1 000 caracteres."] } })
  })
})
