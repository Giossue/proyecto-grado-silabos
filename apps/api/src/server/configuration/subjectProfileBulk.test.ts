// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected } from "../syllabus/inProgressWorkHelpers"
import type { PhpRecord } from "./phpValues"
import type { Db } from "../../prisma/db"
import { careerProfileBlock } from "./subjectProfile"
import { BULK_NO_OPTIONS, BULK_UNDECIDED } from "@silabos/shared/schemas/imports"
import { applySubjectProfileBulk, BULK_FOREIGN_SUBJECT, showSubjectProfileBulk, type SubjectProfileBulkDeps } from "./subjectProfileBulk"
import { FIELD_GONE, type SubjectProfileTx } from "./subjectProfileWrites"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "./testing"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const EMPTY = "01a1c5bc-7a00-7000-8000-0000000000a1"
const WRITTEN = "01a1c5bc-7a00-7000-8000-0000000000a2"
const NO_OPTIONS_YET = "01a1c5bc-7a00-7000-8000-0000000000a3"
const FOREIGN = "01a1c5bc-7a00-7000-8000-0000000000ff"
const ALL = [EMPTY, WRITTEN, NO_OPTIONS_YET]

const index = (key: string) => goldenFields.findIndex((field) => field.key === key)
const DESCRIPCION = fieldId(index("descripcion"))
const OBJETIVO = fieldId(index("objetivo_general"))
const INSTITUTIONAL = fieldId(index("firmas"))

const paragraph = (...content: PhpRecord[]): PhpRecord => ({ type: "paragraph", attrs: { textAlign: "left" }, ...(content.length ? { content } : {}) })
const doc = (...content: PhpRecord[]): PhpRecord => ({ type: "doc", content })
const words = (value: string): PhpRecord => ({ type: "text", text: value })
const question = (kind: "texto" | "una" | "varias", options: string[] = []): PhpRecord => ({
  type: "response",
  attrs: { kind, options: options.map((title, position) => ({ const: `o${position + 1}`, title })), value: kind === "varias" ? [] : kind === "texto" ? "" : null },
})
const teacherWrites = () => doc(paragraph(question("texto")))
const choices = (options: string[]) => doc(paragraph(question("varias", options)))

let world: FakeWorld
let templates: FakeTemplateWorld
let subjects: Map<string, string>
let period: { processState: string; convocationState: string | null } | null
let purge: Record<string, string[]> | null
let log: string[]

const periodDb = (): Db => ({ $queryRaw: async () => (period === null ? [] : [period]) }) as unknown as Db
const BLOCKED_PERIOD = { processState: "cerrado", convocationState: "cerrado" }
const blockedReason = async () => careerProfileBlock(periodDb(), CAREER)

function deps(): SubjectProfileBulkDeps {
  const tx: SubjectProfileTx = {
    store: fakeTemplateStore(templates),
    lockSubject: async (id) => {
      log.push(`lock:${id.slice(-2)}`)
      const careerId = subjects.get(id)
      return careerId === undefined ? null : { careerId }
    },
    careerBlock: (careerId) => careerProfileBlock(periodDb(), careerId),
    deleteValue: async () => void log.push("delete"),
    saveValue: async (subjectId, field, document) => {
      log.push(`save:${subjectId.slice(-2)}`)
      templates.values = [...templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field)), { fieldId: field, subjectId, value: document }]
    },
    keepContent: async (confirmed, careerId, subjectIds, change) => {
      log.push(`keep:${confirmed}:${careerId}:${subjectIds.map((id) => id.slice(-2)).join(",")}`)
      if (purge !== null && !confirmed) throw new GenerationRejected(purge)
      return change()
    },
  }
  return {
    bridge: fakeDeps(world),
    store: fakeTemplateStore(templates),
    subjectCareer: async (id) => subjects.get(id) ?? null,
    careerActive: async () => true,
    careerBlock: (careerId) => careerProfileBlock(periodDb(), careerId),
    careerSubjects: async (careerId) => [...subjects].filter(([, career]) => career === careerId).map(([id]) => id),
    async transaction(work) {
      const values = templates.values
      try {
        return await work(tx)
      } catch (error) {
        templates.values = values
        throw error
      }
    },
  }
}

const stored = (subjectId: string, field = DESCRIPCION): unknown => templates.values.find((value) => value.subjectId === subjectId && value.fieldId === field)?.value ?? null
const put = (subjectId: string, value: PhpRecord, field = DESCRIPCION) => void templates.values.push({ fieldId: field, subjectId, value })

async function answer(response: Response) {
  const raw = await response.text()
  return { status: response.status, json: raw.startsWith("{") ? (JSON.parse(raw) as Record<string, unknown>) : null }
}

async function catalog(careerId: string | null = null) {
  const path = careerId === null ? "/api/v1/coordination/ficha-bulk" : `/api/v1/admin/careers/${careerId}/ficha-bulk`
  return answer(await showSubjectProfileBulk(apiRequest(path, { cookie }), deps(), careerId))
}

async function apply(body: Record<string, unknown>, careerId: string | null = null) {
  const path = careerId === null ? "/api/v1/coordination/ficha-bulk" : `/api/v1/admin/careers/${careerId}/ficha-bulk`
  const request = new Request(apiRequest(path, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }), { body: JSON.stringify(body) })
  return answer(await applySubjectProfileBulk(request, deps(), careerId))
}

const fill = (value: unknown = teacherWrites(), extra: Record<string, unknown> = {}) => ({ field_id: DESCRIPCION, value, subjects: ALL, ...extra })
const errorsOf = (json: Record<string, unknown> | null) => json?.errors as Record<string, string[]>
const filledOf = (json: Record<string, unknown> | null, field = DESCRIPCION) => (json!.fields as { id: string; filled_subjects: string[] }[]).find((item) => item.id === field)!.filled_subjects

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  templates = { template: goldenTemplate(), values: [] }
  subjects = new Map([...ALL.map((id): [string, string] => [id, CAREER]), [FOREIGN, OTHER_CAREER]])
  period = { processState: "abierto", convocationState: "preparacion" }
  purge = null
  log = []
  put(WRITTEN, doc(paragraph(words("Texto que ya escribió Coordinación"))))
  put(NO_OPTIONS_YET, choices([]))
})

describe("GET ficha-bulk", () => {
  it("lists the career fields and the subjects that already have something in each one", async () => {
    const response = await catalog()
    expect(response.status).toBe(200)
    const fields = response.json!.fields as Record<string, unknown>[]
    expect(fields.map((field) => field.id)).toContain(DESCRIPCION)
    expect(fields.map((field) => field.id)).not.toContain(INSTITUTIONAL)
    expect(fields.find((field) => field.id === DESCRIPCION)).toMatchObject({ key: "descripcion", template: { type: "doc" } })
    expect(filledOf(response.json)).toEqual([WRITTEN])
    expect(filledOf(response.json, OBJETIVO)).toEqual([])
    expect(response.json).toHaveProperty("definition")
    expect(response.json!.lock_reason).toBeNull()
    expect(log).toEqual([])
  })

  it("counts a choice without options as something when the subject also has its own text", async () => {
    templates.values = []
    put(EMPTY, doc(paragraph(words("Elija el enfoque")), paragraph(question("varias"))))
    put(WRITTEN, choices(["Aula invertida"]))
    expect(filledOf((await catalog()).json).toSorted()).toEqual([EMPTY, WRITTEN])
  })

  it("counts every subject as filled when the template already decides the field", async () => {
    const field = templates.template!.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((item) => item.id === OBJETIVO)!
    field.content = teacherWrites() as never
    expect(filledOf((await catalog()).json, OBJETIVO).toSorted()).toEqual(ALL)
  })

  it("is only for the career coordinator and the administrator of the asked career, with the lock reason", async () => {
    period = BLOCKED_PERIOD
    const reason = await blockedReason()
    expect(reason).not.toBeNull()
    expect((await catalog()).json!.lock_reason).toBe(reason)
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await catalog()).status).toBe(403)
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await catalog(OTHER_CAREER)).status).toBe(403)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    const admin = await catalog(CAREER)
    expect({ status: admin.status, lock: admin.json!.lock_reason }).toEqual({ status: 200, lock: null })
  })
})

describe("POST ficha-bulk", () => {
  it("writes the field in every chosen subject, also over what it already had", async () => {
    const response = await apply(fill(choices(["Aula invertida", "Estudio de casos"])))
    expect(response).toEqual({ status: 200, json: { message: "Campo llenado.", applied: 3 } })
    for (const id of ALL) expect(JSON.stringify(stored(id))).toContain("Estudio de casos")
    expect(JSON.stringify(stored(WRITTEN))).not.toContain("ya escribió")
    expect(JSON.stringify(stored(EMPTY, OBJETIVO))).toBe("null")
    expect(log).toEqual(["lock:a1", "lock:a2", "lock:a3", `keep:false:${CAREER}:a1,a2,a3`, "save:a1", "save:a2", "save:a3"])
  })

  it("leaves the subjects that were not chosen as they were", async () => {
    const before = structuredClone(stored(WRITTEN))
    expect((await apply(fill(teacherWrites(), { subjects: [EMPTY] }))).json).toEqual({ message: "Campo llenado.", applied: 1 })
    expect(stored(WRITTEN)).toEqual(before)
  })

  it("does not apply a field that is still undecided", async () => {
    const cases: [unknown, string][] = [
      [null, BULK_UNDECIDED],
      [doc({ type: "paragraph" }), BULK_UNDECIDED],
      [choices([]), BULK_NO_OPTIONS],
    ]
    for (const [value, message] of cases) {
      const response = await apply(fill(value))
      expect({ status: response.status, errors: errorsOf(response.json) }).toEqual({ status: 422, errors: { value: [message] } })
    }
    expect(log.filter((entry) => entry.startsWith("save") || entry === "delete")).toEqual([])
  })

  it("accepts only subjects of the career and fields filled by the career", async () => {
    const foreign = await apply(fill(teacherWrites(), { subjects: [EMPTY, FOREIGN] }))
    expect({ status: foreign.status, errors: errorsOf(foreign.json) }).toEqual({ status: 422, errors: { subjects: [BULK_FOREIGN_SUBJECT] } })
    expect(errorsOf((await apply(fill(teacherWrites(), { field_id: INSTITUTIONAL }))).json)).toEqual({ field_id: [FIELD_GONE] })
    for (const body of [{}, fill(teacherWrites(), { subjects: [] }), fill(teacherWrites(), { subjects: [EMPTY, EMPTY] })]) expect((await apply(body)).status).toBe(422)
    expect(log.filter((entry) => entry.startsWith("save"))).toEqual([])
  })

  it("keeps the period lock for Coordination and not for Administration", async () => {
    period = BLOCKED_PERIOD
    const blocked = await apply(fill())
    expect({ status: blocked.status, errors: errorsOf(blocked.json) }).toEqual({ status: 422, errors: { process: [await blockedReason()] } })
    expect(stored(EMPTY)).toBeNull()
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    expect((await apply(fill(), CAREER)).json).toMatchObject({ applied: 3 })
  })

  it("refuses other roles and a coordinator who names another career", async () => {
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await apply(fill())).status).toBe(403)
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await apply(fill(), OTHER_CAREER)).status).toBe(403)
    expect(log).toEqual([])
  })

  it("asks to confirm before touching a finalized period and applies once confirmed", async () => {
    purge = { purge_mode: ["convocatoria_finalizada"] }
    const warned = await apply(fill())
    expect(warned.status).toBe(422)
    expect(errorsOf(warned.json).purge_mode).toEqual(["convocatoria_finalizada"])
    expect(stored(EMPTY)).toBeNull()
    expect((await apply(fill(teacherWrites(), { confirm_purge: true }))).json).toMatchObject({ applied: 3 })
  })

  it("writes nothing when one of the subjects left the career in the meantime", async () => {
    const world_ = deps()
    const request = new Request(apiRequest("/api/v1/coordination/ficha-bulk", { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }), { body: JSON.stringify(fill()) })
    const listed = await world_.careerSubjects(CAREER)
    subjects.set(NO_OPTIONS_YET, OTHER_CAREER)
    const response = await applySubjectProfileBulk(request, { ...world_, careerSubjects: async () => listed }, null)
    expect(response.status).toBe(403)
    expect(stored(EMPTY)).toBeNull()
  })
})
