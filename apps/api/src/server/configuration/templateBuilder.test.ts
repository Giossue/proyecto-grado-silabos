// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpShape, type PhpRecord } from "./phpValues"
import { fakeTemplateStore, goldenTemplate, TEMPLATE_ID, type FakeTemplateWorld } from "./testing"
import { designTemplateTable, templateIndex, templateShow, type TemplateBuilderDeps, type TemplateLock } from "./templateBuilder"
import { institutionUrl } from "./institutionalLogos"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Configuration\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const POINTER = "Para cambiarla use Opciones avanzadas → Editar JSON."

let world: FakeWorld
let templates: FakeTemplateWorld
let lock: TemplateLock | null
let changedDuringPause: boolean

const deps = (): TemplateBuilderDeps => ({
  bridge: fakeDeps(world),
  store: fakeTemplateStore(templates),
  locks: { processLock: async () => lock, changedDuringPause: async () => changedDuringPause },
})

const index = () => templateIndex(apiRequest("/api/v1/admin/template", { cookie }), deps())
const show = (id = TEMPLATE_ID) => templateShow(apiRequest(`/api/v1/admin/template/${id}`, { cookie }), id, deps())
const design = (body: unknown, id = TEMPLATE_ID) =>
  designTemplateTable(
    new Request(`http://localhost:3000/api/v1/admin/template/${id}/blocks/design`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        referer: "http://localhost:3000/administracion/plantilla",
        cookie,
        "x-csrf-token": golden.csrfToken,
      },
      body: JSON.stringify(body),
    }),
    id,
    deps(),
  )

async function json(response: Response): Promise<{ status: number; body: PhpRecord }> {
  return { status: response.status, body: JSON.parse(await response.text()) as PhpRecord }
}

function asRole(role: string) {
  world.assignments = [makeAssignment({ role })]
}

function practices(): PhpRecord {
  return {
    kind: "practicas",
    new: true,
    label: "Prácticas de laboratorio",
    list: "practicas",
    item: "práctica",
    min: 1,
    max: 10,
    initial: 2,
    band: null,
    columns: [
      { title: "Tema", type: "text", max_length: 200, multiline: false, width: 200, required: true },
      { title: "Modalidad", type: "choice", options: [{ label: "Presencial" }, { label: "Virtual" }], width: null, required: false },
      { title: "Horas", type: "number", maximum: 99, decimals: 0, width: null, required: false },
    ],
  }
}

async function booksDesign(): Promise<PhpRecord> {
  const designs = (await json(await show())).body.blockDesigns as Record<string, PhpRecord>
  return structuredClone(designs.bibliografia.design as PhpRecord)
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  asRole("administrador")
  templates = { template: goldenTemplate(), values: [] }
  lock = null
  changedDuringPause = false
})

describe("GET admin/template and admin/template/{template}", () => {
  it("returns the builder of the institutional template to the administrator", async () => {
    const response = await show()
    const { status, body } = await json(response.clone())
    expect(status).toBe(200)
    expect(Object.keys(body)).toEqual(["processLock", "processLockDetail", "templateChangedDuringPause", "variables", "presets", "definition", "blockDesigns", "logos", "template"])
    expect([body.processLock, body.processLockDetail, body.templateChangedDuringPause]).toEqual([null, null, false])
    const template = body.template as PhpRecord
    expect(Object.keys(template)).toEqual(["id", "name", "appearance", "layout", "layoutOptions", "titleBlock", "sections"])
    expect([template.id, template.name, (template.titleBlock as PhpRecord).text]).toEqual([TEMPLATE_ID, "Plantilla institucional de sílabo", "PROGRAMA DE ASIGNATURA (SÍLABO)"])
    expect(body.logos).toEqual({
      institution: await institutionUrl(apiRequest("/api/v1/admin/template")),
      faculty: expect.stringMatching(/\/images\/silabo\/facultad\.jpeg\?v=\d+$/),
      institution_size: { width: 1012, height: 190 },
      faculty_size: { width: 600, height: 180 },
    })
    expect(await (await index()).text()).toBe(await response.text())
  })

  it("opens the official tables in the designer or says why they cannot", async () => {
    const designs = (await json(await show())).body.blockDesigns as Record<string, PhpRecord>
    const books = designs.bibliografia.design as PhpRecord
    const columns = books.columns as PhpRecord[]
    expect(designs.bibliografia.reason).toBeNull()
    expect([books.label, books.list, books.item, books.min, books.max, books.initial]).toEqual(["Bibliografía", "libros", "libro", 1, 40, 1])
    expect(columns.map((column) => column.title)).toEqual(["Autor", "Título", "Año", "Ciudad", "Editorial", "ISBN", "Código"])
    expect([columns[1].type, columns[1].max_length, columns[1].multiline, columns[1].width, columns[1].required]).toEqual(["text", 1000, false, null, true])
    expect(columns[0].required).toBe(false)
    expect(designs.unidades.design).toBeNull()
    expect(designs.unidades.reason).toBe(`Tiene listas o grupos dentro de cada fila. ${POINTER}`)
    expect(designs.identificacion.reason).toBe(`No es una sola lista de filas. ${POINTER}`)
    expect(designs.evaluacion.reason).toBe(`No tiene datos que llene el docente: es una tabla fija. ${POINTER}`)
  })

  it("reports the active process lock and template changes during a pause", async () => {
    lock = { period: "2026-1", deliveryOn: "2026-12-01" }
    changedDuringPause = true
    const { body } = await json(await show())
    expect(body.processLock).toBe("Proceso activo")
    expect(body.processLockDetail).toEqual({ scope: "process", period: "2026-1", institutional_pause: false, delivery_on: "2026-12-01" })
    expect(body.templateChangedDuringPause).toBe(true)
  })

  it("answers without a template when none exists", async () => {
    templates.template = null
    lock = { period: null, deliveryOn: "2026-12-01" }
    expect(await (await index()).text()).toBe(
      JSON.stringify({ processLock: "Proceso activo", processLockDetail: { scope: "process", period: null, institutional_pause: false, delivery_on: "2026-12-01" }, template: null }),
    )
  })

  it("does not let a non-administrator manage templates", async () => {
    asRole("coordinador")
    expect([(await index()).status, await (await index()).text()]).toEqual([403, FORBIDDEN])
    expect([(await show()).status, await (await show()).text()]).toEqual([403, FORBIDDEN])
  })

  it("answers Laravel's model 404 for unknown templates", async () => {
    const unknown = await show("0199a1c5-0000-7000-8000-000000000999")
    expect({ status: unknown.status, text: await unknown.text() }).toEqual({ status: 404, text: modelNotFound("SyllabusTemplate", "0199a1c5-0000-7000-8000-000000000999") })
  })
})

describe("POST admin/template/{template}/blocks/design", () => {
  it("designs a new table", async () => {
    const { status, body } = await json(await design(practices()))
    expect(status).toBe(200)
    expect(Object.keys(body)).toEqual(["kind", "definition", "design", "initial"])
    const result = body.design as PhpRecord
    const columns = result.columns as PhpRecord[]
    expect(body.kind).toBe("practicas")
    expect(columns.map((column) => column.key)).toEqual(["tema", "modalidad", "horas"])
    expect(columns[1].options).toEqual([
      { value: "presencial", label: "Presencial" },
      { value: "virtual", label: "Virtual" },
    ])
    expect((body.initial as PhpRecord).practicas).toEqual([
      { tema: "", modalidad: null, horas: "" },
      { tema: "", modalidad: null, horas: "" },
    ])
    const definition = body.definition as PhpRecord
    expect(definition.rules).toEqual([
      { code: "tema_obligatoria", on: "submit", message: "Llene «Tema» en cada práctica: {detail}.", checks: [{ filled: "practicas.*.tema", equals: { count: "practicas" }, label: "Tema" }] },
    ])
    const layout = definition.layout as PhpRecord[]
    expect((((layout[0].content as PhpRecord[])[0].content as PhpRecord[])[0].attrs as PhpRecord).colwidth).toEqual([200])
  })

  it("edits the columns, types and row limits of an official table", async () => {
    const books = await booksDesign()
    const columns = books.columns as PhpRecord[]
    books.max = 20
    columns[2].title = "Año de publicación"
    columns[3].width = 120
    columns.push({ title: "Enlace", type: "text", max_length: 300, multiline: false, width: null, required: true })
    const { status, body } = await json(await design(books))
    expect(status).toBe(200)
    const definition = body.definition as PhpRecord
    const list = (definition.value as PhpRecord).libros as PhpRecord
    const properties = (list.items as PhpRecord).properties as Record<string, PhpRecord>
    expect([list.minItems, list.maxItems, list.initial]).toEqual([1, 20, 1])
    expect(list).not.toHaveProperty("errorMessage")
    expect(properties.autor.errorMessage).toBe("El dato «Autor» del libro supera los 1000 caracteres.")
    expect(properties.anio).not.toHaveProperty("errorMessage")
    expect(properties.enlace).toEqual({ type: "string", title: "Enlace", maxLength: 300, multiline: false })
    expect((definition.rules as PhpRecord[]).map((rule) => rule.code)).toEqual(["libros_sin_titulo", "enlace_obligatoria"])
    expect((definition.rules as PhpRecord[])[0].hint).toBe("Cada libro necesita su título para poder enviar")
    expect(((definition.catalog as PhpRecord).map as PhpRecord).format).toBe("codigo")
  })

  it("designs an untouched table back to the same definition, with plain headers that take the document colour", async () => {
    const { body } = await json(await design(await booksDesign()))
    const styled = JSON.stringify(phpShape(goldenTemplate().definition!.blocks.bibliografia))
    expect(styled).toContain('"backgroundColor":"#C3D4EA","textColor":null,"textAlign":null,"bold":true')
    expect(JSON.stringify(phpShape(body.definition))).toBe(styled.replaceAll('"backgroundColor":"#C3D4EA","textColor":null,"textAlign":null,"bold":true', '"backgroundColor":null,"textColor":null,"textAlign":null,"bold":null'))
  })

  it("says in Spanish what is wrong with a design", async () => {
    const broken = practices()
    const columns = broken.columns as PhpRecord[]
    columns[0].title = ""
    columns[1].options = []
    broken.max = 0
    const invalid = await json(await design(broken))
    expect(invalid.status).toBe(422)
    const errors = invalid.body.errors as Record<string, string[]>
    expect(errors["columns.0.title"]).toEqual(["Escriba el nombre de la columna."])
    expect(errors["columns.1.options"]).toEqual(["Agregue al menos una opción."])
    expect(errors.max).toBeDefined()
    expect(((await json(await design({ ...practices(), min: 5, max: 3, initial: 3 }))).body.errors as Record<string, string[]>).max[0]).toBe(
      "El máximo de filas no puede ser menor que el mínimo.",
    )
    expect(((await json(await design({ ...practices(), kind: "bibliografia", new: true }))).body.errors as Record<string, string[]>).kind[0]).toBe(
      "Ya existe una tabla con ese nombre interno.",
    )
    const books = await booksDesign()
    books.columns = (books.columns as PhpRecord[]).filter((column) => column.key !== "isbn")
    const withoutIsbn = await json(await design(books))
    expect([withoutIsbn.status, (withoutIsbn.body.errors as Record<string, string[]>).definition[0]]).toEqual([
      422,
      "blocks.bibliografia.catalog.map.isbn: debe ser una columna de texto de la lista.",
    ])
  })

  it("keeps new columns and options where they were added", async () => {
    const books = await booksDesign()
    const columns = books.columns as PhpRecord[]
    columns.splice(3, 0, { title: "Edición", type: "choice", options: [{ label: "Primera" }, { value: "segunda", label: "Segunda" }, { label: "Tercera" }], width: null, required: false })
    columns.unshift({ title: "Orden", type: "number", maximum: 99, decimals: 0, width: null, required: false })
    const { status, body } = await json(await design(books))
    expect(status).toBe(200)
    const properties = (((body.definition as PhpRecord).value as PhpRecord).libros as PhpRecord).items as PhpRecord
    expect(Object.keys(properties.properties as PhpRecord)).toEqual(["orden", "autor", "titulo", "anio", "edicion", "ciudad", "editorial", "isbn", "codigo"])
    expect((((properties.properties as PhpRecord).edicion as PhpRecord).oneOf as PhpRecord[]).map((option) => option.const)).toEqual(["primera", "segunda", "tercera"])
  })

  it("lets two choice columns share options but not repeat them in one column", async () => {
    const yesNo = [{ label: "Sí" }, { label: "No" }]
    const shared = { ...practices(), columns: [
      { title: "Asistió", type: "choice", options: yesNo, width: null, required: false },
      { title: "Aprobó", type: "choice", options: yesNo, width: null, required: false },
    ] }
    expect((await design(shared)).status).toBe(200)
    ;(shared.columns[1] as PhpRecord).options = [{ label: "Sí" }, { label: "sí " }]
    const { status, body } = await json(await design(shared))
    const errors = body.errors as Record<string, string[]>
    expect([status, errors["columns.1.options.1.label"]]).toEqual([422, ["La opción está repetida."]])
    expect(errors).not.toHaveProperty("columns.0.options.0.label")
    expect(errors).not.toHaveProperty("columns.0.options.1.label")
  })

  it("does not change tables the designer cannot represent", async () => {
    const { status, body } = await json(await design({ ...practices(), kind: "unidades", new: false }))
    expect([status, (body.errors as Record<string, string[]>).kind[0]]).toEqual([
      422,
      `La tabla «Distribución y planificación de las unidades» no se puede cambiar desde el editor. ${POINTER}`,
    ])
  })

  it("only lets the administrator design tables", async () => {
    asRole("docente")
    const response = await design(practices())
    expect([response.status, await response.text()]).toEqual([403, FORBIDDEN])
  })
})
