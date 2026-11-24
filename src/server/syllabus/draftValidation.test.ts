// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import type { PhpRecord } from "../configuration/phpValues"
import type { DraftSyllabus } from "./draftField"
import { validateDraft, type DraftValidationDeps, type ValidationField, type ValidationTeacher } from "./draftValidation"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const SUBJECT = "a0000000-0000-4000-8000-000000000001"
const OTHER_TEACHER = "90000000-0000-4000-8000-000000000002"

let world: FakeWorld
let forwarded: Request[]
let templates: FakeTemplateWorld
let facts: DraftSyllabus | null
let locked: { id: string; state: string; version: number; subjectId: string } | null
let values: Map<string, unknown>
let teachers: ValidationTeacher[]
let archived: boolean
let committed: boolean

const template = goldenTemplate()
const all = template.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields.map((field) => ({ field, section }))))
const pick = (key: string): ValidationField => {
  const { field, section } = all.find((item) => item.field.key === key)!
  return { id: field.id, key: field.key, responsible: field.responsible, content: field.content, displayName: field.label.trim() || section.title.trim() }
}
const METHODS = pick("metodologia")
const TECHNIQUES = pick("tecnicas_ensenanza")
const ETHICS = pick("conducta_etica")
const doc = (text: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

function deps(): DraftValidationDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    today: () => "2027-01-15",
    store: {
      syllabus: async (id) => (facts !== null && facts.id === id.toLowerCase() ? facts : null),
      transaction: async (work) => {
        const result = await work({
          lockSyllabus: async () => locked,
          templateStore: fakeTemplateStore(templates),
          hasArchivedValues: async () => archived,
          liveFields: async () => [METHODS, TECHNIQUES, ETHICS],
          values: async () => values,
          identification: async () => ({ context: { subject: { name: "Redes" } }, parallelCode: "A", parallelShift: null, teachers: [] }),
          teachers: async () => teachers,
        })
        committed = true
        return result
      },
    },
  }
}

async function validate(id = SYLLABUS) {
  const base = apiRequest(`/api/v1/teacher/syllabi/${id}/validate`, { method: "POST", cookie, headers: { "content-type": "application/json", "x-csrf-token": golden.csrfToken } })
  const response = await validateDraft(new Request(base, { body: "{}" }), id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, ReturnType<typeof JSON.parse>>) : null }
}

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "docente", careerId: CAREER })],
  }
  forwarded = []
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
  locked = { id: SYLLABUS, state: "borrador", version: 7, subjectId: SUBJECT }
  values = new Map()
  teachers = [{ id: golden.userId, name: "Ana Pérez", formation: "Magíster en Redes" }]
  archived = false
  committed = false
})

describe("POST teacher/syllabi/{syllabus}/validate", () => {
  it("reports every empty answer the teacher still has to write", async () => {
    const { status, json } = await validate()
    expect(status).toBe(200)
    expect(json).toEqual({
      message: "Validación completada. Revise los campos señalados.",
      validation: {
        version_bloqueo: 7,
        blocking_errors: 2,
        warnings: 0,
        results: [
          { field_id: METHODS.id, code: "campo_obligatorio_faltante", severity: "error", message: `«${METHODS.displayName}» está vacío. Complétalo antes de enviar.` },
          { field_id: TECHNIQUES.id, code: "campo_obligatorio_faltante", severity: "error", message: `«${TECHNIQUES.displayName}» está vacío. Complétalo antes de enviar.` },
        ],
      },
    })
    expect(committed).toBe(true)
  })

  it("passes a complete draft without blocking errors", async () => {
    values = new Map([
      [METHODS.id, doc("Aprendizaje basado en problemas")],
      [TECHNIQUES.id, doc("Debate")],
    ])
    expect((await validate()).json).toEqual({
      message: "Validación completada sin errores bloqueantes.",
      validation: { version_bloqueo: 7, blocking_errors: 0, warnings: 0, results: [] },
    })
  })

  it("flags answers over the character limit and teachers without their academic formation", async () => {
    templates.template!.definition!.field_limits = { metodologia: 10 }
    values = new Map([
      [METHODS.id, doc("Aprendizaje basado en problemas")],
      [TECHNIQUES.id, doc("Debate")],
    ])
    teachers = [
      { id: golden.userId, name: "Ana Pérez", formation: " " },
      { id: OTHER_TEACHER, name: "Luis Mora", formation: null },
    ]
    const { json } = await validate()
    expect(json!.validation.results).toEqual([
      {
        field_id: METHODS.id,
        code: "campo_supera_limite",
        severity: "error",
        message: `«${METHODS.displayName}» tiene 31 caracteres y admite hasta 10. Recorte el texto antes de enviar.`,
      },
      { field_id: null, code: "formacion_docente_faltante", severity: "error", message: "Falta su formación y experiencia académica-investigativa. Complétela antes de enviar." },
      { field_id: null, code: "formacion_docente_faltante", severity: "error", message: "Falta la formación y experiencia académica-investigativa de Luis Mora." },
    ])
  })

  it("forbids reviewers and syllabi outside the editable window", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect(await validate()).toMatchObject({ status: 403, text: '{\n    "message": ""\n}' })
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    facts = { ...facts!, convocationState: "pausada" }
    expect((await validate()).status).toBe(403)
  })

  it("leaves unknown syllabi and drafts with archived answers to Laravel", async () => {
    expect(await validate("no-es-uuid")).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "no-es-uuid") })
    facts = null
    expect(await validate()).toMatchObject({ status: 404, text: modelNotFound("Syllabus", SYLLABUS) })
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
    archived = true
    expect((await validate()).status).toBe(299)
  })
})
