// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import { fakeTemplateStore, goldenTemplate, TEMPLATE_ID, type FakeTemplateWorld } from "./testing"
import type { SyllabusTemplate } from "./templatePresentation"
import {
  destroyField,
  destroySection,
  reorderFields,
  reorderSections,
  storeField,
  storeSection,
  updateField,
  updateSection,
  type DocumentSection,
  type StoredField,
  type StructureDeps,
  type StructureStore,
} from "./templateStructure"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const NEW_SECTION = "0b1c5ba0-aaaa-4000-8000-000000000001"
const NEW_BLOCK = "0b1c5ba0-aaaa-4000-8000-000000000002"
const NEW_FIELD = "01a1c5ba-ffff-7000-8000-000000000001"

let world: FakeWorld
let templates: FakeTemplateWorld
let forwarded: Request[]
let openProcess: boolean
let log: string[]
let syncs: DocumentSection[][]
let inserted: StoredField[]
let updates: { id: string; changes: Record<string, unknown> }[]
let ids: string[]

function documentOf(template: SyllabusTemplate): DocumentSection[] {
  return template.sections.map((section) => ({
    id: section.id,
    key: section.key,
    title: section.title,
    orientation: section.orientation,
    position: section.position,
    blocks: section.blocks.map((block) => ({ id: block.id, key: block.key, title: block.title, position: block.position })),
  }))
}

function applySync(template: SyllabusTemplate, sections: DocumentSection[]): SyllabusTemplate {
  const fields = new Map(template.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields.map((field) => [block.id, field] as const))))
  for (const field of inserted) fields.set(field.blockId, { id: field.id, blockId: field.blockId, key: "", label: "", responsible: field.responsible, content: field.content })
  return {
    ...template,
    sections: [...sections]
      .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
      .map((section) => ({
        ...section,
        blocks: [...section.blocks]
          .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
          .map((block) => {
            const field = fields.get(block.id)
            return { ...block, fields: field ? [{ ...field, key: block.key, label: block.title }] : [] }
          }),
      })),
  }
}

const structure = (): StructureStore => ({
  templateLocked: async () => {
    log.push("process")
    return openProcess
  },
  field: async (id) => {
    for (const section of templates.template?.sections ?? []) {
      for (const block of section.blocks) {
        for (const field of block.fields) {
          if (field.id === id) return { id, templateId: TEMPLATE_ID, blockId: block.id, responsible: field.responsible, content: field.content }
        }
      }
    }
    return id === "01a1c5ba-9999-7000-8000-000000000001" ? { id, templateId: "01a1c5ba-9999-7000-8000-000000000002", blockId: NEW_BLOCK, responsible: "carrera", content: {} } : null
  },
  liveKeyTaken: async (templateId, key) => templateId === TEMPLATE_ID && (templates.template?.sections ?? []).some((section) => section.blocks.some((block) => block.key === key)),
  liveFieldBlocks: async (templateId, fieldIds) =>
    new Map(
      (templates.template?.sections ?? []).flatMap((section) =>
        section.blocks.flatMap((block) => block.fields.filter((field) => fieldIds.includes(field.id)).map((field) => [field.id, block.id] as [string, string])),
      ),
    ),
  async transaction(work) {
    const before = { template: templates.template, syncs: syncs.length, inserted: inserted.length, updates: updates.length }
    log.push("begin")
    try {
      const result = await work({
        lockTemplate: async (id) => {
          log.push(`lock ${id}`)
          return templates.template
        },
        syncDocument: async (id, sections) => {
          log.push(`sync ${id}`)
          syncs.push(sections)
          if (templates.template) templates.template = applySync(templates.template, sections)
        },
        insertField: async (field) => {
          log.push(`insert ${field.id}`)
          inserted.push(field)
          if (templates.template) templates.template = applySync(templates.template, documentOf(templates.template))
        },
        updateField: async (id, changes) => {
          log.push(`update ${id}`)
          updates.push({ id, changes })
        },
      })
      log.push("commit")
      return result
    } catch (error) {
      log.push("rollback")
      templates.template = before.template
      syncs.length = before.syncs
      inserted.length = before.inserted
      updates.length = before.updates
      throw error
    }
  },
})

const deps = (): StructureDeps => ({
  bridge: fakeDeps(world, forwarded),
  store: fakeTemplateStore(templates),
  structure: structure(),
  newId: () => ids.shift() ?? "0b1c5ba0-aaaa-4000-8000-0000000000ff",
  newFieldId: () => NEW_FIELD,
})

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1/admin/template/${TEMPLATE_ID}/structure/${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      referer: "http://localhost:3000/administracion/plantilla",
      cookie,
      "x-csrf-token": golden.csrfToken,
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  })
}

async function read(response: Promise<Response>) {
  const resolved = await response
  return { status: resolved.status, text: await resolved.text() }
}

const sectionKeys = (sections: DocumentSection[]) => sections.map((section) => `${section.position}:${section.key}`)
const message = (text: string, extra: Record<string, unknown> = {}) => phpJsonEncode({ message: text, ...extra })
const invalid = (errors: Record<string, string[]>) => {
  const messages = Object.values(errors).flat()
  const more = messages.length - 1
  return phpJsonEncode({ message: more > 0 ? `${messages[0]} (y ${more} ${more === 1 ? "error más" : "errores más"})` : messages[0], errors })
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  templates = { template: goldenTemplate(), values: [] }
  forwarded = []
  openProcess = false
  log = []
  syncs = []
  inserted = []
  updates = []
  ids = [NEW_SECTION, NEW_BLOCK]
})

describe("POST admin/template/{template}/structure/sections", () => {
  it("adds the section at the end inside a locked transaction", async () => {
    const before = documentOf(templates.template!)
    const response = await read(storeSection(request("POST", "sections", { key: "anexos", title: "  Anexos  " }), TEMPLATE_ID, deps()))
    expect(response).toEqual({ status: 201, text: message("Sección agregada a la plantilla.", { section_id: NEW_SECTION }) })
    expect(log).toEqual(["process", "begin", `lock ${TEMPLATE_ID}`, `sync ${TEMPLATE_ID}`, "commit"])
    expect(syncs).toEqual([[...before, { id: NEW_SECTION, key: "anexos", title: "Anexos", orientation: "portrait", position: before.length + 1, blocks: [] }]])
  })

  it("moves the new section to the requested position with a second sync", async () => {
    const response = await read(storeSection(request("POST", "sections", { key: "anexos", title: "Anexos", orientation: "landscape", position: 2 }), TEMPLATE_ID, deps()))
    expect(response.status).toBe(201)
    expect(syncs).toHaveLength(2)
    expect(sectionKeys(syncs[1]).slice(0, 3)).toEqual(["1:identificacion", "2:anexos", "3:descripcion"])
    expect(syncs[1][1]).toMatchObject({ id: NEW_SECTION, orientation: "landscape", blocks: [] })
  })

  it("rejects a key already used by another section, a bad key and a missing title", async () => {
    expect(await read(storeSection(request("POST", "sections", { key: "descripcion", title: "Otra" }), TEMPLATE_ID, deps()))).toEqual({
      status: 422,
      text: invalid({ key: ["La clave ya está siendo utilizada por otra sección."] }),
    })
    expect(await read(storeSection(request("POST", "sections", { key: "Mala Clave", orientation: "diagonal", position: 0 }), TEMPLATE_ID, deps()))).toEqual({
      status: 422,
      text: invalid({
        title: ["El campo título es obligatorio."],
        orientation: ["El valor seleccionado en orientación no es válido."],
        position: ["El campo posición debe ser al menos 1."],
        key: ["El formato del campo código de referencia no es válido."],
      }),
    })
    expect(log).toEqual([])
  })

  it("refuses to change the template while a process is open", async () => {
    openProcess = true
    expect(await read(storeSection(request("POST", "sections", { key: "anexos", title: "Anexos" }), TEMPLATE_ID, deps()))).toEqual({
      status: 422,
      text: invalid({ process: ["Proceso activo"] }),
    })
    expect(log).toEqual(["process"])
  })

  it("forbids anyone who is not an administrator", async () => {
    world.assignments = [makeAssignment({ role: "docente" })]
    expect(await read(storeSection(request("POST", "sections", { key: "anexos", title: "Anexos" }), TEMPLATE_ID, deps()))).toEqual({ status: 403, text: FORBIDDEN })
  })
})

describe("PATCH admin/template/{template}/structure/sections/{section}", () => {
  it("changes the title and keeps the orientation when it is not sent", async () => {
    const section = templates.template!.sections[1]
    const response = await read(updateSection(request("PATCH", `sections/${section.id}`, { title: "Descripción nueva", position: 9 }), TEMPLATE_ID, section.id, deps()))
    expect(response).toEqual({ status: 200, text: message("Sección actualizada.") })
    expect(syncs).toHaveLength(1)
    expect(syncs[0][1]).toEqual({ ...documentOf(goldenTemplate())[1], title: "Descripción nueva" })
  })

  it("leaves an unknown section to Laravel after validating the input", async () => {
    const missing = "01a1c5ba-2222-7000-8000-999999999999"
    expect(await read(updateSection(request("PATCH", `sections/${missing}`, {}), TEMPLATE_ID, missing, deps()))).toEqual({
      status: 422,
      text: invalid({ title: ["El campo título es obligatorio."] }),
    })
    expect((await read(updateSection(request("PATCH", `sections/${missing}`, { title: "X" }), TEMPLATE_ID, missing, deps()))).status).toBe(299)
    expect(forwarded).toHaveLength(1)
    expect(await forwarded[0].text()).toBe('{"title":"X"}')
  })
})

describe("PATCH admin/template/{template}/structure/sections/order", () => {
  it("saves the new order", async () => {
    const order = documentOf(templates.template!).map((section) => section.id).reverse()
    const response = await read(reorderSections(request("PATCH", "sections/order", { section_ids: order }), TEMPLATE_ID, deps()))
    expect(response).toEqual({ status: 200, text: message("Orden de secciones actualizado.") })
    expect(syncs[0].map((section) => section.id)).toEqual(order)
    expect(syncs[0].map((section) => section.position)).toEqual(order.map((_, index) => index + 1))
  })

  it("rejects ids that are not sections of the template and an incomplete order", async () => {
    const first = templates.template!.sections[0].id
    expect(await read(reorderSections(request("PATCH", "sections/order", { section_ids: [first, first, "x", "01a1c5ba-2222-7000-8000-999999999999"] }), TEMPLATE_ID, deps()))).toEqual({
      status: 422,
      text: invalid({
        "section_ids.0": ["El campo sección tiene un valor duplicado."],
        "section_ids.1": ["El campo sección tiene un valor duplicado."],
        "section_ids.2": ["El campo sección debe ser un UUID válido.", "La sección seleccionada no pertenece a la plantilla."],
        "section_ids.3": ["La sección seleccionada no pertenece a la plantilla."],
      }),
    })
    expect(await read(reorderSections(request("PATCH", "sections/order", { section_ids: [first] }), TEMPLATE_ID, deps()))).toEqual({
      status: 422,
      text: invalid({ sections: ["El nuevo orden no es válido. Recargue la página e intente otra vez."] }),
    })
    expect(log).toEqual(["process", "begin", `lock ${TEMPLATE_ID}`, "rollback"])
    expect(await read(reorderSections(request("PATCH", "sections/order", {}), TEMPLATE_ID, deps()))).toEqual({
      status: 422,
      text: invalid({ section_ids: ["El campo secciones es obligatorio."] }),
    })
  })
})

describe("DELETE admin/template/{template}/structure/sections/{section}", () => {
  it("removes the section from the document", async () => {
    const section = templates.template!.sections[1]
    const response = await read(destroySection(request("DELETE", `sections/${section.id}`), TEMPLATE_ID, section.id, deps()))
    expect(response).toEqual({ status: 200, text: message("Sección eliminada.") })
    expect(syncs[0].map((entry) => entry.id)).toEqual(documentOf(goldenTemplate()).filter((entry) => entry.id !== section.id).map((entry) => entry.id))
  })
})

describe("POST admin/template/{template}/structure/sections/{section}/fields", () => {
  const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Pregunta " }, { type: "response", attrs: { kind: "una", options: [{ const: "si", title: "Sí" }], value: "si", customOptions: true } }] }] }

  it("adds the field at the end of the section with its definition", async () => {
    const section = templates.template!.sections[1]
    const response = await read(storeField(request("POST", `sections/${section.id}/fields`, { key: "nuevo", label: "  Nuevo  ", quien_llena: "carrera", content }), TEMPLATE_ID, section.id, deps()))
    const stored = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Pregunta " }, { type: "response", attrs: { kind: "una", options: [{ const: "si", title: "Sí" }], value: null } }] }] }
    expect(response).toEqual({
      status: 201,
      text: message("Campo agregado a la sección.", { field: { id: NEW_FIELD, key: "nuevo", label: "Nuevo", quien_llena: "carrera", content: stored } }),
    })
    expect(log).toEqual(["process", "begin", `lock ${TEMPLATE_ID}`, `sync ${TEMPLATE_ID}`, `insert ${NEW_FIELD}`, "commit"])
    expect(syncs[0][1].blocks).toEqual([...documentOf(goldenTemplate())[1].blocks, { id: NEW_SECTION, key: "nuevo", title: "Nuevo", position: 2 }])
    expect(inserted).toEqual([{ id: NEW_FIELD, templateId: TEMPLATE_ID, blockId: NEW_SECTION, responsible: "carrera", content: stored }])
  })

  it("stops at the first invalid document like Laravel, keeping only that error", async () => {
    const section = templates.template!.sections[1]
    const response = await read(storeField(request("POST", `sections/${section.id}/fields`, { key: "Mala", quien_llena: "nadie", content: { type: "doc", content: [{ type: "heading" }] }, type: "x" }), TEMPLATE_ID, section.id, deps()))
    expect(response).toEqual({ status: 422, text: invalid({ content: ["El diseño contiene un elemento no permitido."] }) })
    expect(log).toEqual([])
  })

  it("rejects a key that a live field already uses and retired type or config", async () => {
    const section = templates.template!.sections[1]
    const response = await read(storeField(request("POST", `sections/${section.id}/fields`, { key: "descripcion", quien_llena: "carrera", content: { type: "doc", content: [{ type: "paragraph" }] }, config: [1] }), TEMPLATE_ID, section.id, deps()))
    expect(response).toEqual({
      status: 422,
      text: invalid({ config: ["El campo configuración retirada está prohibido."], key: ["El valor del campo clave ya está en uso."] }),
    })
  })

  it("rolls back when an institutional field brings a response", async () => {
    const section = templates.template!.sections[1]
    const response = await read(storeField(request("POST", `sections/${section.id}/fields`, { key: "fija", quien_llena: "institucional", content }), TEMPLATE_ID, section.id, deps()))
    expect(response).toEqual({ status: 422, text: invalid({ content: ["Un campo Institucional no lleva tipos de respuesta. Cambie quién lo llena o quite la respuesta."] }) })
    expect(log).toEqual(["process", "begin", `lock ${TEMPLATE_ID}`, "rollback"])
    expect(inserted).toEqual([])
  })
})

describe("PATCH admin/template/{template}/structure/fields/{field}", () => {
  it("updates the label, the responsible and the content of the field", async () => {
    const field = templates.template!.sections[1].blocks[0].fields[0]
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fijo" }] }] }
    const response = await read(updateField(request("PATCH", `fields/${field.id}`, { label: "Resumen", quien_llena: "institucional", content }), TEMPLATE_ID, field.id, deps()))
    const stored = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Fijo" }] }] }
    expect(response).toEqual({
      status: 200,
      text: message("Campo actualizado.", { field: { id: field.id, key: "descripcion", label: "Resumen", quien_llena: "institucional", content: stored } }),
    })
    expect(updates).toEqual([{ id: field.id, changes: { responsible: "institucional", content: stored } }])
    expect(syncs[0][1].blocks[0]).toEqual({ ...documentOf(goldenTemplate())[1].blocks[0], title: "Resumen" })
    expect(log).toEqual(["process", "begin", `lock ${TEMPLATE_ID}`, `update ${field.id}`, `sync ${TEMPLATE_ID}`, "commit"])
  })

  it("writes nothing to the definition when neither the responsible nor the content change", async () => {
    const field = templates.template!.sections[1].blocks[0].fields[0]
    const response = await read(updateField(request("PATCH", `fields/${field.id}`, { label: "Otra" }), TEMPLATE_ID, field.id, deps()))
    expect(response.status).toBe(200)
    expect(updates).toEqual([])
    expect(syncs).toHaveLength(1)
  })

  it("leaves fields of another template or unknown fields to Laravel", async () => {
    expect((await read(updateField(request("PATCH", "fields/x", { label: "A" }), TEMPLATE_ID, "01a1c5ba-9999-7000-8000-000000000001", deps()))).status).toBe(299)
    expect((await read(updateField(request("PATCH", "fields/x", { label: "A" }), TEMPLATE_ID, "01a1c5ba-9999-7000-8000-000000000003", deps()))).status).toBe(299)
    expect(forwarded).toHaveLength(2)
    expect(log).toEqual([])
  })
})

describe("PATCH admin/template/{template}/structure/sections/{section}/fields/order", () => {
  it("reorders the blocks of the section by field id", async () => {
    const section = templates.template!.sections[2]
    const fieldIds = section.blocks.map((block) => block.fields[0].id).reverse()
    const response = await read(reorderFields(request("PATCH", `sections/${section.id}/fields/order`, { field_ids: fieldIds }), TEMPLATE_ID, section.id, deps()))
    expect(response).toEqual({ status: 200, text: message("Orden de campos actualizado.") })
    expect(syncs[0][2].blocks.map((block) => `${block.position}:${block.key}`)).toEqual(["1:objetivos_especificos", "2:objetivo_general"])
  })

  it("rejects unknown fields before checking the process and fields of another section inside the transaction", async () => {
    const section = templates.template!.sections[2]
    openProcess = true
    expect(await read(reorderFields(request("PATCH", `sections/${section.id}/fields/order`, { field_ids: ["01a1c5ba-0000-7000-8000-999999999999"] }), TEMPLATE_ID, section.id, deps()))).toEqual({
      status: 422,
      text: invalid({ field_ids: ["El nuevo orden no es válido. Recargue la página e intente otra vez."] }),
    })
    openProcess = false
    const other = templates.template!.sections[1].blocks[0].fields[0].id
    expect(await read(reorderFields(request("PATCH", `sections/${section.id}/fields/order`, { field_ids: [other] }), TEMPLATE_ID, section.id, deps()))).toEqual({
      status: 422,
      text: invalid({ blocks: ["El nuevo orden no es válido. Recargue la página e intente otra vez."] }),
    })
  })
})

describe("DELETE admin/template/{template}/structure/fields/{field}", () => {
  it("removes the block of the field", async () => {
    const block = templates.template!.sections[2].blocks[0]
    const response = await read(destroyField(request("DELETE", `fields/${block.fields[0].id}`), TEMPLATE_ID, block.fields[0].id, deps()))
    expect(response).toEqual({ status: 200, text: message("Campo eliminado.") })
    expect(syncs[0][2].blocks.map((entry) => entry.key)).toEqual(["objetivos_especificos"])
  })
})
