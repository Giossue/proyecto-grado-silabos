// @vitest-environment node
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import JSZip from "jszip"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { createRateLimiter } from "../http/throttle"
import { createStorageWriter, type StorageWriter } from "../http/storageWriter"
import { failSupportDocumentView, prepareSupportDocumentView, type SupportDocumentViewDeps, type SupportDocumentViewStore } from "./supportDocumentView"
import {
  destroySupportDocument,
  storeSupportDocument,
  viewSupportDocument,
  type StoredObjectInput,
  type SupportDocumentInput,
  type SupportDocumentWriteDeps,
  type SupportDocumentWriteStore,
} from "./supportDocumentWrites"

const PDF = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c6aa"
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const fixture = (name: string) => readFileSync(path.join(__dirname, "..", "files", "__fixtures__", "files", name))

let world: FakeWorld
let root: string
let storage: StorageWriter
let documents: Map<string, SupportDocumentInput>
let objects: Map<string, StoredObjectInput>
let dispatched: string[]
let ids: number
let converted: { filename: string; content: Buffer }[]
let converterEnabled: boolean

const store = (): SupportDocumentWriteStore => ({
  careerActive: async (id) => [CAREER, OTHER_CAREER].includes(id),
  documentCareer: async (id) => documents.get(id)?.careerId ?? null,
  async readable(id) {
    const document = documents.get(id)
    if (!document) return null
    const preview = document.previewId === null ? null : (objects.get(document.previewId) ?? null)
    return { id, careerId: document.careerId, title: document.title, view: document.view, preview: preview && { disk: preview.disk, path: preview.path } }
  },
  async transaction(work) {
    const after: (() => unknown)[] = []
    const staged = { documents: new Map(documents), objects: new Map(objects) }
    const result = await work(
      {
        insertObject: async (row) => void staged.objects.set(row.id, row),
        insertDocument: async (row) => void staged.documents.set(row.id, row),
        async lockDocument(id) {
          const document = staged.documents.get(id)
          return document ? { id, careerId: document.careerId, objectId: document.objectId, previewId: document.previewId } : null
        },
        objects: async (list) => list.flatMap((id) => (staged.objects.has(id) ? [{ disk: staged.objects.get(id)!.disk, path: staged.objects.get(id)!.path }] : [])),
        deleteDocument: async (id) => void staged.documents.delete(id),
        deleteObjects: async (list) => list.forEach((id) => staged.objects.delete(id)),
      },
      (callback) => void after.push(callback),
    )
    documents = staged.documents
    objects = staged.objects
    for (const callback of after) await callback()
    return result
  },
})

const deps = (): SupportDocumentWriteDeps => ({
  bridge: fakeDeps(world),
  store: store(),
  storage,
  limiter: createRateLimiter(),
  now: () => NOW,
  newDocumentId: () => `0000000${++ids}-81b0-45fa-b5a4-70f744af0244`,
  newObjectId: () => `01a1c5bc-0000-7000-8000-00000000000${ids}`,
  dispatchView: async (id) => void dispatched.push(id),
  maxPostSize: 32 * 1024 * 1024,
})

const viewStore = (): SupportDocumentViewStore => ({
  async pending(id) {
    const document = documents.get(id)
    if (!document || document.view !== "pendiente") return null
    const original = objects.get(document.objectId) as StoredObjectInput
    return { disk: original.disk, path: original.path, name: original.name, ownerId: original.ownerId }
  },
  async markWithoutView(id) {
    const document = documents.get(id)
    if (document?.view === "pendiente") documents.set(id, { ...document, view: "sin_vista" })
  },
  async transaction(work) {
    return work({
      lockPending: async (id) => documents.get(id)?.view === "pendiente",
      insertObject: async (row) => void objects.set(row.id, row),
      markReady: async (id, previewId) => void documents.set(id, { ...(documents.get(id) as SupportDocumentInput), previewId, view: "lista" }),
    })
  },
})

const viewDeps = (): SupportDocumentViewDeps => ({
  store: viewStore(),
  storage,
  converterEnabled: () => converterEnabled,
  convertFile: async (content, filename) => {
    converted.push({ content, filename })
    return Buffer.from(PDF)
  },
  newObjectId: () => "01a1c5bc-0000-7000-8000-0000000000ff",
  now: () => NOW,
  warn: () => undefined,
})

function asRole(role: string, careerId: string | null = CAREER) {
  world.assignments = [makeAssignment({ role, careerId })]
}

function request(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    body,
    headers: { accept: "application/json", referer: "http://localhost:3000/coordinacion", cookie, "x-csrf-token": golden.csrfToken, ...headers },
  })
}

function upload(title: string | null, file: { name: string; content: Buffer | string } | null, extra: Record<string, string> = {}): Request {
  const form = new FormData()
  if (title !== null) form.append("title", title)
  if (file !== null) form.append("file", new File([typeof file.content === "string" ? file.content : new Uint8Array(file.content)], file.name))
  for (const [name, value] of Object.entries(extra)) form.append(name, value)
  return request("POST", "/api/v1/coordination/support-documents", form)
}

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = { sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]), users: [makeUser()], assignments: [] }
  root = mkdtempSync(path.join(tmpdir(), "silabos-apoyo-"))
  storage = createStorageWriter(root)
  documents = new Map()
  objects = new Map()
  dispatched = []
  ids = 0
  converted = []
  converterEnabled = true
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("POST /api/v1/coordination/support-documents", () => {
  it("lets the coordinator upload a PDF that teachers of the career view", async () => {
    asRole("coordinador")
    const response = await read(await storeSupportDocument(upload("  Proyecto   de carrera ", { name: "proyecto.pdf", content: PDF }), deps()))
    const id = "00000001-81b0-45fa-b5a4-70f744af0244"
    expect(response).toEqual({
      status: 201,
      text: `{"message":"Documento subido.","document":{"id":"${id}","title":"Proyecto de carrera","size":${PDF.length},"view":"lista","uploaded_at":"2027-01-15T08:00:00+00:00"}}`,
    })
    const stored = `documentos-apoyo/${CAREER}/${id}/original.pdf`
    expect(readFileSync(storage.path("private", stored), "latin1")).toBe(PDF)
    expect(statSync(storage.path("private", stored)).mode & 0o777).toBe(0o600)
    expect(statSync(path.dirname(storage.path("private", stored))).mode & 0o777).toBe(0o700)
    expect([...objects.values()]).toEqual([
      {
        id: "01a1c5bc-0000-7000-8000-000000000001",
        disk: "private",
        path: stored,
        name: "proyecto.pdf",
        mime: "application/pdf",
        size: PDF.length,
        sha256: createHash("sha256").update(PDF).digest("hex"),
        classification: "documento_apoyo",
        ownerId: golden.userId,
        storedAt: NOW,
      },
    ])
    expect(documents.get(id)).toMatchObject({ careerId: CAREER, title: "Proyecto de carrera", previewId: "01a1c5bc-0000-7000-8000-000000000001", view: "lista", uploadedBy: golden.userId })
    expect(dispatched).toEqual([])

    asRole("docente")
    const view = await viewSupportDocument(request("GET", `/api/v1/support-documents/${id}/view`), id, deps())
    expect(view.status).toBe(200)
    expect(view.headers.get("content-type")).toBe("application/pdf")
    expect(view.headers.get("content-disposition")).toBe("inline; filename=proyecto-de-carrera.pdf")
    expect(view.headers.get("cache-control")).toBe("no-store, private")
    expect(Buffer.from(await view.arrayBuffer()).toString("latin1")).toBe(PDF)
  })

  it("converts Word documents to PDF for the view", async () => {
    asRole("coordinador")
    const created = JSON.parse((await read(await storeSupportDocument(upload("Habilidades blandas", { name: "habilidades.docx", content: fixture("habilidades.docx") }), deps()))).text)
    const id = created.document.id as string
    expect(created.document.view).toBe("pendiente")
    expect(dispatched).toEqual([id])
    expect(objects.get("01a1c5bc-0000-7000-8000-000000000001")?.mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    await prepareSupportDocumentView(id, viewDeps())
    expect(converted.map((call) => call.filename)).toEqual(["documento.docx"])
    const document = documents.get(id) as SupportDocumentInput
    expect(document.view).toBe("lista")
    const preview = objects.get(document.previewId as string) as StoredObjectInput
    expect(preview).toMatchObject({ classification: "documento_apoyo_vista", name: "habilidades.pdf", mime: "application/pdf", path: `documentos-apoyo/${CAREER}/${id}/vista.pdf` })
    expect(readFileSync(storage.path("private", preview.path), "latin1")).toBe(PDF)
    expect((await viewSupportDocument(request("GET", `/api/v1/support-documents/${id}/view`), id, deps())).status).toBe(200)
  })

  it("fits every Excel sheet to the page width before converting", async () => {
    asRole("coordinador")
    const id = JSON.parse((await read(await storeSupportDocument(upload("TIC TAC", { name: "tic.xlsx", content: fixture("workbook.xlsx") }), deps()))).text).document.id as string
    await prepareSupportDocumentView(id, viewDeps())
    expect(converted.map((call) => call.filename)).toEqual(["documento.xlsx"])
    const book = await JSZip.loadAsync(converted[0].content)
    const sheets = await Promise.all(["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"].map((name) => (book.file(name) as JSZip.JSZipObject).async("string")))
    for (const sheet of sheets) expect(sheet).toMatch(/<pageSetUpPr fitToPage="1"\/>/)
    expect(sheets[1]).toMatch(/orientation="landscape"/)
  })

  it("leaves the document without a view when there is no converter", async () => {
    converterEnabled = false
    asRole("coordinador")
    const id = JSON.parse((await read(await storeSupportDocument(upload("Malla en Excel", { name: "malla.xlsx", content: fixture("workbook.xlsx") }), deps()))).text).document.id as string
    await prepareSupportDocumentView(id, viewDeps())
    expect(documents.get(id)?.view).toBe("sin_vista")
    expect(await read(await viewSupportDocument(request("GET", `/api/v1/support-documents/${id}/view`), id, deps()))).toEqual({ status: 404, text: '{"message":""}' })
  })

  it("marks the view as missing when the job fails for good", async () => {
    asRole("coordinador")
    const id = JSON.parse((await read(await storeSupportDocument(upload("Plan", { name: "plan.docx", content: fixture("habilidades.docx") }), deps()))).text).document.id as string
    await failSupportDocumentView(id, new Error("caído"), viewDeps())
    expect(documents.get(id)?.view).toBe("sin_vista")
  })

  it("answers in Spanish when the request is above the server limit", async () => {
    asRole("coordinador")
    const response = await storeSupportDocument(request("POST", "/api/v1/coordination/support-documents", "x", { "content-length": String(33 * 1024 * 1024) }), deps())
    expect(await read(response)).toEqual({ status: 413, text: '{"message":"El archivo es demasiado grande."}' })
  })

  it("rejects other formats and requires a title", async () => {
    asRole("coordinador")
    expect(await read(await storeSupportDocument(upload("", { name: "notas.txt", content: "texto" }), deps()))).toEqual({
      status: 422,
      text: '{"message":"Escriba el nombre del documento. (y 1 error más)","errors":{"title":["Escriba el nombre del documento."],"file":["Use un PDF, Word o Excel."]}}',
    })
    expect(await read(await storeSupportDocument(upload("Disfrazado", { name: "notas.pdf", content: "texto" }), deps()))).toMatchObject({ status: 422 })
    expect(await read(await storeSupportDocument(upload("Sin archivo", null), deps()))).toEqual({
      status: 422,
      text: '{"message":"Elija el archivo.","errors":{"file":["Elija el archivo."]}}',
    })
    expect(await read(await storeSupportDocument(upload("Texto", null, { file: "no es archivo" }), deps()))).toEqual({
      status: 422,
      text: '{"message":"El campo archivo debe ser un archivo. (y 1 error más)","errors":{"file":["El campo archivo debe ser un archivo.","Use un PDF, Word o Excel."]}}',
    })
    expect(await read(await storeSupportDocument(upload("x".repeat(181), { name: "a.pdf", content: PDF }), deps()))).toEqual({
      status: 422,
      text: '{"message":"El nombre no puede pasar de 180 caracteres.","errors":{"title":["El nombre no puede pasar de 180 caracteres."]}}',
    })
    expect(documents.size).toBe(0)
    expect(objects.size).toBe(0)
  })

  it("lets only the career coordinator manage, and hides documents of other careers", async () => {
    asRole("docente")
    expect(await read(await storeSupportDocument(upload("Intento", { name: "a.pdf", content: PDF }), deps()))).toEqual({ status: 403, text: '{"message":""}' })
    expect(await read(await storeSupportDocument(upload("Datos", { name: "datos.xlsx", content: fixture("datos-5001.xlsx") }), deps()))).toEqual({ status: 403, text: '{"message":""}' })

    asRole("coordinador", OTHER_CAREER)
    const other = JSON.parse((await read(await storeSupportDocument(upload("Ajeno", { name: "ajeno.pdf", content: PDF }), deps()))).text).document.id as string
    asRole("docente")
    expect(await read(await viewSupportDocument(request("GET", `/api/v1/support-documents/${other}/view`), other, deps()))).toEqual({ status: 404, text: '{"message":""}' })
    asRole("bibliotecario", null)
    expect(await read(await viewSupportDocument(request("GET", `/api/v1/support-documents/${other}/view`), other, deps()))).toEqual({ status: 403, text: '{"message":""}' })
    asRole("coordinador")
    expect(await read(await destroySupportDocument(request("DELETE", `/api/v1/coordination/support-documents/${other}`), other, deps()))).toEqual({ status: 404, text: '{"message":""}' })
    expect(documents.has(other)).toBe(true)
  })

  it("rejects spreadsheets with more than 5,000 filled cells before queueing", async () => {
    asRole("coordinador")
    for (const name of ["datos-5001.xlsx", "datos-5001.xls"]) {
      const response = JSON.parse((await read(await storeSupportDocument(upload("Datos masivos", { name, content: fixture(name) }), deps()))).text)
      expect(response.errors.file).toEqual(["La hoja de cálculo tiene más de 5.000 celdas con datos. Divídala en archivos más pequeños o súbala como PDF."])
    }
    expect(documents.size).toBe(0)
    expect(dispatched).toEqual([])
  })

  it("accepts spreadsheets up to 5,000 filled cells even with formatted empty cells", async () => {
    asRole("coordinador")
    for (const name of ["datos-5000-styled.xlsx", "datos-5000-styled.xls"]) {
      expect((await storeSupportDocument(upload(`Datos ${name}`, { name, content: fixture(name) }), deps())).status).toBe(201)
    }
    expect(documents.size).toBe(2)
    expect(dispatched).toHaveLength(2)
  })

  it("refuses an upload sent from another origin", async () => {
    asRole("coordinador")
    const form = new FormData()
    form.append("title", "Desde otro sitio")
    form.append("file", new File([PDF], "a.pdf"))
    expect((await storeSupportDocument(request("POST", "/api/v1/coordination/support-documents", form, { origin: "https://evil.example" }), deps())).status).toBe(401)
    expect((await storeSupportDocument(upload("Desde la aplicación", { name: "a.pdf", content: PDF }), deps())).status).toBe(201)
  })
})

describe("DELETE /api/v1/coordination/support-documents/{document}", () => {
  it("removes the document, its files and its folder from the server", async () => {
    asRole("coordinador")
    const id = JSON.parse((await read(await storeSupportDocument(upload("Para borrar", { name: "b.docx", content: fixture("habilidades.docx") }), deps()))).text).document.id as string
    await prepareSupportDocumentView(id, viewDeps())
    const document = documents.get(id) as SupportDocumentInput
    const paths = [objects.get(document.objectId)?.path, objects.get(document.previewId as string)?.path] as string[]
    for (const file of paths) expect(await storage.exists("private", file)).toBe(true)

    expect(await read(await destroySupportDocument(request("DELETE", `/api/v1/coordination/support-documents/${id}`), id, deps()))).toEqual({ status: 200, text: '{"message":"Documento eliminado."}' })

    expect(documents.has(id)).toBe(false)
    expect(objects.size).toBe(0)
    for (const file of paths) expect(await storage.exists("private", file)).toBe(false)
    expect(await storage.exists("private", path.posix.dirname(paths[0]))).toBe(false)
  })

  it("answers the router 404 for a malformed id and Laravel's model 404 for an unknown document", async () => {
    asRole("coordinador")
    expect((await destroySupportDocument(request("DELETE", "/api/v1/coordination/support-documents/x"), "x", deps())).status).toBe(404)
    const missing = "01a1c5bc-79ca-7331-8f0f-000000000000"
    expect(await read(await destroySupportDocument(request("DELETE", `/api/v1/coordination/support-documents/${missing}`), missing, deps()))).toEqual({
      status: 404,
      text: '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\SupportDocument] 01a1c5bc-79ca-7331-8f0f-000000000000"}',
    })
  })
})
