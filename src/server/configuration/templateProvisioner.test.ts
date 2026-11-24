// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import officialJson from "./officialTemplate.json"
import { fakeTemplateStore, goldenTemplate, TEMPLATE_ID, type FakeTemplateWorld } from "./testing"
import {
  clearTemplate,
  createTemplate,
  formatTemplate,
  importTemplateJson,
  officialDefinition,
  officialSections,
  type ProvisionDeps,
  type ProvisionTx,
} from "./templateProvisioner"
import type { DocumentSection } from "./templateStructure"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'

let world: FakeWorld
let templates: FakeTemplateWorld
let forwarded: Request[]
let log: string[]
let audits: AuditEventInput[]
let exists: boolean
let locked: boolean
let structure: boolean
let documents: DocumentSection[][]
let fields: { templateId: string; blockId: string; responsible: string }[]
let definitions: unknown[]
let coordination: Map<string, string>[]
let ids: number

const tx = (): ProvisionTx => ({
  anyTemplate: async () => (log.push("lock all"), exists),
  lockTemplate: async (id) => (log.push(`lock ${id}`), templates.template?.id === id ? templates.template : null),
  insertTemplate: async (id, definition) => void (log.push(`insert ${id}`), definitions.push(definition)),
  hasStructure: async () => structure,
  syncDocument: async (id, sections) => void (log.push(`sync ${id} ${sections.length}`), documents.push(sections)),
  suffixRetiredSections: async (id) => void log.push(`suffix ${id}`),
  insertField: async (field) => void fields.push({ templateId: field.templateId, blockId: field.blockId, responsible: field.responsible }),
  saveDefinition: async (id, definition) => void (log.push(`definition ${id}`), definitions.push(definition)),
  coordinationFields: async () => {
    const current = coordination.shift() ?? new Map()
    log.push(`coordination ${[...current.keys()].join(",")}`)
    return current
  },
  moveSubjectValues: async (from, to) => void log.push(`move ${from} ${to}`),
})

function deps(): ProvisionDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    store: fakeTemplateStore(templates),
    provision: {
      templateLocked: async () => locked,
      transaction: async (work) => {
        log.push("begin")
        const result = await work(tx())
        log.push("commit")
        return result
      },
      recordAudit: async (event) => void audits.push(event),
    },
    now: () => NOW,
    newTemplateId: () => "01a2bbbb-0000-7000-8000-000000000001",
    newBlockId: () => `0000000${++ids}-0000-4000-8000-000000000000`.slice(0, 36),
    newFieldId: () => `01a2bbbb-0000-7000-8000-${String(++ids).padStart(12, "0")}`,
  }
}

function send(method: string, path: string, body: unknown = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { accept: "application/json", "content-type": "application/json", referer: "http://localhost:3000/plantilla", cookie, "x-csrf-token": golden.csrfToken },
  })
}

async function read(response: Response) {
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = { sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]), users: [makeUser()], assignments: [makeAssignment({ role: "administrador", careerId: null })] }
  templates = { template: goldenTemplate(), values: [] }
  forwarded = []
  log = []
  audits = []
  exists = true
  locked = false
  structure = true
  documents = []
  fields = []
  definitions = []
  coordination = []
  ids = 0
})

describe("official template", () => {
  it("reads the twelve official sections with their contents as documents", () => {
    const sections = officialSections()
    expect(sections.map((section) => section.key)).toEqual(officialJson.sections.map((section) => section.key))
    expect(sections.every((section) => section.fields.every((field) => typeof field.content === "object" && !Array.isArray(field.content)))).toBe(true)
    expect(Object.keys(officialDefinition())).toEqual(["response_policy", "document", "variables", "blocks", "required_sections", "library_sections", "presets"])
  })
})

describe("POST /api/v1/admin/template", () => {
  it("creates the empty template once, audited", async () => {
    exists = false
    expect(await read(await createTemplate(send("POST", "/api/v1/admin/template"), deps()))).toEqual({
      status: 201,
      text: '{"message":"Plantilla vac\\u00eda creada.","template_id":"01a2bbbb-0000-7000-8000-000000000001"}',
    })
    expect(log).toEqual(["begin", "lock all", "insert 01a2bbbb-0000-7000-8000-000000000001", "sync 01a2bbbb-0000-7000-8000-000000000001 0", "commit"])
    expect(audits.map((event) => event.action)).toEqual(["plantilla.creada"])
  })

  it("creates it with the official format and audits both steps", async () => {
    exists = false
    expect((await read(await createTemplate(send("POST", "/api/v1/admin/template", { official: true }), deps()))).text).toBe(
      '{"message":"Plantilla creada con el formato oficial.","template_id":"01a2bbbb-0000-7000-8000-000000000001"}',
    )
    expect(documents.at(-1)?.map((section) => section.key)).toEqual(officialJson.sections.map((section) => section.key))
    expect(fields).toHaveLength(officialJson.sections.reduce((sum, section) => sum + section.fields.length, 0))
    expect(audits.map((event) => [event.action, event.resourceType, event.resourceId])).toEqual([
      ["plantilla.creada", "plantilla_silabo", "01a2bbbb-0000-7000-8000-000000000001"],
      ["plantilla.formateada", "plantilla_silabo", "01a2bbbb-0000-7000-8000-000000000001"],
    ])
  })

  it("refuses a second template, an open process and other roles", async () => {
    expect(await read(await createTemplate(send("POST", "/api/v1/admin/template"), deps()))).toEqual({
      status: 422,
      text: '{"message":"La plantilla institucional ya existe. Ed\\u00edtela en lugar de crear otra.","errors":{"template":["La plantilla institucional ya existe. Ed\\u00edtela en lugar de crear otra."]}}',
    })
    locked = true
    expect(await read(await createTemplate(send("POST", "/api/v1/admin/template"), deps()))).toEqual({ status: 422, text: '{"message":"Proceso activo","errors":{"process":["Proceso activo"]}}' })
    expect(await read(await createTemplate(send("POST", "/api/v1/admin/template", { official: "quizas" }), deps()))).toEqual({
      status: 422,
      text: '{"message":"El campo formato oficial debe ser verdadero o falso.","errors":{"official":["El campo formato oficial debe ser verdadero o falso."]}}',
    })
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect((await read(await createTemplate(send("POST", "/api/v1/admin/template"), deps()))).text).toBe(FORBIDDEN)
    expect(audits).toEqual([])
  })
})

describe("POST /api/v1/admin/template/{template}/format and DELETE …/structure", () => {
  it("retires the structure, builds the official one and saves the official definition", async () => {
    expect(await read(await formatTemplate(send("POST", `/api/v1/admin/template/${TEMPLATE_ID}/format`), TEMPLATE_ID, deps()))).toEqual({
      status: 200,
      text: '{"message":"Plantilla restablecida al formato oficial."}',
    })
    expect(log.slice(0, 5)).toEqual(["begin", `lock ${TEMPLATE_ID}`, `sync ${TEMPLATE_ID} 0`, `suffix ${TEMPLATE_ID}`, `sync ${TEMPLATE_ID} 12`])
    expect(log.slice(-2)).toEqual([`definition ${TEMPLATE_ID}`, "commit"])
    expect(audits.map((event) => event.action)).toEqual(["plantilla.formateada"])
  })

  it("clears the template only when it has a structure", async () => {
    expect((await read(await clearTemplate(send("DELETE", `/api/v1/admin/template/${TEMPLATE_ID}/structure`), TEMPLATE_ID, deps()))).text).toBe('{"message":"Plantilla vaciada."}')
    expect(log).toEqual(["begin", `lock ${TEMPLATE_ID}`, `sync ${TEMPLATE_ID} 0`, `suffix ${TEMPLATE_ID}`, "commit"])
    structure = false
    log = []
    await clearTemplate(send("DELETE", `/api/v1/admin/template/${TEMPLATE_ID}/structure`), TEMPLATE_ID, deps())
    expect(log).toEqual(["begin", `lock ${TEMPLATE_ID}`, "commit"])
    expect(audits.map((event) => event.action)).toEqual(["plantilla.vaciada", "plantilla.vaciada"])
  })

  it("is blocked by an open process and forbidden to other roles", async () => {
    locked = true
    expect((await read(await clearTemplate(send("DELETE", `/api/v1/admin/template/${TEMPLATE_ID}/structure`), TEMPLATE_ID, deps()))).text).toBe('{"message":"Proceso activo","errors":{"process":["Proceso activo"]}}')
    world.assignments = [makeAssignment({ role: "docente" })]
    expect((await read(await formatTemplate(send("POST", `/api/v1/admin/template/${TEMPLATE_ID}/format`), TEMPLATE_ID, deps()))).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })
})

describe("PUT /api/v1/admin/template/{template}/json", () => {
  const payload = { version: 2, sections: [{ key: "datos", title: "Datos", fields: [{ key: "resumen", label: "Resumen", quien_llena: "docente", content: "<p>Escriba</p>" }] }] }

  it("replaces the structure, keeps the subject profiles by key and audits the number of sections", async () => {
    coordination = [new Map([["resumen", "old-field"]]), new Map([["resumen", "new-field"]])]
    expect(await read(await importTemplateJson(send("PUT", `/api/v1/admin/template/${TEMPLATE_ID}/json`, payload), TEMPLATE_ID, deps()))).toEqual({
      status: 200,
      text: '{"message":"Plantilla importada desde el JSON."}',
    })
    expect(log).toEqual(["begin", `lock ${TEMPLATE_ID}`, "coordination resumen", `sync ${TEMPLATE_ID} 0`, `suffix ${TEMPLATE_ID}`, `definition ${TEMPLATE_ID}`, `sync ${TEMPLATE_ID} 1`, "coordination resumen", "move old-field new-field", "commit"])
    expect(fields).toEqual([{ templateId: TEMPLATE_ID, blockId: expect.any(String), responsible: "carrera" }])
    expect(audits).toEqual([expect.objectContaining({ action: "plantilla.importada", resourceType: "plantilla_silabo", resourceId: TEMPLATE_ID, metadata: { sections: 1 } })])
  })

  it("validates the JSON before the process lock", async () => {
    locked = true
    const response = await read(await importTemplateJson(send("PUT", `/api/v1/admin/template/${TEMPLATE_ID}/json`, { version: 3, sections: [] }), TEMPLATE_ID, deps()))
    expect(response.status).toBe(422)
    expect(JSON.parse(response.text).errors.version).toEqual(["El valor seleccionado en versión no es válido."])
    expect((await read(await importTemplateJson(send("PUT", `/api/v1/admin/template/${TEMPLATE_ID}/json`, payload), TEMPLATE_ID, deps()))).text).toBe('{"message":"Proceso activo","errors":{"process":["Proceso activo"]}}')
  })
})
