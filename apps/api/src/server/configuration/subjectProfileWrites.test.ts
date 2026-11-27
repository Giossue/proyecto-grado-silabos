// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected, purgeRequired } from "../syllabus/inProgressWorkHelpers"
import type { PhpRecord } from "./phpValues"
import { USED_OPTION_REMOVED, USED_RESPONSE_REMOVED } from "./responseConditions"
import type { Db } from "../../prisma/db"
import { careerProfileBlock, showSubjectProfile } from "./subjectProfile"
import { profileTemplates } from "./subjectProfileFields"
import { teacherEditable, type TemplateField } from "./templatePresentation"
import { fieldCarried, plainText } from "./templateRuntime"
import { updateSubjectProfile, type SubjectProfileTx, type SubjectProfileWriteDeps } from "./subjectProfileWrites"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "./testing"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const SUBJECT = "01a1c5bc-7a00-7000-8000-0000000000aa"
const EMPTY_FORBIDDEN = '{"message":""}'

const index = (key: string) => goldenFields.findIndex((field) => field.key === key)
const DESCRIPCION = fieldId(index("descripcion"))
const OBJETIVO = fieldId(index("objetivo_general"))
const RESPUESTAS = fieldId(index("respuestas"))
const BIBLIOGRAFIA_INSTITUCIONAL = fieldId(index("firmas"))
const CONDUCTA = fieldId(index("conducta_etica"))

const text = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] })
const stored = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: value }] }] })

let world: FakeWorld
let templates: FakeTemplateWorld
let subjects: Map<string, string>
let period: { processState: string; convocationState: string | null } | null
let purge: Record<string, string[]> | null
let log: string[]

const periodDb = (): Db => ({ $queryRaw: async () => (period === null ? [] : [period]) }) as unknown as Db

const OPEN_REASON = "Pause el proceso de sílabos de su carrera para editar el proyecto de carrera."
const FINALIZED_REASON = "El proyecto de carrera no se puede editar con el proceso de sílabos finalizado."
const allowedPeriods = [
  null,
  { processState: "abierto", convocationState: null },
  { processState: "abierto", convocationState: "preparacion" },
  { processState: "abierto", convocationState: "pausado" },
  { processState: "pausado", convocationState: "pausado" },
  { processState: "pausado", convocationState: null },
]
const blockedPeriods = [
  { processState: "abierto", convocationState: "abierto", reason: OPEN_REASON },
  { processState: "pausado", convocationState: "abierto", reason: OPEN_REASON },
  { processState: "cerrado", convocationState: "cerrado", reason: FINALIZED_REASON },
  { processState: "cerrado", convocationState: null, reason: FINALIZED_REASON },
  { processState: "abierto", convocationState: "cerrado", reason: FINALIZED_REASON },
]

function deps(): SubjectProfileWriteDeps {
  const tx: SubjectProfileTx = {
    store: fakeTemplateStore(templates),
    lockSubject: async (id) => {
      log.push(`lock:subject:${id}`)
      const careerId = subjects.get(id)
      return careerId === undefined ? null : { careerId }
    },
    careerBlock: (careerId) => careerProfileBlock(periodDb(), careerId),
    deleteValue: async (subjectId, field) => {
      log.push(`delete:${field}`)
      templates.values = templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field))
    },
    saveValue: async (subjectId, field, document) => {
      log.push(`save:${field}`)
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
    careerBlock: (careerId) => careerProfileBlock(periodDb(), careerId),
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

async function put(body: unknown, subject = SUBJECT) {
  const request = new Request(
    apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie, method: "PUT", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify(body) },
  )
  const response = await updateSubjectProfile(request, subject, deps())
  const raw = await response.text()
  return { status: response.status, text: raw, json: raw.startsWith("{") ? (JSON.parse(raw) as Record<string, unknown>) : null }
}

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
  subjects = new Map([[SUBJECT, CAREER]])
  period = { processState: "abierto", convocationState: "pausado" }
  purge = null
  log = []
  asRole("coordinador", CAREER)
})

describe("PUT academic/asignaturas/{asignatura}/ficha", () => {
  it("saves what coordination wrote, drops the fields left empty and answers the profile like GET", async () => {
    templates.values = [{ fieldId: OBJETIVO, subjectId: SUBJECT, value: stored("Objetivo anterior") }]

    const response = await put({ values: { [DESCRIPCION]: text("Texto de descripcion"), [OBJETIVO]: null } })

    expect(response.status).toBe(200)
    expect(log).toEqual(["begin", `keep:false:${CAREER}:${SUBJECT}`, `lock:subject:${SUBJECT}`, `save:${DESCRIPCION}`, `delete:${OBJETIVO}`, "commit"])
    expect(templates.values).toEqual([{ fieldId: DESCRIPCION, subjectId: SUBJECT, value: stored("Texto de descripcion") }])
    const shown = await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { cookie }), SUBJECT, deps())
    expect(response.text).toBe(await shown.text())
  })

  it("the administrator saves any career and a document equal to the template is not stored", async () => {
    asRole("administrador", null)
    const response = await put({ values: { [DESCRIPCION]: { type: "doc", content: [{ type: "paragraph" }] } } })
    expect(response.status).toBe(200)
    expect(log).toContain(`delete:${DESCRIPCION}`)
    expect(templates.values).toEqual([])
  })

  it("only accepts fields of the career project, before opening the transaction", async () => {
    const message = "El proyecto de carrera incluye un campo que ya no existe en la plantilla."
    expect((await put({ values: { [BIBLIOGRAFIA_INSTITUCIONAL]: text("No") } })).json).toEqual({ message, errors: { values: [message] } })
    expect((await put({ values: { "01a1c5bc-7a00-7000-8000-00000000dead": text("No") } })).json?.errors).toEqual({ values: [message] })
    asRole("docente", CAREER)
    expect((await put({ values: { "01a1c5bc-7a00-7000-8000-00000000dead": text("No") } })).status).toBe(422)
    expect(log).toEqual([])
  })

  it("validates values like SaveSubjectProfileRequest", async () => {
    expect((await put({})).json?.errors).toEqual({ values: ["El campo datos del proyecto de carrera debe estar presente."] })
    expect((await put({ values: "x" })).json?.errors).toEqual({ values: ["El campo datos del proyecto de carrera debe ser una lista."] })
    expect((await put({ values: { [DESCRIPCION]: "texto" } })).json?.errors).toEqual({ [`values.${DESCRIPCION}`]: ["El campo dato del proyecto de carrera debe ser una lista."] })
    expect(log).toEqual([])
  })

  it("rejects a value that is not a document, under the attribute of the field", async () => {
    expect((await put({ values: { [DESCRIPCION]: { type: "html" } } })).json?.errors).toEqual({
      [`values.${DESCRIPCION}`]: ["El contenido debe ser un documento de texto, listas o tablas."],
    })
    expect(log.at(-1)).toBe("rollback")
    expect(templates.values).toEqual([])
  })

  it("does not let coordination remove an option that a condition of the template uses", async () => {
    const respuestas = JSON.parse(goldenFields[index("respuestas")].expected.template) as PhpRecord
    const [first, ...rest] = respuestas.content as PhpRecord[]
    const [label, response] = first.content as PhpRecord[]
    const attrs = response.attrs as PhpRecord
    const withoutSi = { ...first, content: [label, { ...response, attrs: { ...attrs, options: [{ const: "no", title: "No" }] } }] }
    const result = await put({ values: { [RESPUESTAS]: { ...respuestas, content: [withoutSi, ...rest] } } })
    expect(result.json?.errors).toEqual({
      [`values.${RESPUESTAS}`]: ["No puede quitar una opción que la plantilla usa para mostrar u ocultar otra parte del sílabo. Déjela o pida a Administración que cambie esa condición."],
    })
    const tooFew = { ...first, content: [label, { ...response, attrs: { ...attrs, options: [] } }] }
    expect((await put({ values: { [RESPUESTAS]: { ...respuestas, content: [tooFew, ...rest] } } })).json?.errors).toEqual({
      [`values.${RESPUESTAS}`]: ["Deje al menos una opción en la respuesta de la plantilla."],
    })
  })

  it("another career and a teacher get abort(403) inside the transaction, which is rolled back", async () => {
    asRole("coordinador", OTHER_CAREER)
    expect(await put({ values: { [DESCRIPCION]: text("x") } })).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    asRole("docente", CAREER)
    expect(await put({ values: [] })).toMatchObject({ status: 403, text: EMPTY_FORBIDDEN })
    expect(log.filter((entry) => entry === "rollback")).toHaveLength(2)
  })

  it("coordination saves the career project before the period opens and while it is paused, never while open or finalized", async () => {
    for (const blocked of blockedPeriods) {
      period = blocked
      const message = blocked.reason
      const response = await put({ values: { [DESCRIPCION]: text("x") } })
      expect(response.status).toBe(422)
      expect(response.json).toEqual({ message, errors: { process: [message] } })
      expect(templates.values).toEqual([])
    }
    for (const allowed of allowedPeriods) {
      period = allowed
      const saved = await put({ values: { [DESCRIPCION]: text("x") } })
      expect(saved.status).toBe(200)
      expect(saved.json?.lock_reason).toBeNull()
    }
  })

  it("the administrator saves the career project while the period is paused", async () => {
    asRole("administrador", null)
    period = { processState: "pausado", convocationState: "abierto" }
    const response = await put({ values: { [DESCRIPCION]: text("Texto del administrador") } })
    expect(response.status).toBe(200)
    expect(response.json?.lock_reason).toBeNull()
    expect(templates.values).toEqual([{ fieldId: DESCRIPCION, subjectId: SUBJECT, value: stored("Texto del administrador") }])
  })

  it("the profile tells coordination why it is read-only and tells the administrator nothing", async () => {
    period = { processState: "pausado", convocationState: "abierto" }
    const show = async () => (await (await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { cookie }), SUBJECT, deps())).json()) as Record<string, unknown>
    expect((await show()).lock_reason).toBe(OPEN_REASON)
    asRole("administrador", null)
    expect((await show()).lock_reason).toBeNull()
  })

  it("asks to confirm before sending syllabi in progress back to draft, and passes confirm_purge", async () => {
    purge = purgeRequired(2)
    const asked = await put({ values: { [DESCRIPCION]: text("x") } })
    expect(asked.status).toBe(422)
    expect(asked.json?.errors).toEqual(purge)
    expect(templates.values).toEqual([])
    const confirmed = await put({ values: { [DESCRIPCION]: text("x") }, confirm_purge: true })
    expect(confirmed.status).toBe(200)
    expect(log).toContain(`keep:true:${CAREER}:${SUBJECT}`)
  })

  it("without a session answers 401 and answers Laravel's model 404 for an unknown subject", async () => {
    const anonymous = await updateSubjectProfile(
      new Request(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { method: "PUT", headers: { "content-type": "application/json" } }), { body: "{}" }),
      SUBJECT,
      deps(),
    )
    expect(anonymous.status).toBe(401)
    const unknown = await put({ values: [] }, "01a1c5bc-7a00-7000-8000-0000000000ff")
    expect([unknown.status, unknown.text]).toEqual([404, '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Subject] 01a1c5bc-7a00-7000-8000-0000000000ff"}'])
    expect((await put({ values: [] }, "no-es-uuid")).status).toBe(404)
  })
})

describe("Coordinación edita el texto de un campo Editable en el editor", () => {
  const respuestas = (): PhpRecord => JSON.parse(goldenFields[index("respuestas")].expected.template) as PhpRecord
  const paragraphs = (document: PhpRecord): PhpRecord[] => document.content as PhpRecord[]
  const edited = (): PhpRecord => {
    const [first, ...rest] = paragraphs(respuestas())
    const [, response] = first.content as PhpRecord[]
    return {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Texto propio de la carrera." }] },
        { ...first, content: [{ type: "text", text: "¿Usa laboratorio? " }, response] },
        ...rest,
      ],
    }
  }
  const storedValue = (): PhpRecord => templates.values.find((value) => value.fieldId === RESPUESTAS)?.value as PhpRecord
  const textOf = (document: unknown): string => plainText(document, goldenTemplate().definition)
  const context = () => ({ template: templates.template!, definition: templates.template!.definition, store: fakeTemplateStore(templates) })
  const ANSWERS: Record<string, unknown> = { una: "si", varias: ["a"], texto: "Lo escribió el docente" }
  const answered = (node: PhpRecord): PhpRecord => {
    const attrs = node.attrs as PhpRecord | undefined
    if (node.type === "response" && attrs && (attrs.kind !== "una" || attrs.id === "tiene")) return { ...node, attrs: { ...attrs, value: ANSWERS[attrs.kind as string] } }
    return Array.isArray(node.content) ? { ...node, content: (node.content as PhpRecord[]).map(answered) } : node
  }

  it("guarda el texto editado de un campo Editable y conserva la respuesta que usa una condición", async () => {
    const response = await put({ values: { [RESPUESTAS]: edited() } })

    expect(response.status).toBe(200)
    expect(textOf(storedValue())).toContain("Texto propio de la carrera.")
    expect(textOf(storedValue())).toContain("¿Usa laboratorio?")
    const responses = JSON.stringify(storedValue())
    expect(responses).toContain('"id":"tiene"')
    expect(responses).toContain('"showIf":{"response":"tiene","options":["si"]}')
  })

  it("no deja quitar una respuesta que usa una condición", async () => {
    const [first, ...rest] = paragraphs(edited())
    const removed = { type: "doc", content: [first, { type: "paragraph", content: [{ type: "text", text: "¿Usa laboratorio?" }] }, ...rest.slice(1)] }

    const response = await put({ values: { [RESPUESTAS]: removed } })

    expect(response.status).toBe(422)
    expect(response.json?.errors).toEqual({ [`values.${RESPUESTAS}`]: [USED_RESPONSE_REMOVED] })
    expect(templates.values).toEqual([])
  })

  it("al editar el texto tampoco deja quitar la opción que usa una condición", async () => {
    const document = edited()
    const second = paragraphs(document)[1]
    const [label, response] = second.content as PhpRecord[]
    const withoutSi = { ...second, content: [label, { ...response, attrs: { ...(response.attrs as PhpRecord), options: [{ const: "no", title: "No" }] } }] }

    const result = await put({ values: { [RESPUESTAS]: { ...document, content: [paragraphs(document)[0], withoutSi, ...paragraphs(document).slice(2)] } } })

    expect(result.status).toBe(422)
    expect(result.json?.errors).toEqual({ [`values.${RESPUESTAS}`]: [USED_OPTION_REMOVED] })
  })

  it("no deja agregar un bloque que la plantilla no trae", async () => {
    const block = { type: "documentBlock", attrs: { kind: "bibliografia", props: [], value: [] } }

    const result = await put({ values: { [RESPUESTAS]: { ...edited(), content: [...paragraphs(edited()), block] } } })

    expect(result.status).toBe(422)
    expect(result.json?.errors).toEqual({ [`values.${RESPUESTAS}`]: ["Los bloques de este campo los define Administración: no los agregue ni los quite."] })
  })

  it("un campo No editable no se guarda desde Coordinación", async () => {
    const message = "El proyecto de carrera incluye un campo que ya no existe en la plantilla."

    const result = await put({ values: { [CONDUCTA]: text("Otro código de ética") } })

    expect(result.status).toBe(422)
    expect(result.json?.errors).toEqual({ values: [message] })
    expect(templates.values).toEqual([])
  })

  it("cuando Administración cambia el texto de la plantilla, la materia conserva su versión editada", async () => {
    await put({ values: { [RESPUESTAS]: edited() } })
    const saved = storedValue()
    const field = templates.template!.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((item) => item.id === RESPUESTAS)!
    const content = field.content as PhpRecord
    const [first, ...rest] = content.content as PhpRecord[]
    field.content = { ...content, content: [{ ...first, content: [{ type: "text", text: "Pregunta nueva de Administración: " }, ...(first.content as PhpRecord[]).slice(1)] }, ...rest] }

    expect(storedValue()).toEqual(saved)
    const setup = (await profileTemplates(context(), SUBJECT))[RESPUESTAS]
    expect(textOf(setup)).toContain("Texto propio de la carrera.")
    expect(textOf(setup)).not.toContain("Pregunta nueva de Administración")
    const shown = (await (await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { cookie }), SUBJECT, deps())).json()) as { values: Record<string, unknown> }
    expect(textOf(shown.values[RESPUESTAS])).toContain("Texto propio de la carrera.")
  })

  it("el docente recibe el texto editado fijo y su espacio abierto", async () => {
    await put({ values: { [RESPUESTAS]: edited() } })

    const setups = await profileTemplates(context(), SUBJECT)

    expect(textOf(setups[RESPUESTAS])).toContain("Texto propio de la carrera.")
    expect(teacherEditable({ id: RESPUESTAS, responsible: "carrera" } as TemplateField, setups)).toBe(true)
    const definition = goldenTemplate().definition
    expect(fieldCarried(setups[RESPUESTAS], answered(setups[RESPUESTAS]), definition)).toEqual(answered(setups[RESPUESTAS]))
  })

  it("lo que respondió el docente sigue cuando Coordinación cambia el texto fuera de los espacios", async () => {
    await put({ values: { [RESPUESTAS]: respuestas() } })
    const before = (await profileTemplates(context(), SUBJECT))[RESPUESTAS] ?? respuestas()
    const teacher = answered(before)
    await put({ values: { [RESPUESTAS]: edited() } })
    const after = (await profileTemplates(context(), SUBJECT))[RESPUESTAS]

    const carried = fieldCarried(after, teacher, goldenTemplate().definition) as PhpRecord

    expect(textOf(carried)).toContain("Texto propio de la carrera.")
    expect(textOf(carried)).toContain("Lo escribió el docente")
    expect(JSON.stringify(carried)).toContain('"value":"si"')
    expect(JSON.stringify(carried)).toContain('"value":["a"]')
  })
  const field = () => templates.template!.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((item) => item.id === RESPUESTAS)!
  const adminChanges = (change: (content: PhpRecord[]) => PhpRecord[]) => {
    const current = field().content as PhpRecord
    field().content = { ...current, content: change(structuredClone(current.content as PhpRecord[])) }
  }
  const slotted = (): PhpRecord => {
    const document = respuestas()
    const nodes = paragraphs(document)
    const choice = (nodes[3].content as PhpRecord[])[0]
    choice.attrs = { ...(choice.attrs as PhpRecord), options: [{ const: "o1", title: "Aula" }] }
    const cell = ((nodes[4].content as PhpRecord[])[1].content as PhpRecord[])[0]
    ;(cell.content as PhpRecord[])[0] = { type: "paragraph", content: [{ type: "text", text: "Escrito en la celda" }] }
    return document
  }
  const setupJson = async (): Promise<string> => JSON.stringify((await profileTemplates(context(), SUBJECT))[RESPUESTAS] ?? null)

  it("una materia que solo llenó espacios sigue el texto nuevo de la plantilla y conserva lo que llenó", async () => {
    expect((await put({ values: { [RESPUESTAS]: slotted() } })).status).toBe(200)
    expect(JSON.stringify(storedValue())).not.toContain('"edited"')

    adminChanges(([first, ...rest]) => [{ ...first, content: [{ type: "text", text: "Pregunta NUEVA: " }, ...(first.content as PhpRecord[]).slice(1)] }, ...rest])

    const setup = await setupJson()
    expect(setup).toContain("Pregunta NUEVA: ")
    expect(setup).not.toContain('"text":"Pregunta: "')
    expect(setup).toContain("Escrito en la celda")
    expect(setup).toContain('"title":"Aula"')
  })

  it("los cambios de Administración en las respuestas llegan a una materia que solo llenó espacios", async () => {
    await put({ values: { [RESPUESTAS]: slotted() } })
    const isText = (node: PhpRecord) => JSON.stringify(node).includes('"kind":"texto"')

    adminChanges((content) => [...content, { type: "paragraph", content: [{ type: "response", attrs: { kind: "varias", options: [{ const: "z", title: "Nueva opción" }] } }] }])
    expect(await setupJson()).toContain("Nueva opción")

    adminChanges((content) => content.map((node) => (isText(node) ? { ...node, content: [{ ...(node.content as PhpRecord[])[0], attrs: { ...((node.content as PhpRecord[])[0].attrs as PhpRecord), required: true } }] } : node)))
    const required = JSON.parse(await setupJson()) as PhpRecord
    const texto = JSON.stringify(paragraphs(required).find(isText))
    expect(texto).not.toContain('"required":false')

    adminChanges((content) => content.filter((node) => !isText(node)))
    const removed = await setupJson()
    expect(removed).not.toContain('"kind":"texto"')
    expect(removed).toContain("Escrito en la celda")
  })

  it("la copia editada queda marcada en el servidor, conserva su texto y no muestra la marca al docente ni a Coordinación", async () => {
    await put({ values: { [RESPUESTAS]: edited() } })
    expect((storedValue().attrs as PhpRecord | undefined)?.edited).toBe(true)

    adminChanges(([first, ...rest]) => [{ ...first, content: [{ type: "text", text: "Pregunta NUEVA: " }, ...(first.content as PhpRecord[]).slice(1)] }, ...rest])

    const setup = await setupJson()
    expect(setup).toContain("Texto propio de la carrera.")
    expect(setup).not.toContain("Pregunta NUEVA")
    expect(setup).not.toContain('"edited"')
    const shown = await (await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${SUBJECT}/ficha`, { cookie }), SUBJECT, deps())).text()
    expect(shown).toContain("Texto propio de la carrera.")
    expect(shown).not.toContain('"edited"')
  })

  it("el navegador no puede marcar una copia como editada", async () => {
    await put({ values: { [RESPUESTAS]: { ...slotted(), attrs: { edited: true } } } })
    expect(JSON.stringify(storedValue())).not.toContain('"edited"')

    adminChanges(([first, ...rest]) => [{ ...first, content: [{ type: "text", text: "Pregunta NUEVA: " }, ...(first.content as PhpRecord[]).slice(1)] }, ...rest])

    expect(await setupJson()).toContain("Pregunta NUEVA: ")
  })

  it("llenar el espacio que se agrega a un campo con texto y sin espacios es llenar un espacio, no editar", async () => {
    const SIN_ESPACIOS = fieldId(index("sin_espacios"))
    const target = templates.template!.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((item) => item.id === SIN_ESPACIOS)!
    target.responsible = "carrera"
    const filled = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Solo texto" }] }, { type: "paragraph", content: [{ type: "text", text: "Lo llenó la carrera" }] }] }

    expect((await put({ values: { [SIN_ESPACIOS]: filled } })).status).toBe(200)
    const saved = templates.values.find((value) => value.fieldId === SIN_ESPACIOS)!.value as PhpRecord
    expect(JSON.stringify(saved)).toContain("Lo llenó la carrera")
    expect(saved.attrs).toBeUndefined()
  })
  const TABLES_FIXED = "Las tablas de este campo las define Administración: escriba dentro de sus celdas, sin quitar ni agregar filas o columnas."
  const withTable = (change: (table: PhpRecord) => PhpRecord | null): PhpRecord => {
    const document = edited()
    return { ...document, content: paragraphs(document).flatMap((node) => (node.type === "table" ? [change(structuredClone(node))].filter((item): item is PhpRecord => item !== null) : [node])) }
  }
  const rowsOf = (table: PhpRecord): PhpRecord[] => table.content as PhpRecord[]
  const cellsOf = (row: PhpRecord): PhpRecord[] => row.content as PhpRecord[]

  it.each([
    ["quitar la tabla", () => withTable(() => null)],
    ["quitar la única fila", () => withTable((table) => ({ ...table, content: rowsOf(table).slice(0, 1) }))],
    ["quitar una columna", () => withTable((table) => ({ ...table, content: rowsOf(table).map((row) => ({ ...row, content: cellsOf(row).slice(0, 1) })) }))],
    ["combinar celdas", () => withTable((table) => {
      const [header, ...rest] = rowsOf(table)
      const [first] = cellsOf(header)
      return { ...table, content: [{ ...header, content: [{ ...first, attrs: { ...(first.attrs as PhpRecord), colspan: 2 } }] }, ...rest] }
    })],
  ])("al editar el texto no deja %s de la plantilla", async (_, value) => {
    const result = await put({ values: { [RESPUESTAS]: value() } })

    expect(result.status).toBe(422)
    expect(result.json?.errors).toEqual({ [`values.${RESPUESTAS}`]: [TABLES_FIXED] })
    expect(templates.values).toEqual([])
  })

  it("al editar el texto deja escribir dentro de las celdas de la tabla", async () => {
    const value = withTable((table) => {
      const [header, row] = rowsOf(table)
      const [first, second] = cellsOf(row)
      return { ...table, content: [header, { ...row, content: [{ ...first, content: [{ type: "paragraph", content: [{ type: "text", text: "Dentro de la celda" }] }] }, second] }] }
    })

    const result = await put({ values: { [RESPUESTAS]: value } })

    expect(result.status).toBe(200)
    expect(JSON.stringify(storedValue())).toContain("Dentro de la celda")
  })
})
