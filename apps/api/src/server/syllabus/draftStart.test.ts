// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import { fieldResponseNormalize } from "../configuration/templateRehearsal"
import { definitionHash } from "../ficha/definitionHash"
import type { TemplateDefinition } from "../configuration/templateRuntime"
import { copySyllabusContent, startDraft, type DraftStartDeps, type DraftStartTx } from "./draftStart"
import type { CopySource, DetailSyllabus, SyllabusDetailStore } from "./syllabusDetail"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const EMPTY_FORBIDDEN = '{"message":""}'
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const TARGET = "50000000-0000-4000-8000-000000000001"
const SOURCE = "50000000-0000-4000-8000-000000000002"
const PREVIOUS = "50000000-0000-4000-8000-000000000009"
const SUBJECT = "a0000000-0000-4000-8000-000000000001"
const CONVOCATION = "b0000000-0000-4000-8000-000000000001"
const NOW_ISO = new Date(NOW * 1000).toISOString().replace(/\.000Z$/, "+00:00")
const COPY_REJECTED = "Solo puede copiar desde otro paralelo suyo de la misma asignatura, y solo hacia un sílabo que aún no ha enviado."

type Row = DetailSyllabus & { values: Map<string, unknown> }
type ResponseBody = { message?: string; syllabus?: Record<string, unknown>; errors?: Record<string, string[]> }

let root: string
let world: FakeWorld
let templates: FakeTemplateWorld
let rows: Map<string, Row>
let log: string[]
let previousSource: string | null
let modifiedAtSeen: (string | null)[]
let fingerprints: Map<string, string>

const row = (overrides: Partial<Row> = {}): Row => ({
  id: TARGET,
  state: "sin_iniciar",
  careerId: CAREER,
  convocationState: "abierta",
  processState: "abierto",
  dueOn: "2026-12-11",
  currentTeacher: true,
  writtenByUser: true,
  hasLibrarySubmission: false,
  subjectId: SUBJECT,
  convocationId: CONVOCATION,
  subject: "Biología",
  code: "C2",
  parallel: "A",
  career: "Software",
  period: "2026-2",
  startedAt: null,
  savedAt: null,
  version: 0,
  context: { career: { name: "Software", faculty: "Ciencias" }, subject: { name: "Biología", code: "C2" } },
  values: new Map(),
  ...overrides,
})

const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(/\.000Z$/, "+00:00")

const detailStore = (): SyllabusDetailStore => ({
  syllabus: async (id) => {
    const found = rows.get(id.toLowerCase())
    if (!found) return null
    const detail: Partial<Row> = { ...found }
    delete detail.values
    return detail as DetailSyllabus
  },
  teachers: async () => ["Ana Pérez"],
  values: async (id) => new Map(rows.get(id)?.values ?? []),
  hasArchivedValues: async () => false,
  archivedFields: async () => null,
  revisions: async () => [],
  revisionSnapshot: async () => null,
  signedFacts: async () => ({ coordination: null, verification: null }),
  reviewComments: async () => [],
  signatures: async () => [],
  copySources: async (syllabus) =>
    [...rows.values()]
      .filter((candidate) => candidate.id !== syllabus.id && candidate.subjectId === syllabus.subjectId && candidate.convocationId === syllabus.convocationId)
      .filter((candidate) => candidate.state !== "sin_iniciar" && candidate.currentTeacher)
      .map((candidate): CopySource => ({ id: candidate.id, parallel: candidate.parallel, state: candidate.state })),
  identification: async () => ({ context: rows.get(TARGET)?.context ?? {}, parallelCode: "A", parallelShift: "matutina", teachers: [{ name: "Ana Pérez", email: "ana@ueb.edu.ec" }], formation: null }),
  fieldContents: async () => new Map(),
})

function tx(): DraftStartTx {
  const store = fakeTemplateStore(templates)
  return {
    detail: detailStore(),
    templateStore: store,
    async lockSyllabus(id) {
      log.push(`lock:${id}`)
      const found = rows.get(id)
      return found ? { id: found.id, state: found.state, version: found.version, subjectId: found.subjectId } : null
    },
    async previousPeriodSource(_id, _subject, _user, modifiedAt) {
      modifiedAtSeen.push(modifiedAt)
      return previousSource
    },
    async teacherFields() {
      return goldenTemplate().sections.flatMap((section) =>
        section.blocks.flatMap((block) => block.fields.filter((field) => field.responsible !== "institucional").map((field) => ({ id: field.id, responsible: field.responsible, content: field.content }))),
      )
    },
    async values(syllabusId, fieldIds) {
      return [...(rows.get(syllabusId)?.values ?? [])].filter(([id]) => fieldIds.includes(id)).map(([id, value]) => ({ fieldId: id, value }))
    },
    async deleteValues(syllabusId, fieldIds) {
      log.push("delete")
      for (const id of fieldIds) rows.get(syllabusId)?.values.delete(id)
    },
    async insertValue(syllabusId, id, document, fingerprint) {
      log.push(`insert:${id}`)
      fingerprints.set(id, fingerprint)
      rows.get(syllabusId)?.values.set(id, document)
    },
    async carryTeacherFields(syllabusId, template) {
      log.push(`carry:${syllabusId}:${template.id}`)
    },
    async start(syllabusId, now) {
      log.push("start")
      Object.assign(rows.get(syllabusId)!, { state: "borrador", startedAt: iso(now), savedAt: iso(now), version: 1 })
    },
    async copied(syllabusId, version, now) {
      log.push("copied")
      const found = rows.get(syllabusId)!
      Object.assign(found, { state: "borrador", startedAt: found.startedAt ?? iso(now), savedAt: iso(now), version })
    },
  }
}

function clone(source: Map<string, Row>): Map<string, Row> {
  return new Map([...source].map(([id, item]) => [id, { ...item, values: new Map(item.values) }]))
}

const deps = (): DraftStartDeps => ({
  bridge: fakeDeps(world),
  store: detailStore(),
  logos: { faculty: async () => null },
  today: () => "2026-11-23",
  now: () => NOW,
  async transaction(work) {
    const saved = clone(rows)
    log.push("begin")
    try {
      const result = await work(tx())
      log.push("commit")
      return result
    } catch (error) {
      rows = saved
      log.push("rollback")
      throw error
    }
  },
})

async function call(response: Promise<Response>) {
  const result = await response
  const text = await result.text()
  return { status: result.status, text, json: text.startsWith("{") ? (JSON.parse(text) as ResponseBody) : null }
}

const start = (id = TARGET) => call(startDraft(apiRequest(`/api/v1/teacher/syllabi/${id}/start`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken } }), id, deps()))

function copy(body: unknown, target = TARGET, source = SOURCE, headers: Record<string, string> = { "content-type": "application/json" }) {
  const base = apiRequest(`/api/v1/teacher/syllabi/${target}/copy-from/${source}`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, ...headers } })
  return call(copySyllabusContent(new Request(base, { body: typeof body === "string" ? body : JSON.stringify(body) }), target, source, deps()))
}

const definition = () => goldenTemplate().definition as TemplateDefinition
const fieldIndex = (key: string) => goldenFields.findIndex((field) => field.key === key)

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-start-"))
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
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ careerId: CAREER })],
  }
  templates = { template: goldenTemplate(), values: [] }
  rows = new Map([[TARGET, row()]])
  log = []
  previousSource = null
  modifiedAtSeen = []
  fingerprints = new Map()
})

describe("POST teacher/syllabi/{syllabus}/start", () => {
  it("starts the draft from the template, carries the teacher fields and returns the syllabus", async () => {
    templates.template = { ...goldenTemplate(), modifiedAt: "2026-11-23 16:10:54.932237+00" }
    const response = await start()

    expect(response.status).toBe(200)
    expect(Object.keys(response.json!)).toEqual(["message", "syllabus"])
    expect(response.json!.message).toBe("Borrador iniciado con la plantilla y los datos maestros fijados.")
    expect(response.json!.syllabus).toMatchObject({ id: TARGET, state: "borrador", iniciado_en: NOW_ISO, version_bloqueo: 1, guardado_en: NOW_ISO })
    expect(log).toEqual(["begin", `lock:${TARGET}`, `carry:${TARGET}:${goldenTemplate().id}`, "start", "commit"])
    expect(modifiedAtSeen).toEqual(["2026-11-23 16:10:54.932237+00"])
  })

  it("inherits the teacher answers of the previous period, like StartDraft::inherit", async () => {
    previousSource = PREVIOUS
    const techniques = fieldId(fieldIndex("tecnicas_ensenanza"))
    const answer = goldenFields[fieldIndex("tecnicas_ensenanza")].stored
    rows.set(PREVIOUS, row({ id: PREVIOUS, state: "aprobado", values: new Map<string, unknown>([[techniques, answer]]) }))
    const inherited = [techniques]
    const response = await start()
    expect(response.status).toBe(200)
    expect(log).toEqual(["begin", `lock:${TARGET}`, "delete", ...inherited.map((id) => `insert:${id}`), `carry:${TARGET}:${goldenTemplate().id}`, "start", "commit"])
    expect(fingerprints.get(techniques)).toBe(definitionHash(goldenFields[fieldIndex("tecnicas_ensenanza")].content))
    expect(rows.get(TARGET)!.state).toBe("borrador")
    expect([...rows.get(TARGET)!.values.keys()]).toEqual(inherited)
    expect(rows.get(TARGET)!.values.get(techniques)).toEqual(fieldResponseNormalize(goldenFields[fieldIndex("tecnicas_ensenanza")].content, answer, definition()))
  })

  it("refuses a draft that another session already started", async () => {
    const facts = row()
    rows.set(TARGET, { ...facts, state: "borrador" })
    const store = detailStore()
    const response = await call(
      startDraft(apiRequest(`/api/v1/teacher/syllabi/${TARGET}/start`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken } }), TARGET, {
        ...deps(),
        store: { ...store, syllabus: async () => facts },
      }),
    )
    expect(response).toMatchObject({ status: 422, json: { message: "El borrador ya fue iniciado o no está editable.", errors: { syllabus: ["El borrador ya fue iniciado o no está editable."] } } })
  })

  it("only lets the current teacher start an unstarted draft of a running convocation before its deadline", async () => {
    rows.set(TARGET, row({ state: "borrador" }))
    expect(await start()).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    rows.set(TARGET, row({ convocationState: "pausada" }))
    expect(await start()).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    rows.set(TARGET, row({ dueOn: "2026-11-22" }))
    expect(await start()).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    rows.set(TARGET, row({ currentTeacher: false }))
    expect(await start()).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    rows.set(TARGET, row())
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect(await start()).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    expect(log).toEqual([])
  })

  it("leaves unknown syllabi and malformed ids to Laravel", async () => {
    expect(await start("50000000-0000-4000-8000-0000000000ff")).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "50000000-0000-4000-8000-0000000000ff") })
    expect(await start("abc")).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "abc") })
  })
})

describe("POST teacher/syllabi/{syllabus}/copy-from/{source}", () => {
  const techniques = fieldId(fieldIndex("tecnicas_ensenanza"))
  const bibliography = fieldId(fieldIndex("bibliografia"))
  const evaluation = fieldId(fieldIndex("indicadores_evaluacion"))

  beforeEach(() => {
    rows.set(SOURCE, row({ id: SOURCE, parallel: "B", state: "borrador", version: 4, startedAt: "2026-11-20T14:00:00+00:00", values: new Map<string, unknown>([
      [techniques, goldenFields[fieldIndex("tecnicas_ensenanza")].stored],
      [evaluation, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Institucional" }] }] }],
    ]) }))
    rows.set(TARGET, row({ state: "borrador", version: 2, startedAt: "2026-11-21T10:00:00+00:00", values: new Map<string, unknown>([[bibliography, { type: "doc", content: [{ type: "paragraph" }] }]]) }))
  })

  it("copies the teacher fields of another own parallel and replaces the previous answers", async () => {
    const response = await copy({ version_bloqueo: 2 })

    expect(response.status).toBe(200)
    expect(response.json!.message).toBe("Contenido copiado desde el paralelo B.")
    expect(response.json!.syllabus).toMatchObject({ id: TARGET, state: "borrador", version_bloqueo: 3, iniciado_en: "2026-11-21T10:00:00+00:00", guardado_en: NOW_ISO })
    const copied = rows.get(TARGET)!.values
    expect([...copied.keys()]).toEqual([techniques])
    expect(copied.get(techniques)).toEqual(
      fieldResponseNormalize(goldenFields[fieldIndex("tecnicas_ensenanza")].content, goldenFields[fieldIndex("tecnicas_ensenanza")].stored, definition()),
    )
    expect(log).toEqual(["begin", `lock:${TARGET}`, "delete", `insert:${techniques}`, "copied", "commit"])
  })

  it("starts an unstarted target while copying", async () => {
    rows.set(TARGET, row({ version: 0 }))
    const response = await copy({ version_bloqueo: 0 })
    expect(response.json!.syllabus).toMatchObject({ state: "borrador", version_bloqueo: 1, iniciado_en: NOW_ISO })
  })

  it("answers a recoverable conflict for a stale version without writing", async () => {
    const response = await copy({ version_bloqueo: 1 })
    expect(response).toMatchObject({ status: 409, json: { message: "El borrador cambió en otra sesión. Recarga antes de continuar.", code: "conflicto_version_borrador", version_bloqueo_actual: 2 } })
    expect(rows.get(TARGET)!.version).toBe(2)
  })

  it("rejects copying from a parallel that was not started", async () => {
    rows.get(SOURCE)!.state = "sin_iniciar"
    expect(await copy({ version_bloqueo: 2 })).toMatchObject({ status: 422, json: { errors: { syllabus: [COPY_REJECTED] } } })
    expect(log).toEqual(["begin", `lock:${TARGET}`, "rollback"])
  })

  it("forbids copying into a sent syllabus or from one the teacher cannot see", async () => {
    rows.get(TARGET)!.state = "en_revision"
    expect(await copy({ version_bloqueo: 2 })).toMatchObject({ status: 403, text: FORBIDDEN })
    rows.get(TARGET)!.state = "borrador"
    Object.assign(rows.get(SOURCE)!, { currentTeacher: false, writtenByUser: false })
    expect(await copy({ version_bloqueo: 2 })).toMatchObject({ status: 403, text: FORBIDDEN })
    expect(log).toEqual([])
  })

  it("validates the edit version like Laravel", async () => {
    expect((await copy({})).json).toEqual({ message: "El campo versión de edición es obligatorio.", errors: { version_bloqueo: ["El campo versión de edición es obligatorio."] } })
    expect((await copy({ version_bloqueo: "dos" })).json?.errors).toEqual({ version_bloqueo: ["El campo versión de edición debe ser un número entero."] })
    expect((await copy({ version_bloqueo: -1 })).json?.errors).toEqual({ version_bloqueo: ["El campo versión de edición debe ser al menos 0."] })
    expect(log).toEqual([])
  })

  it("rolls back when a copied answer no longer fits its field", async () => {
    rows.get(SOURCE)!.values.set(techniques, { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Otro texto" }] }] })
    const response = await copy({ version_bloqueo: 2 })
    expect(response.status).toBe(422)
    expect(response.json!.errors).toEqual({ value: ["El diseño contiene un elemento no permitido."] })
    expect(rows.get(TARGET)!.values.has(bibliography)).toBe(true)
  })

  it("reads form bodies like JSON, answers Laravel's 404 for unknown syllabi and copies with the official definition when none is stored", async () => {
    expect((await copy("version_bloqueo=2", TARGET, SOURCE, { "content-type": "application/x-www-form-urlencoded" })).status).toBe(200)
    expect(await copy({ version_bloqueo: 2 }, TARGET, "50000000-0000-4000-8000-0000000000ff")).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "50000000-0000-4000-8000-0000000000ff") })
    templates.template = null
    expect(await copy({ version_bloqueo: 3 })).toMatchObject({ status: 404 })
  })
})

