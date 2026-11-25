// @vitest-environment node
import { officialDefinition } from "./officialTemplate"
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../http/phpJson"
import { IDENTIFICATION_SAMPLE } from "./templatePresentation"
import { fakeTemplateStore, goldenSample, goldenTemplate, goldenFields, TEMPLATE_ID, type FakeTemplateWorld } from "./testing"
import { exportTemplateJson, teacherPreview, type TemplateReadDeps } from "./templateReads"
import { documentLines } from "./documentHtml"
import templateGolden from "./__fixtures__/template-golden.json"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Configuration\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'

let world: FakeWorld
let templates: FakeTemplateWorld

const deps = (): TemplateReadDeps => ({ bridge: fakeDeps(world), store: fakeTemplateStore(templates) })

const preview = (id = TEMPLATE_ID, withCookie = true) =>
  teacherPreview(apiRequest(`/api/v1/admin/template/${id}/teacher-preview`, withCookie ? { cookie } : {}), id, deps())

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

function asRole(role: string, careerId: string | null = null) {
  world.assignments = [makeAssignment({ role, careerId })]
}

function expectedPreview(): string {
  const template = goldenTemplate()
  const sections = template.sections.map((section) => {
    const fields = section.blocks.flatMap((block) =>
      block.fields.map((field) => {
        const source = goldenFields.find((candidate) => candidate.key === field.key)!
        const career = field.responsible !== "institucional"
        return (
          `{"id":"${field.id}","key":"${field.key}","label":${phpJsonEncode(field.label)},"quien_llena":"${field.responsible}",` +
          (career ? `"template":${source.expected.template},` : "") +
          `"teacher_editable":${career},"required":${career},"value":${source.expected.normalized},"document":${source.expected.resolved}}`
        )
      }),
    )
    return `{"id":"${section.id}","key":"${section.key}","title":${phpJsonEncode(section.title)},"orientation":"portrait","fields":[${fields.join(",")}]}`
  })
  return `{"sections":[${sections.join(",")}]}`
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  asRole("administrador")
  templates = { template: goldenTemplate(), values: [] }
})

describe("GET admin/template/{template}/teacher-preview", () => {
  it("uses the same sample identification card as Laravel", () => {
    expect(IDENTIFICATION_SAMPLE).toEqual(goldenSample)
  })

  it("shows the administrator the teacher form with the initial content and the sample identification", async () => {
    const response = await read(await preview())

    expect(response.status).toBe(200)
    expect(response.text).toBe(expectedPreview())
  })

  it("is reserved to the Administrator role", async () => {
    asRole("coordinador", "01a1c5bc-79ca-7331-8f0f-66d63f61c699")
    expect(await read(await preview())).toEqual({ status: 403, text: FORBIDDEN })
    asRole("docente", "c-1")
    expect(await read(await preview())).toEqual({ status: 403, text: FORBIDDEN })
  })

  it("without a session answers 401", async () => {
    expect(await read(await preview(TEMPLATE_ID, false))).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
  })

  it("answers Laravel's model 404 for an unknown template or a malformed id and previews a stored template without definition with the official one", async () => {
    expect(await read(await preview("01a1c5ba-10b4-7129-925f-000000000000"))).toEqual({ status: 404, text: modelNotFound("SyllabusTemplate", "01a1c5ba-10b4-7129-925f-000000000000") })
    expect(await read(await preview("plantilla"))).toEqual({ status: 404, text: modelNotFound("SyllabusTemplate", "plantilla") })
    templates.template = { ...goldenTemplate(), definition: officialDefinition() }
    expect((await preview()).status).toBe(200)
  })
})

describe("GET admin/template/{template}/json", () => {
  const exportJson = (id = TEMPLATE_ID, headers: Record<string, string> = {}) =>
    exportTemplateJson(apiRequest(`/api/v1/admin/template/${id}/json`, { cookie, headers }), id, deps())

  it("renders field contents and block layouts as the same HTML lines as Laravel", () => {
    for (const field of goldenFields) expect(phpJsonEncode(documentLines(field.content))).toBe(field.lines)
    for (const [kind, lines] of Object.entries(templateGolden.block_lines)) {
      const layout = (templateGolden.definition.blocks as Record<string, { layout: unknown }>)[kind].layout
      expect(phpJsonEncode(documentLines({ type: "doc", content: layout }))).toBe(lines)
    }
  })

  it("exports the template as the importable JSON with the schema of the requested host", async () => {
    const definition = templateGolden.definition as Record<string, unknown>
    const blocks = Object.entries(definition.blocks as Record<string, Record<string, unknown>>)
      .map(([kind, block]) => {
        const parts = [`"label":${phpJsonEncode(block.label)}`]
        for (const part of ["props", "value", "rules"]) {
          const value = block[part]
          if (!(Array.isArray(value) && value.length === 0)) parts.push(`"${part}":${phpJsonEncode(value)}`)
        }
        if (block.catalog !== undefined) parts.push(`"catalog":${phpJsonEncode(block.catalog)}`)
        parts.push(`"layout":${(templateGolden.block_lines as Record<string, string>)[kind]}`)
        return `"${kind}":{${parts.join(",")}}`
      })
      .join(",")
    const presets = (definition.presets as { key: string; label: string; field: string }[]).map((preset) => ({ key: preset.key, label: preset.label, field: preset.field }))
    const sections = goldenTemplate()
      .sections.map((section) => {
        const fields = section.blocks
          .flatMap((block) => block.fields)
          .map((field) => {
            const source = goldenFields.find((candidate) => candidate.key === field.key)!
            return `{"key":"${field.key}","label":${phpJsonEncode(field.label)},"quien_llena":"${field.responsible}","content":${source.lines}}`
          })
        return `{"key":"${section.key}","title":${phpJsonEncode(section.title)},"orientation":"portrait","fields":[${fields.join(",")}]}`
      })
      .join(",")
    const expected =
      `{"$schema":"https:\\/\\/silabos.ueb.edu.ec\\/plantilla.schema.json","version":2,"response_policy":"protected",` +
      `"document":${phpJsonEncode(definition.document)},"variables":${phpJsonEncode(definition.variables)},"blocks":{${blocks}},` +
      `"required_sections":${phpJsonEncode(definition.required_sections)},"library_sections":${phpJsonEncode(definition.library_sections)},` +
      `"presets":${phpJsonEncode(presets)},"sections":[${sections}]}`

    const response = await read(await exportJson(TEMPLATE_ID, { host: "silabos.ueb.edu.ec", "x-forwarded-proto": "https" }))

    expect(response.status).toBe(200)
    expect(response.text).toBe(expected)
  })

  it("is reserved to the Administrator role and leaves unknown templates to Laravel", async () => {
    asRole("coordinador", "01a1c5bc-79ca-7331-8f0f-66d63f61c699")
    expect(await read(await exportJson())).toEqual({ status: 403, text: FORBIDDEN })
    asRole("administrador")
    expect(await read(await exportJson("01a1c5ba-10b4-7129-925f-000000000000"))).toEqual({ status: 404, text: modelNotFound("SyllabusTemplate", "01a1c5ba-10b4-7129-925f-000000000000") })
  })
})
