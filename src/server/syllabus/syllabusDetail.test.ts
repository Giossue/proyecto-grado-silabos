// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import { phpShape, type PhpRecord } from "../configuration/phpValues"
import { presentDefinition, resolveVariables, syllabusSectionPayload } from "../configuration/templatePresentation"
import { identificationOf } from "./identificationCard"
import { teacherSyllabusDetail, type CopySource, type DetailRevision, type DetailSyllabus, type ReviewComment, type SyllabusDetailStore } from "./syllabusDetail"
import type { SignatureRecord } from "./snapshotDocuments"
import type { ArchivedField } from "./syllabusDetailQueries"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{\n    "message": ""\n}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const SOURCE = "50000000-0000-4000-8000-000000000002"
const REVISION = "70000000-0000-4000-8000-000000000001"
const FACULTY = "f0000000-0000-4000-8000-000000000001"

let root: string
let world: FakeWorld
let templateWorld: FakeTemplateWorld
let syllabus: DetailSyllabus | null
let revisions: DetailRevision[]
let snapshots: Map<string, unknown>
let comments: ReviewComment[]
let signatures: SignatureRecord[]
let sources: CopySource[]
let values: Map<string, unknown>
let archived: ArchivedField[] | null
let today: string

const identificationSource = () => ({
  context: { career: { name: "Software", faculty: "Ciencias", faculty_id: FACULTY }, subject: { name: "Biología", code: "C2" } },
  parallelCode: "A",
  parallelShift: "Matutina",
  teachers: [{ name: "Ana Pérez", email: "ana@ueb.edu.ec", formation: null }],
})

const store = (): SyllabusDetailStore => ({
  syllabus: async (id) => (syllabus !== null && syllabus.id === id.toLowerCase() ? syllabus : null),
  teachers: async () => ["Ana Pérez", "Ana Pérez"],
  values: async () => values,
  hasArchivedValues: async () => archived !== null,
  archivedFields: async () => archived,
  revisions: async () => revisions,
  revisionSnapshot: async (id) => snapshots.get(id) ?? null,
  signedFacts: async () => ({ coordination: null, verification: null }),
  reviewComments: async (_id, stage) => comments.filter((comment) => stage === null || comment.stage === stage),
  signatures: async () => signatures,
  copySources: async () => sources,
  identification: async () => identificationSource(),
  fieldContents: async () => new Map(),
})

const deps = () => ({
  bridge: fakeDeps(world),
  store: store(),
  templates: fakeTemplateStore(templateWorld),
  logos: { faculty: async () => null },
  today: () => today,
})

const draft = (overrides: Partial<DetailSyllabus> = {}): DetailSyllabus => ({
  id: SYLLABUS,
  state: "borrador",
  careerId: CAREER,
  convocationState: "abierta",
  processState: "abierto",
  dueOn: "2026-12-01",
  currentTeacher: true,
  writtenByUser: true,
  hasLibrarySubmission: false,
  subjectId: "a0000000-0000-4000-8000-000000000001",
  convocationId: "b0000000-0000-4000-8000-000000000001",
  subject: "Biología",
  code: "C2",
  parallel: "A",
  career: "Software",
  period: "2026-2",
  startedAt: "2026-11-20T14:00:00+00:00",
  savedAt: "2026-11-21T15:00:00+00:00",
  version: 3,
  context: identificationSource().context,
  ...overrides,
})

const revision = (overrides: Partial<DetailRevision> = {}): DetailRevision => ({
  id: REVISION,
  number: 1,
  submittedAt: 1795000000,
  submittedBy: "Ana Pérez",
  approval: null,
  verified: false,
  versionOrigin: 3,
  correctionRequested: false,
  fingerprint: "f".repeat(64),
  ...overrides,
})

async function show(id = SYLLABUS) {
  const response = await teacherSyllabusDetail(apiRequest(`/api/v1/teacher/syllabi/${id}`, { cookie }), id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as { syllabus: Record<string, unknown> }) : null }
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-detail-"))
  process.env.STORAGE_PATH = path.join(root, "storage", "app")
  process.env.PUBLIC_ASSETS_PATH = path.join(root, "public")
})

afterAll(async () => {
  delete process.env.STORAGE_PATH
  delete process.env.PUBLIC_ASSETS_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ careerId: CAREER })],
  }
  templateWorld = { template: goldenTemplate(), values: [] }
  syllabus = draft()
  revisions = []
  snapshots = new Map()
  comments = []
  signatures = []
  sources = [{ id: SOURCE, parallel: "B", state: "borrador" }]
  values = new Map()
  archived = null
  today = "2026-11-23"
})

describe("GET teacher/syllabi/{syllabus}", () => {
  it("shows an editable draft built from the institutional template, the stored answers and the logo addresses", async () => {
    const template = goldenTemplate()
    const definition = template.definition!
    const answered = template.sections[0].blocks[0].fields[0]
    values = new Map([[answered.id, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Respuesta" }] }] }]])
    const { status, json } = await show()
    expect(status).toBe(200)
    const identification = identificationOf(identificationSource())
    const payload = json!.syllabus
    expect(Object.keys(payload)).toEqual([
      "id", "subject", "code", "convocation", "period", "state", "iniciado_en", "version_bloqueo", "guardado_en", "editable", "edit_block_reason",
      "edit_blocked_by_convocation", "parallels", "copy_sources", "teachers", "approved_revision_id", "presentation", "template_variables", "definition",
      "sections", "revisions", "review_stage", "review_comments", "signatures", "teacher_signature_required", "teacher_formation_required", "unchanged_since_correction",
    ])
    expect(payload).toMatchObject({
      id: SYLLABUS,
      subject: "Biología",
      code: "C2",
      convocation: "Software · 2026-2",
      period: "2026-2",
      state: "borrador",
      iniciado_en: "2026-11-20T14:00:00+00:00",
      version_bloqueo: 3,
      guardado_en: "2026-11-21T15:00:00+00:00",
      editable: true,
      edit_block_reason: null,
      edit_blocked_by_convocation: false,
      parallels: ["A"],
      copy_sources: [{ id: SOURCE, parallel: "B", state: "borrador" }],
      teachers: ["Ana Pérez"],
      approved_revision_id: null,
      revisions: [],
      review_stage: null,
      review_comments: [],
      signatures: [],
      teacher_signature_required: true,
      teacher_formation_required: true,
      unchanged_since_correction: false,
    })
    const presentation = payload.presentation as PhpRecord
    expect(Object.keys(presentation)).toEqual(["document", "appearance", "title", "logos"])
    expect(presentation.document).toEqual(phpShape(definition.document))
    expect(presentation.title).toBe("PROGRAMA DE ASIGNATURA (SÍLABO)")
    expect(presentation.logos).toEqual({ institution: "http://localhost:3000/logos/institucion?v=0", faculty: "http://localhost:3000/images/silabo/facultad.jpeg?v=0" })
    expect((payload.presentation as PhpRecord).appearance).toMatchObject({ font_family: "Arial", margin_cm: 1.5, accent_color: "#2F5496", title_alignment: "center" })
    expect(payload.template_variables).toEqual(phpShape(resolveVariables(definition, { identification })))
    expect(payload.definition).toEqual(phpShape(presentDefinition(definition)))
    const expected = template.sections.map((section) =>
      syllabusSectionPayload(section, (field) => values.get(field.id) ?? field.content, { identification }, definition, {}),
    )
    expect(payload.sections).toEqual(JSON.parse(JSON.stringify(phpShape(expected))))
  })

  it("forbids a teacher of another career", async () => {
    world.assignments = [makeAssignment({ careerId: "c0000000-0000-4000-8000-000000000009" })]
    expect(await show()).toMatchObject({ status: 403, text: FORBIDDEN })
  })

  it("forbids a teacher who neither teaches nor wrote the syllabus", async () => {
    syllabus = draft({ currentTeacher: false, writtenByUser: false })
    expect(await show()).toMatchObject({ status: 403, text: FORBIDDEN })
  })

  it("lets the career coordinator read it without editing or copy sources", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    const { status, json } = await show()
    expect(status).toBe(200)
    expect(json!.syllabus).toMatchObject({ editable: false, edit_block_reason: "No tiene una asignación vigente para editar este sílabo.", edit_blocked_by_convocation: false, copy_sources: [] })
  })

  it.each([
    [{ convocationState: "pausada" }, "La convocatoria está en pausa. Podrá seguir editando cuando se reanude.", true],
    [{ processState: "pausado" }, "La convocatoria está en pausa. Podrá seguir editando cuando se reanude.", true],
    [{ convocationState: "cerrada" }, "La convocatoria está cerrada: el sílabo queda solo para consulta.", true],
    [{ dueOn: "2026-11-22" }, "El plazo de entrega venció. Pida una prórroga a Administración.", true],
  ])("explains why the convocation blocks editing (%o)", async (overrides, reason, byConvocation) => {
    syllabus = draft(overrides)
    const { status, json } = await show()
    expect(status).toBe(200)
    expect(json!.syllabus).toMatchObject({ editable: false, edit_block_reason: reason, edit_blocked_by_convocation: byConvocation, copy_sources: [] })
  })

  it("keeps an unstarted syllabus editable through the start ability", async () => {
    syllabus = draft({ state: "sin_iniciar", startedAt: null, savedAt: null, version: 0 })
    const { json } = await show()
    expect(json!.syllabus).toMatchObject({ state: "sin_iniciar", editable: true, iniciado_en: null, guardado_en: null, copy_sources: [{ id: SOURCE, parallel: "B", state: "borrador" }] })
  })

  it("reports a correction that the teacher has not touched yet with the coordination comments", async () => {
    syllabus = draft({ state: "correccion_solicitada", version: 5 })
    revisions = [revision({ correctionRequested: true, versionOrigin: 3 })]
    comments = [{ stage: "coordinacion", comment: "Ajuste la bibliografía.", commented_at: "2026-11-22T10:00:00+00:00", commented_by: "Coordinadora", revision_number: 1 }]
    const { json } = await show()
    expect(json!.syllabus).toMatchObject({
      state: "correccion_solicitada",
      revisions: [{ id: REVISION, number: 1, submitted_at: "2026-11-18T11:06:40+00:00", submitted_by: "Ana Pérez", approved_at: null }],
      review_stage: null,
      review_comments: comments,
      unchanged_since_correction: true,
      copy_sources: [],
    })
    syllabus = draft({ state: "correccion_solicitada", version: 6 })
    expect((await show()).json!.syllabus.unchanged_since_correction).toBe(false)
  })

  it("shows the sent revision frozen with its signature variables while it is under review", async () => {
    syllabus = draft({ state: "en_revision", version: 4 })
    revisions = [revision({ verified: true })]
    const template = goldenTemplate()
    const field = template.sections[0].blocks[0].fields[0]
    snapshots.set(REVISION, {
      identification: identificationOf(identificationSource()),
      template_definition: template.definition,
      sections: [{ key: "datos", title: "Datos", fields: [{ definition_id: field.id, key: field.key, label: field.label, quien_llena: "carrera", document: { type: "doc", content: [{ type: "paragraph" }] } }] }],
    })
    signatures = [{ role: "docente", name: "Ana Pérez", signedAt: 1795000000, certificateName: "ANA PEREZ", serial: "123", issuer: "CN=Entidad, O=UEB" }]
    const { status, json } = await show()
    expect(status).toBe(200)
    const payload = json!.syllabus
    expect(payload).toMatchObject({
      state: "en_revision",
      editable: false,
      edit_block_reason: "El sílabo no admite cambios en su estado actual.",
      review_stage: "coordinacion",
      signatures: [{ role: "docente", name: "Ana Pérez", signed_at: "2026-11-18T11:06:40+00:00" }],
      teacher_signature_required: false,
      sections: [
        {
          key: "datos",
          title: "Datos",
          orientation: "portrait",
          fields: [{ id: field.id, definition_id: field.id, key: field.key, label: field.label, quien_llena: "carrera", teacher_editable: false, required: false }],
        },
      ],
    })
    const variables = payload.template_variables as Record<string, string>
    expect(variables.fecha_entrega).toBe("18-11-2026")
    expect(variables.firma_docente).toBe("\n\nFirmado electrónicamente por ANA PEREZ · Docente · 18-11-2026 06:06 · certificado N.º 123 · Entidad\nFirma del docente")
    expect(variables.nombre_coordinador).toBeUndefined()
  })

  it("shows a legacy snapshot with the official template and archived answers as their frozen sections", async () => {
    syllabus = draft({ state: "en_revision" })
    revisions = [revision()]
    snapshots.set(REVISION, { sections: [] })
    const legacy = await show()
    expect(legacy.status).toBe(200)
    expect(legacy.json?.syllabus.sections).toEqual([])
    syllabus = draft()
    revisions = []
    const answer = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Respuesta archivada" }] }] }
    archived = [{ sectionId: "s-9", sectionKey: "anterior", sectionTitle: "Sección retirada", sectionOrientation: "portrait", id: "f-9", key: "metodos", label: "Métodos", responsible: "docente", content: answer }]
    const frozen = await show()
    expect(frozen.status).toBe(200)
    const sections = frozen.json?.syllabus.sections as { key: string; fields: { id: string; teacher_editable: boolean; required: boolean; value: unknown }[] }[]
    expect(sections.map((section) => section.key)).toEqual(["anterior"])
    expect(sections[0].fields[0]).toMatchObject({ id: "f-9", teacher_editable: true, required: true })
    expect(JSON.stringify(sections[0].fields[0].value)).toContain("Respuesta archivada")
  })

  it("answers Laravel's model 404 for unknown syllabi", async () => {
    syllabus = null
    expect(await show()).toMatchObject({ status: 404, text: modelNotFound("Syllabus", SYLLABUS) })
    expect(await show("no-es-uuid")).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "no-es-uuid") })
  })
})
