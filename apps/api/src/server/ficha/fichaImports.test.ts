// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import JSZip from "jszip"
import golden from "../http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { freeTextFromText } from "../configuration/freeText"
import type { PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { teacherEditable, templateFields } from "../configuration/templatePresentation"
import { keepOwnOptions, normalizeFieldDocument, plainText, responseTemplate, TemplateValidationError } from "../configuration/templateRuntime"
import { fakeTemplateStore, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import { createRateLimiter } from "../http/throttle"
import { GenerationRejected } from "../syllabus/inProgressWorkHelpers"
import { applyFichaImport, fichaTemplate, previewFichaImport, type FichaApplyTx, type FichaImportDeps } from "./fichaImports"

const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const SUBJECTS = [
  { id: "01a1c5bc-7a00-7000-8000-0000000000a1", code: "SW-101", name: "Álgebra lineal", cycle: 1 },
  { id: "01a1c5bc-7a00-7000-8000-0000000000a2", code: "SW-102", name: "Programación", cycle: 1 },
]
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const EMPTY_FORBIDDEN = '{"message":""}'
const BASE = ["Aula", "Laboratorio"]
const OWN = ["Aula", "Taller", "Campo"]

let world: FakeWorld
let templates: FakeTemplateWorld
let locked: boolean
let purge: Record<string, string[]> | null
let log: string[]

function signIn(role: string): void {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: golden.roleId })), lastActivity: NOW - 10 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role, careerId: CAREER, careerLabel: "Software" })],
  }
}

function field(key: string) {
  const found = templateFields(templates.template!).find((candidate) => candidate.key === key)
  if (!found) throw new Error(`missing ${key}`)
  return found
}

function stored(subjectId: string, key: string): PhpRecord | null {
  const id = field(key).id
  return (templates.values.find((value) => value.subjectId === subjectId && value.fieldId === id)?.value as PhpRecord | undefined) ?? null
}

function reader() {
  return {
    store: fakeTemplateStore(templates),
    activeCareer: async (id: string) => (id === CAREER ? { id, name: "Software" } : null),
    subjects: async (id: string) => (id === CAREER ? SUBJECTS : []),
  }
}

function deps(limiter = createRateLimiter()): FichaImportDeps {
  const tx: FichaApplyTx = {
    ...reader(),
    lockCareer: async (id) => void log.push(`lock:${id}`),
    careerLocked: async () => locked,
    storedValue: async (subjectId, fieldId) => templates.values.find((value) => value.subjectId === subjectId && value.fieldId === fieldId)?.value ?? null,
    saveValue: async (subjectId, fieldId, document) => {
      templates.values = [...templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === fieldId)), { fieldId, subjectId, value: document }]
    },
    keepContent: async (confirmed, careerId, subjectIds, change) => {
      log.push(`keep:${confirmed}:${careerId}:${subjectIds.join(",")}`)
      if (purge !== null && !confirmed) throw new GenerationRejected(purge)
      return change()
    },
  }
  return {
    bridge: fakeDeps(world),
    limiter,
    now: () => NOW,
    store: {
      ...reader(),
      careerActive: async (id) => id === CAREER,
      careerLocked: async () => locked,
      currentValues: async (subjectIds, fieldIds) =>
        templates.values
          .filter((value) => subjectIds.includes(value.subjectId ?? "") && fieldIds.includes(value.fieldId))
          .map((value) => ({ subjectId: value.subjectId ?? "", fieldId: value.fieldId, value: value.value })),
    },
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

function get(url: string): Request {
  return new Request(`http://localhost:3000${url}`, { headers: { accept: "application/json", referer: "http://localhost:3000/", cookie } })
}

function post(url: string, file: Buffer | null, fields: [string, string][] = []): Request {
  const form = new FormData()
  if (file !== null) form.append("file", new File([new Uint8Array(file)], "proyecto.xlsx"))
  for (const [name, value] of fields) form.append(name, value)
  return new Request(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { accept: "application/json", referer: "http://localhost:3000/", cookie, "x-csrf-token": golden.csrfToken },
    body: form,
  })
}

function inline(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;")
  return `t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`
}

async function workbook(cells: Record<string, Record<string, string>>): Promise<Buffer> {
  const response = await fichaTemplate(get("/api/v1/coordination/ficha-imports/template"), deps())
  expect(response.status).toBe(200)
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
  const strings = [...((await zip.file("xl/sharedStrings.xml")!.async("string")).matchAll(/<si><t[^>]*>([^<]*)<\/t><\/si>/g))].map((match) => match[1])
  for (const name of Object.keys(zip.files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))) {
    let xml = await zip.file(name)!.async("string")
    const id = /<c r="A1" t="s"><v>(\d+)<\/v><\/c>/.exec(xml)?.[1]
    const key = id === undefined ? undefined : templateFields(templates.template!).find((candidate) => candidate.id === strings[Number(id)])?.key
    for (const [reference, text] of Object.entries(key === undefined ? {} : (cells[key] ?? {}))) {
      xml = xml.replace(new RegExp(`<c r="${reference}" s="(\\d+)"/>`), (_, style: string) => `<c r="${reference}" s="${style}" ${inline(text)}`)
    }
    zip.file(name, xml)
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}

async function preview(file: Buffer): Promise<PhpRecord> {
  const response = await previewFichaImport(post("/api/v1/coordination/ficha-imports/spreadsheet", file), deps())
  expect(response.status).toBe(200)
  return ((await response.json()) as { preview: PhpRecord }).preview
}

function apply(file: Buffer, detail: PhpRecord, extra: [string, string][] = [], subjects = [SUBJECTS[0].id]): Promise<Response> {
  return applyFichaImport(
    post("/api/v1/coordination/ficha-imports/apply", file, [
      ["fingerprint", String(detail.fingerprint)],
      ["file_hash", String(detail.file_hash)],
      ...subjects.map((id): [string, string] => ["subjects[]", id]),
      ...extra,
    ]),
    deps(),
  )
}

function entryOf(detail: PhpRecord, subjectId: string): PhpRecord {
  return (detail.subjects as PhpRecord[]).find((entry) => entry.subject_id === subjectId) as PhpRecord
}

const cell = (type: string, text = ""): PhpRecord => ({
  type,
  attrs: { colspan: 1, rowspan: 1 },
  content: [text === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text }] }],
})

function response(options: string[]): PhpRecord {
  return { type: "response", attrs: { kind: "una", options: options.map((title, index) => ({ const: `o${index + 1}`, title })) } }
}

function withResponseField(): void {
  const metodologia = field("metodologia")
  metodologia.content = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Estrategias de la asignatura" }] },
      { type: "paragraph", content: [response(BASE)] },
      { type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", "Técnica"), cell("tableHeader", "Horas")] }, { type: "tableRow", content: [cell("tableCell"), cell("tableCell")] }] },
    ],
  }
}

function ownSetup(options: string[]): PhpRecord {
  const definition = templates.template!.definition!
  const document = responseTemplate(normalizeFieldDocument(field("metodologia").content, definition))
  const content = [...(document.content as PhpRecord[])]
  content[1] = { type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: options.map((title, index) => ({ const: `o${index + 1}`, title })), value: null, customOptions: true } }] }
  return { ...document, content }
}

beforeEach(() => {
  signIn("coordinador")
  templates = { template: goldenTemplate(), values: [] }
  locked = false
  purge = null
  log = []
})

describe("FichaImportTest", () => {
  it("the workbook previews a profile and applies only the chosen subjects", async () => {
    const file = await workbook({ descripcion: { D4: "Ficha completada en Excel" }, objetivos_especificos: { D4: "- Analizar.\n- Aplicar." } })
    const detail = await preview(file)
    const entry = entryOf(detail, SUBJECTS[0].id)
    const values = entry.values as PhpRecord
    expect(entry.state).toBe("lista")
    expect(values.descripcion).toBe("Ficha completada en Excel")
    expect(values.objetivos_especificos).toEqual(["Analizar.", "Aplicar."])
    expect(values).not.toHaveProperty("objetivo_general")
    const total = (detail.fields as unknown[]).length
    expect(entry.coverage).toEqual({ found: 2, total })
    expect(entry.missing as unknown[]).toHaveLength(total - 2)
    expect(entryOf(detail, SUBJECTS[1].id).state).toBe("sin_evidencia")

    const applied = await apply(file, detail)
    expect(applied.status).toBe(200)
    expect(await applied.text()).toBe('{"message":"Proyecto de carrera aplicado.","applied":1}')
    expect(JSON.stringify(stored(SUBJECTS[0].id, "descripcion"))).toContain("Ficha completada en Excel")
    expect(stored(SUBJECTS[1].id, "descripcion")).toBeNull()
    expect(log).toEqual([`keep:false:${CAREER}:${SUBJECTS[0].id}`, `lock:${CAREER}`])
  })

  it("the workbook writes a career field that the teacher used to fill", async () => {
    const file = await workbook({ tecnicas_ensenanza: { D4: "Técnicas acordadas por la carrera" } })
    const detail = await preview(file)
    expect((await apply(file, detail)).status).toBe(200)
    const context = { template: templates.template!, definition: templates.template!.definition!, store: fakeTemplateStore(templates) }
    const profile = await profileTemplates(context, SUBJECTS[0].id)
    const tecnicas = field("tecnicas_ensenanza")
    expect(plainText(profile[tecnicas.id], context.definition)).toBe("Técnicas acordadas por la carrera")
    expect(teacherEditable(tecnicas, profile)).toBe(false)
  })

  it("the template download matches the current fields and subjects", async () => {
    const response = await fichaTemplate(get("/api/v1/coordination/ficha-imports/template"), deps())
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=proyecto-carrera.xlsx")
    expect(response.headers.get("cache-control")).toBe("no-store, private")
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
    const names = [...(await zip.file("xl/workbook.xml")!.async("string")).matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1])
    expect(names.slice(0, 2)).toEqual(["Indicaciones", "_estructura"])
    const fields = names.slice(2)
    expect(fields[0]).toBe("01 Descripción")
    expect(fields.every((name, index) => name.startsWith(`${String(index + 1).padStart(2, "0")} `))).toBe(true)
    for (let index = 3; index <= names.length; index++) {
      expect(await zip.file(`xl/worksheets/sheet${index}.xml`)!.async("string")).toContain('<sheetProtection password="')
    }
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain('lockStructure="true"')
  })

  it("the proposal shows the current profile and applies only the chosen fields", async () => {
    const description = field("descripcion")
    templates.values.push({ fieldId: description.id, subjectId: SUBJECTS[0].id, value: freeTextFromText("Descripción que ya estaba") })
    const file = await workbook({ descripcion: { D4: "Ficha completada en Excel" }, objetivos_especificos: { D4: "- Analizar.\n- Aplicar." } })
    const detail = await preview(file)
    const entry = entryOf(detail, SUBJECTS[0].id)
    expect(entry.replaces).toBe(true)
    expect((entry.current as PhpRecord).descripcion).toBe("Descripción que ya estaba")
    expect(entryOf(detail, SUBJECTS[1].id).current).toEqual({})

    expect((await apply(file, detail, [[`fields[${SUBJECTS[0].id}][]`, "objetivos_especificos"]])).status).toBe(200)
    expect(JSON.stringify(stored(SUBJECTS[0].id, "descripcion"))).toContain("Descripción que ya estaba")
    expect(stored(SUBJECTS[0].id, "objetivos_especificos")).not.toBeNull()
  })

  it("a finalized convocation warns before applying the workbook and keeps its syllabi", async () => {
    purge = { purge_mode: ["convocatoria_finalizada"] }
    const file = await workbook({ descripcion: { D4: "Ficha completada en Excel" } })
    const detail = await preview(file)
    const warned = await apply(file, detail)
    expect(warned.status).toBe(422)
    expect(((await warned.json()) as { errors: Record<string, string[]> }).errors.purge_mode[0]).toBe("convocatoria_finalizada")
    expect(stored(SUBJECTS[0].id, "descripcion")).toBeNull()

    expect((await apply(file, detail, [["confirm_purge", "1"]])).status).toBe(200)
    expect(stored(SUBJECTS[0].id, "descripcion")).not.toBeNull()
  })

  it("only the career coordinator can use the workbook", async () => {
    const file = await workbook({ descripcion: { D4: "Texto" } })
    signIn("docente")
    const response = await fichaTemplate(get("/api/v1/coordination/ficha-imports/template"), deps())
    expect(response.status).toBe(403)
    expect(await response.text()).toBe(EMPTY_FORBIDDEN)
    const previewed = await previewFichaImport(post("/api/v1/coordination/ficha-imports/spreadsheet", Buffer.from("x")), deps())
    expect(previewed.status).toBe(422)
    const forbidden = await previewFichaImport(post("/api/v1/coordination/ficha-imports/spreadsheet", file), deps())
    expect(forbidden.status).toBe(403)
    expect(await forbidden.text()).toBe(EMPTY_FORBIDDEN)
  })

  it("table rows follow the template and are applied as a table", async () => {
    const file = await workbook({ contribucion_perfil: { D4: "Resuelve sistemas lineales", E4: "X", H4: "Resuelve problemas matemáticos" } })
    const detail = await preview(file)
    const value = (entryOf(detail, SUBJECTS[0].id).values as PhpRecord).contribucion_perfil as { columns: string[]; rows: string[][] }
    expect(value.columns).toEqual([
      "Resultados de aprendizaje de la asignatura",
      "Nivel de contribución (resultados de aprendizaje del perfil de egreso de la carrera) / ALTA (A)",
      "Nivel de contribución (resultados de aprendizaje del perfil de egreso de la carrera) / MEDIA (M)",
      "Nivel de contribución (resultados de aprendizaje del perfil de egreso de la carrera) / BAJA (B)",
      "Resultados de aprendizaje que aportan al perfil de egreso de la carrera",
    ])
    expect(value.rows).toEqual([["Resuelve sistemas lineales", "X", "", "", "Resuelve problemas matemáticos"]])
    expect((await apply(file, detail)).status).toBe(200)
    const document = stored(SUBJECTS[0].id, "contribucion_perfil")!
    expect((document.content as PhpRecord[])[0].type).toBe("table")
    const text = plainText(document, templates.template!.definition!)
    expect(text).toContain("Resuelve sistemas lineales")
    expect(text).toContain("ALTA (A)")
  })

  it("rejects the request before reading the workbook and explains each field", async () => {
    const missing = await previewFichaImport(post("/api/v1/coordination/ficha-imports/spreadsheet", null), deps())
    expect(await missing.json()).toEqual({ message: "Elija el Excel que completó.", errors: { file: ["Elija el Excel que completó."] } })
    const notExcel = await previewFichaImport(post("/api/v1/coordination/ficha-imports/spreadsheet", Buffer.from("hola")), deps())
    expect(await notExcel.json()).toEqual({
      message: "Use la plantilla Excel (.xlsx) descargada desde el sitio.",
      errors: { file: ["Use la plantilla Excel (.xlsx) descargada desde el sitio."] },
    })
    const file = await workbook({ descripcion: { D4: "Texto" } })
    const invalid = await applyFichaImport(post("/api/v1/coordination/ficha-imports/apply", file, [["fingerprint", "abc"], ["subjects[]", "x"], ["subjects[]", "x"]]), deps())
    expect(invalid.status).toBe(422)
    expect(((await invalid.json()) as { errors: unknown }).errors).toEqual({
      fingerprint: ["El campo estructura de la plantilla debe tener 64 caracteres.", "El formato del campo estructura de la plantilla no es válido."],
      file_hash: ["El campo archivo revisado es obligatorio."],
      "subjects.0": ["El campo materia debe ser un UUID válido.", "El campo materia tiene un valor duplicado."],
      "subjects.1": ["El campo materia debe ser un UUID válido.", "El campo materia tiene un valor duplicado."],
    })
  })

  it("stops on an open convocation, a stale preview and a foreign selection", async () => {
    const file = await workbook({ descripcion: { D4: "Texto" } })
    const detail = await preview(file)
    locked = true
    expect(await (await previewFichaImport(post("/api/v1/coordination/ficha-imports/spreadsheet", file), deps())).json()).toEqual({
      message: "Convocatoria activa",
      errors: { process: ["Convocatoria activa"] },
    })
    locked = false
    const stale = await apply(file, { ...detail, file_hash: "0".repeat(64) })
    expect(((await stale.json()) as { errors: unknown }).errors).toEqual({
      file: ["El Excel o la estructura cambió desde la vista previa. Vuelva a revisar el archivo antes de aplicar."],
    })
    const foreign = await apply(file, detail, [], [SUBJECTS[1].id])
    expect(((await foreign.json()) as { errors: unknown }).errors).toEqual({ subjects: ["Seleccione únicamente materias de su carrera con contenido en el Excel."] })
    const wrongField = await apply(file, detail, [[`fields[${SUBJECTS[0].id}][]`, "objetivo_general"]])
    expect(((await wrongField.json()) as { errors: unknown }).errors).toEqual({ fields: ["Seleccione al menos un campo con contenido del Excel en cada materia."] })
    const strayField = await apply(file, detail, [[`fields[${SUBJECTS[1].id}][]`, "descripcion"]])
    expect(((await strayField.json()) as { errors: unknown }).errors).toEqual({ fields: ["Los campos deben pertenecer a las materias seleccionadas."] })
    expect(templates.values).toEqual([])
  })
})

describe("FichaImportOwnOptionsTest", () => {
  beforeEach(() => withResponseField())

  async function importTechnique(subjectId: string, technique: string): Promise<Response> {
    const index = SUBJECTS.findIndex((subject) => subject.id === subjectId)
    const row = 4 + index * 40
    const file = await workbook({ metodologia: { [`D${row}`]: technique, [`E${row}`]: "4" } })
    const detail = await preview(file)
    return apply(file, detail, [[`fields[${subjectId}][]`, "metodologia"]], [subjectId])
  }

  it("the import keeps the own options and the marker of the subject", async () => {
    templates.values.push({ fieldId: field("metodologia").id, subjectId: SUBJECTS[0].id, value: ownSetup(OWN) })
    expect((await importTechnique(SUBJECTS[0].id, "Exposición")).status).toBe(200)
    const document = stored(SUBJECTS[0].id, "metodologia")!
    const attrs = (((document.content as PhpRecord[])[1].content as PhpRecord[])[0].attrs as PhpRecord)
    expect((attrs.options as PhpRecord[]).map((option) => option.title)).toEqual(OWN)
    expect(attrs.customOptions).toBe(true)
    expect(plainText((document.content as PhpRecord[])[2], templates.template!.definition!)).toContain("Exposición")
  })

  it("the import of a subject without own options is unchanged", async () => {
    expect((await importTechnique(SUBJECTS[1].id, "Exposición")).status).toBe(200)
    const document = stored(SUBJECTS[1].id, "metodologia")!
    const attrs = (((document.content as PhpRecord[])[1].content as PhpRecord[])[0].attrs as PhpRecord)
    expect(attrs).toEqual({ kind: "una", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Laboratorio" }], value: null })
    expect(plainText(document, templates.template!.definition!)).toBe("Estrategias de la asignatura\n\nTécnica | Horas\nExposición | 4")
  })

  it("an imported choice outside the options of the subject rejects the row", () => {
    const definition = templates.template!.definition!
    const own = ownSetup(["Aula"])
    const content = field("metodologia").content
    const imported = responseTemplate(normalizeFieldDocument(content, definition))
    const choose = (value: string): PhpRecord => {
      const next = structuredClone(imported)
      ;(((next.content as PhpRecord[])[1].content as PhpRecord[])[0].attrs as PhpRecord).value = value
      return next
    }
    try {
      keepOwnOptions(content, choose("o2"), own, definition, "file")
      throw new Error("La importación debía rechazar la opción.")
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateValidationError)
      expect((error as TemplateValidationError).errors).toEqual({ file: ["Elija solo entre las opciones de la respuesta."] })
    }
    const kept = keepOwnOptions(content, choose("o1"), own, definition, "file")
    const attrs = (((kept.content as PhpRecord[])[1].content as PhpRecord[])[0].attrs as PhpRecord)
    expect(attrs.value).toBe("o1")
    expect((attrs.options as PhpRecord[]).map((option) => option.title)).toEqual(["Aula"])
    expect(attrs.customOptions).toBe(true)
  })
})
