// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected, purgeRequired } from "../syllabus/inProgressWorkHelpers"
import type { Db } from "../../prisma/db"
import type { PhpRecord } from "./phpValues"
import { careerProfileEditable, showSubjectProfile } from "./subjectProfile"
import { profileProgress, profileTemplates } from "./subjectProfileFields"
import { normalizeFieldDocument, plainText, responseTemplate } from "./templateRuntime"
import { updateSubjectProfile, type SubjectProfileTx, type SubjectProfileWriteDeps } from "./subjectProfileWrites"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "./testing"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const FIRST = "01a1c5bc-7a00-7000-8000-0000000000aa"
const SECOND = "01a1c5bc-7a00-7000-8000-0000000000bb"
const FOREIGN = "01a1c5bc-7a00-7000-8000-0000000000cc"
const BLOCKED = "El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado."

const index = (key: string) => goldenFields.findIndex((field) => field.key === key)
const SOLO_TEXTO = fieldId(index("sin_espacios"))

const text = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] })

let world: FakeWorld
let templates: FakeTemplateWorld
let subjects: Map<string, string>
let period: { processState: string; convocationState: string | null } | null
let purge: Record<string, string[]> | null
let log: string[]

const periodDb = (): Db => ({ $queryRaw: async () => (period === null ? [] : [period]) }) as unknown as Db

function deps(): SubjectProfileWriteDeps {
  const tx: SubjectProfileTx = {
    store: fakeTemplateStore(templates),
    lockSubject: async (id) => {
      log.push(`lock:subject:${id}`)
      const careerId = subjects.get(id)
      return careerId === undefined ? null : { careerId }
    },
    careerEditable: (careerId) => careerProfileEditable(periodDb(), careerId),
    deleteValue: async (subjectId, field) => {
      log.push(`delete:${subjectId}:${field}`)
      templates.values = templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field))
    },
    saveValue: async (subjectId, field, document) => {
      log.push(`save:${subjectId}:${field}`)
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
    bridge: fakeDeps(world),
    store: fakeTemplateStore(templates),
    subjectCareer: async (id) => subjects.get(id) ?? null,
    careerActive: async () => true,
    careerEditable: (careerId) => careerProfileEditable(periodDb(), careerId),
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

async function put(values: Record<string, unknown>, subject = FIRST) {
  const request = new Request(
    apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie, method: "PUT", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify({ values }) },
  )
  return updateSubjectProfile(request, subject, deps())
}

async function shown(subject = FIRST): Promise<Record<string, unknown>> {
  return (await (await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie }), subject, deps())).json()) as Record<string, unknown>
}

const storedValue = (subject: string, field: string): PhpRecord | undefined => templates.values.find((value) => value.subjectId === subject && value.fieldId === field)?.value as PhpRecord | undefined
const context = () => ({ template: templates.template!, definition: templates.template!.definition, store: fakeTemplateStore(templates) })
const pendingOf = async (subject: string) => {
  const progress = (await profileProgress(context(), [subject])).get(subject)!
  return progress.total - progress.filled
}
const contentOf = (field: string) => templates.template!.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((item) => item.id === field)!

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
  subjects = new Map([
    [FIRST, CAREER],
    [SECOND, CAREER],
    [FOREIGN, OTHER_CAREER],
  ])
  period = { processState: "abierto", convocationState: "abierto" }
  purge = null
  log = []
  asRole("coordinador", CAREER)
})

describe("«El docente puede editar este texto»", () => {
  const attrsOf = (subject: string, field: string) => (storedValue(subject, field)?.attrs ?? {}) as PhpRecord

  it("se guarda aunque el texto sea el de la plantilla y se puede quitar", async () => {
    const template = responseTemplate(normalizeFieldDocument(contentOf(SOLO_TEXTO).content, templates.template!.definition))
    await put({ [SOLO_TEXTO]: { ...template, attrs: { teacherEdits: true } } })
    expect(attrsOf(FIRST, SOLO_TEXTO).teacherEdits).toBe(true)
    const values = (await shown()).values as Record<string, PhpRecord>
    expect((values[SOLO_TEXTO].attrs as PhpRecord).teacherEdits).toBe(true)
    await put({ [SOLO_TEXTO]: template })
    expect(attrsOf(FIRST, SOLO_TEXTO).teacherEdits).toBeUndefined()
    expect(await pendingOf(FIRST)).toBe(await pendingOf(SECOND))
  })
})
