// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import draftGolden from "./__fixtures__/draft-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { createRateLimiter, type RateLimiter } from "../http/throttle"
import { fakeTemplateStore, fieldId, goldenTemplate, TEMPLATE_ID, type FakeTemplateWorld } from "./testing"
import { checkTemplateDraft, previewTemplateDraft, templateDraftImpact, type TemplateDraftDeps } from "./templateDrafts"
import type { RehearsalReads, RehearsalStore } from "./templateRehearsal"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Configuration\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const cases = draftGolden as Record<string, { payload: unknown; problems: string; preview: { status: number; body: string }; impact: { status: number; body: string } }>

let world: FakeWorld
let templates: FakeTemplateWorld
let limiter: RateLimiter
let rehearsals: string[]
let paused: string | null
let syllabi: { id: string; state: string; subjectId: string; career: string | null; values: { fieldId: string; value: unknown }[] }[]

const rehearsal = (): RehearsalStore => ({
  pausedProcess: async () => paused,
  async rehearse(work) {
    rehearsals.push("begin")
    const reads: RehearsalReads = {
      lockTemplate: async (id) => void rehearsals.push(`lock ${id}`),
      currentTemplate: async () => templates.template,
      syllabi: async (processId) => (processId === paused ? syllabi.map(({ id, state, subjectId, career }) => ({ id, state, subjectId, career })) : []),
      syllabusValues: async (id) => syllabi.find((syllabus) => syllabus.id === id)?.values ?? [],
      fieldKeys: async (ids) => new Map(goldenTemplate().sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).filter((field) => ids.includes(field.id)).map((field) => [field.id, field.key])),
      store: fakeTemplateStore(templates),
    }
    try {
      return await work(reads)
    } finally {
      rehearsals.push("rollback")
    }
  },
})

const deps = (): TemplateDraftDeps => ({ bridge: fakeDeps(world), store: fakeTemplateStore(templates), rehearsal: rehearsal(), limiter })

function post(action: string, body: unknown, { id = TEMPLATE_ID, headers = {} }: { id?: string; headers?: Record<string, string> } = {}): Request {
  return new Request(`http://localhost:3000/api/v1/admin/template/${id}/draft/${action}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      referer: "http://localhost:3000/administracion/plantilla",
      cookie,
      "x-csrf-token": golden.csrfToken,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const handlers = { check: checkTemplateDraft, preview: previewTemplateDraft, impact: templateDraftImpact }

async function send(action: keyof typeof handlers, body: unknown, options: Parameters<typeof post>[2] = {}) {
  const response = await handlers[action](post(action, body, options), options.id ?? TEMPLATE_ID, deps())
  return { status: response.status, text: await response.text(), headers: response.headers }
}

function masked(text: string): string {
  const parsed = JSON.parse(text) as { sheets?: { id: string; fields: { id: string }[] }[] }
  let result = text
  ;(parsed.sheets ?? []).forEach((sheet, index) => {
    result = result.split(sheet.id).join(`section-${index}`)
    sheet.fields.forEach((field, position) => {
      result = result.split(field.id).join(`field-${index}-${position}`)
    })
  })
  return result
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  templates = { template: goldenTemplate(), values: [] }
  limiter = createRateLimiter()
  rehearsals = []
  paused = null
  syllabi = []
})

describe("POST admin/template/{template}/draft/check", () => {
  for (const [name, golden] of Object.entries(cases)) {
    it(`reports the same problems as Laravel for the «${name}» draft`, async () => {
      const response = await send("check", golden.payload)
      expect(response.status).toBe(200)
      expect(JSON.parse(response.text)).toEqual(JSON.parse(golden.problems))
      expect(response.headers.get("x-ratelimit-limit")).toBe("120")
      expect(response.headers.get("x-ratelimit-remaining")).toBe("119")
      expect(rehearsals).toEqual([])
    })
  }

  it("answers 429 after 120 checks in a minute, like throttle:120,1", async () => {
    for (let attempt = 0; attempt < 120; attempt++) expect((await send("check", { version: 1, sections: [] })).status).toBe(200)
    const limited = await send("check", { version: 1, sections: [] })
    expect(limited.status).toBe(429)
    expect(limited.text).toBe('{"message":"Too Many Attempts."}')
  })

  it("forbids anyone who is not an administrator with the authorization message", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c-1" })]
    const response = await send("check", { version: 1, sections: [] })
    expect(response).toMatchObject({ status: 403, text: FORBIDDEN })
  })
})

describe("POST admin/template/{template}/draft/preview", () => {
  for (const [name, golden] of Object.entries(cases)) {
    it(`builds the same preview as Laravel for the «${name}» draft`, async () => {
      const response = await send("preview", golden.payload)
      expect(response.status).toBe(golden.preview.status)
      expect(JSON.parse(response.status === 200 ? masked(response.text) : response.text)).toEqual(JSON.parse(golden.preview.body))
      expect(rehearsals).toEqual(golden.preview.status === 200 || name === "institutional_response" ? ["begin", `lock ${TEMPLATE_ID}`, "rollback"] : [])
    })
  }

  it("says the preview is unavailable when the rehearsal times out", async () => {
    const store = rehearsal()
    const response = await previewTemplateDraft(post("preview", cases.official.payload), TEMPLATE_ID, { ...deps(), rehearsal: { ...store, rehearse: async () => null } })
    expect(response.status).toBe(422)
    expect(await response.text()).toBe(
      '{"message":"No se pudo armar la vista previa ahora. Intente de nuevo.","errors":{"draft":["No se pudo armar la vista previa ahora. Intente de nuevo."]}}',
    )
  })
})

describe("POST admin/template/{template}/draft/impact", () => {
  for (const [name, golden] of Object.entries(cases)) {
    it(`gives the same impact as Laravel for the «${name}» draft when no process is paused`, async () => {
      const response = await send("impact", golden.payload)
      expect(response.status).toBe(golden.impact.status)
      expect(JSON.parse(response.text)).toEqual(JSON.parse(golden.impact.body))
      expect(rehearsals).toEqual([])
    })
  }

  const currentDraft = () => ({
    version: 1,
    sections: goldenTemplate().sections.map((section) => ({
      key: section.key,
      title: section.title,
      orientation: section.orientation,
      fields: section.blocks.flatMap((block) => block.fields.map((field) => ({ key: field.key, label: field.label, quien_llena: field.responsible, content: field.content }))),
    })),
  })

  function pausedWithTwoSyllabi() {
    paused = "01a1c5ba-3333-7000-8000-000000000001"
    const written = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Escrito por el docente" }] }] }
    syllabi = [
      { id: "01a1c5ba-4444-7000-8000-000000000001", state: "borrador", subjectId: "01a1c5ba-5555-7000-8000-000000000001", career: "Software", values: [{ fieldId: fieldId(1), value: written }] },
      { id: "01a1c5ba-4444-7000-8000-000000000002", state: "en_revision", subjectId: "01a1c5ba-5555-7000-8000-000000000002", career: "Agro", values: [] },
    ]
  }

  it("counts the syllabi in progress that keep their text and the sent ones that go back to draft", async () => {
    pausedWithTwoSyllabi()
    const response = await send("impact", currentDraft())
    expect(response.status).toBe(200)
    expect(response.text).toBe(
      '{"affected":true,"counted":true,"in_progress":2,"keep":2,"lose":0,"back_to_draft":1,"careers":[' +
        '{"name":"Agro","in_progress":1,"keep":1,"lose":0,"back_to_draft":1},{"name":"Software","in_progress":1,"keep":1,"lose":0,"back_to_draft":0}]}',
    )
    expect(rehearsals).toEqual(["begin", `lock ${TEMPLATE_ID}`, "rollback"])
  })

  it("counts a syllabus as losing text when the draft removes the field the teacher wrote", async () => {
    pausedWithTwoSyllabi()
    const draft = currentDraft()
    draft.sections = draft.sections.map((section) => (section.key === "descripcion" ? { ...section, fields: [] } : section))
    const response = await send("impact", draft)
    expect(response.text).toBe(
      '{"affected":true,"counted":true,"in_progress":2,"keep":1,"lose":1,"back_to_draft":1,"careers":[' +
        '{"name":"Agro","in_progress":1,"keep":1,"lose":0,"back_to_draft":1},{"name":"Software","in_progress":1,"keep":0,"lose":1,"back_to_draft":0}]}',
    )
  })

  it("says the impact could not be counted when the rehearsal times out", async () => {
    paused = "01a1c5ba-3333-7000-8000-000000000001"
    const store = rehearsal()
    const response = await templateDraftImpact(post("impact", cases.official.payload), TEMPLATE_ID, { ...deps(), rehearsal: { ...store, rehearse: async () => null } })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(
      '{"affected":true,"counted":false,"message":"No se pudo calcular qué sílabos cambian ahora.","in_progress":0,"keep":0,"lose":0,"back_to_draft":0,"careers":[]}',
    )
  })
})

describe("draft routes that stay in Laravel", () => {
  it("answers Laravel's model 404 without a template and reads a form body natively", async () => {
    templates.template = null
    expect(await send("preview", { version: 1, sections: [] })).toMatchObject({ status: 404, text: modelNotFound("SyllabusTemplate", TEMPLATE_ID) })
    templates.template = goldenTemplate()
    const response = await previewTemplateDraft(post("preview", "version=1", { headers: { "content-type": "application/x-www-form-urlencoded" } }), TEMPLATE_ID, deps())
    expect(response.status).toBe(422)
  })

  it("checks the origin and the session before anything else", async () => {
    expect(await send("preview", { version: 1, sections: [] }, { headers: { origin: "https://evil.example" } })).toMatchObject({ status: 401, text: '{"message":"Unauthenticated."}' })
    world.sessions.clear()
    const response = await send("preview", { version: 1, sections: [] })
    expect(response).toMatchObject({ status: 401, text: '{"message":"Unauthenticated."}' })
  })
})
