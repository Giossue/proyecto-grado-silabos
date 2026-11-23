// @vitest-environment node
import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { createRateLimiter, type RateLimiter } from "../laravel/throttle"
import { KohaTransportError, type CatalogSettings, type KohaFetch, type KohaResponse } from "./catalog"
import { catalogLibraries, searchCatalog, type CatalogDeps } from "./catalogHandlers"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const RSS = readFileSync(new URL("./__fixtures__/search.rss", import.meta.url), "utf8")
const RECORD = readFileSync(new URL("./__fixtures__/proyectos-de-inversion.marcxml", import.meta.url), "utf8")
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'

let world: FakeWorld
let settings: CatalogSettings
let sent: { url: URL; accept?: string }[]
let respond: (url: URL) => KohaResponse | Promise<KohaResponse>
let limiter: RateLimiter
let facultyLibraries: string[]

const ok = (body: string | object, status = 200): KohaResponse => ({ status, body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)) })

function fakeKoha({ failing = null, total = 2, itemType = "BK", record = RECORD }: { failing?: string | null; total?: number; itemType?: string; record?: string } = {}) {
  const rss = RSS.replace("<opensearch:totalResults>2<", `<opensearch:totalResults>${total}<`)
  const marc = record.replace('<subfield code="c">BK</subfield>', `<subfield code="c">${itemType}</subfield>`)
  respond = (url) => {
    if (url.pathname.endsWith("opac-search.pl")) return ok(rss)
    return failing !== null && url.searchParams.get("bib") === failing ? ok("error", 500) : ok(marc)
  }
}

const fetch: KohaFetch = async (url, request) => {
  const parsed = new URL(url)
  sent.push({ url: parsed, accept: request.accept })
  return respond(parsed)
}

function deps(): CatalogDeps {
  return {
    bridge: fakeDeps(world),
    limiter,
    settings: async () => settings,
    fetch,
    facultyLibraries: async (careerId) => (careerId === "c-1" ? facultyLibraries : []),
  }
}

function as(role: "docente" | "bibliotecario" | "administrador") {
  world.assignments = [makeAssignment({ role, careerId: role === "docente" ? "c-1" : null })]
}

async function search(query: Record<string, string | number>) {
  const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))
  const response = await searchCatalog(apiRequest(`/api/v1/teacher/library-catalog/search?${params}`, { cookie }), deps())
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown>, headers: response.headers }
}

async function libraries() {
  const response = await catalogLibraries(apiRequest("/api/v1/admin/library-catalog/libraries", { cookie }), deps())
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> }
}

const searchQueries = () => sent.filter((request) => request.url.pathname.endsWith("opac-search.pl")).map((request) => request.url.searchParams.get("q"))

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [],
  }
  as("docente")
  settings = { driver: "koha", baseUrl: "http://koha.test", connectTimeoutSeconds: 3, timeoutSeconds: 10, responseBytes: 524288 }
  sent = []
  respond = () => ok("")
  limiter = createRateLimiter()
  facultyLibraries = []
})

describe("GET /api/v1/teacher/library-catalog/search", () => {
  it("finds a book by ISBN with its data", async () => {
    fakeKoha({ failing: "999" })
    const result = await search({ field: "isbn", q: "978-956-343-106-3" })
    expect(result.status).toBe(200)
    expect(result.json.data).toEqual([
      {
        id: "10525",
        title: "Proyectos de inversión",
        author: "Sapag Chain, Nassir",
        year: "2011",
        place: "Santiago de Chile, Chile",
        publisher: "Pearson Educación",
        isbn: "9789563431063",
        call_number: "658.404 S2411p",
        format: "Libro físico",
        kind: "Libro",
      },
    ])
    expect(searchQueries()).toEqual(["isbn:9789563431063"])
    expect(sent[0].url.href).toBe("http://koha.test/cgi-bin/koha/opac-search.pl?q=isbn%3A9789563431063&format=rss2&count=20&offset=0")
    expect(sent[0].accept).toBe("application/xml, text/xml")
    expect(sent[1].url.href).toBe("http://koha.test/cgi-bin/koha/opac-export.pl?op=export&bib=10525&format=marcxml")
    expect(result.text).toContain('"title":"Proyectos de inversi\\u00f3n"')
  })

  it("uses each field's own Koha index", async () => {
    fakeKoha()
    for (const field of ["author", "title", "any"]) expect((await search({ field, q: "Sapag" })).status).toBe(200)
    expect(searchQueries()).toEqual(["au,rtrn:Sapag", "ti,rtrn:Sapag", "kw,rtrn:Sapag"])
  })

  it("asks Koha for one page of twenty and reports the total", async () => {
    fakeKoha({ total: 45 })
    expect((await search({ field: "any", q: "inversión", page: 3 })).json.meta).toEqual({
      current_page: 3,
      last_page: 3,
      per_page: 20,
      from: 41,
      to: 42,
      total: 45,
    })
    expect(sent[0].url.searchParams.get("offset")).toBe("40")
    expect(sent[0].url.searchParams.get("count")).toBe("20")
  })

  it("starts the first page at the beginning and describes one empty page without results", async () => {
    fakeKoha({ total: 45 })
    const first = await search({ field: "any", q: "inversión" })
    expect(first.json.meta).toMatchObject({ current_page: 1, from: 1 })
    respond = () =>
      ok('<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><opensearch:totalResults>0</opensearch:totalResults></channel></rss>')
    expect((await search({ field: "any", q: "nada" })).text).toBe(
      '{"data":[],"meta":{"current_page":1,"last_page":1,"per_page":20,"from":null,"to":null,"total":0}}',
    )
  })

  it("validates the page between 1 and 100 without calling Koha", async () => {
    expect((await search({ field: "any", q: "inversión", page: 0 })).json.errors).toEqual({ page: ["El campo página debe ser al menos 1."] })
    expect((await search({ field: "any", q: "inversión", page: 101 })).json.errors).toEqual({ page: ["El campo página no debe ser mayor que 100."] })
    expect((await search({ field: "any", q: "inversión", page: "x" })).json.errors).toEqual({ page: ["El campo página debe ser un número entero."] })
    expect(sent).toEqual([])
  })

  it("searches every word as a prefix and never passes search syntax", async () => {
    fakeKoha()
    await search({ field: "title", q: "proyec inver" })
    await search({ field: "title", q: 'inversión" or au:x* (y)\\\n AND z' })
    expect(searchQueries()).toEqual(["ti,rtrn:proyec AND ti,rtrn:inver", "ti,rtrn:inversión AND ti,rtrn:au AND ti,rtrn:x AND ti,rtrn:y AND ti,rtrn:z"])
  })

  it("does not search a term without letters or numbers, nor an ISBN that is not one", async () => {
    expect((await search({ field: "any", q: '** ""' })).json.data).toEqual([])
    expect((await search({ field: "isbn", q: "12345" })).json.data).toEqual([])
    expect(sent).toEqual([])
  })

  it("skips a book that cannot be read and answers an empty list without results", async () => {
    fakeKoha({ failing: "999" })
    expect((await search({ field: "any", q: "inversión" })).json.data).toHaveLength(1)
    respond = () => ok('<rss version="2.0"><channel></channel></rss>')
    expect((await search({ field: "any", q: "nada" })).json.data).toEqual([])
  })

  it("reports an unavailable catalog with Laravel's messages", async () => {
    const unavailable = (message: string) => JSON.stringify({ message, code: "catalog_unavailable" }).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
    respond = () => {
      throw new KohaTransportError("sin red")
    }
    expect(await search({ field: "any", q: "inversión" })).toMatchObject({ status: 503, text: unavailable("El catálogo de la biblioteca no está disponible.") })
    respond = () => ok("error", 500)
    expect(await search({ field: "any", q: "inversión" })).toMatchObject({ status: 503, text: unavailable("El catálogo de la biblioteca respondió con un error.") })
    respond = () => ok("no es xml")
    expect(await search({ field: "any", q: "inversión" })).toMatchObject({
      status: 503,
      text: unavailable("El catálogo de la biblioteca devolvió una respuesta que no se pudo leer."),
    })
  })

  it("is disabled unless the driver is koha, and needs an address", async () => {
    settings = { ...settings, driver: "disabled" }
    expect((await search({ field: "any", q: "inversión" })).json).toEqual({
      message: "La búsqueda en el catálogo de la biblioteca está deshabilitada en este entorno.",
      code: "catalog_unavailable",
    })
    settings = { ...settings, driver: "koha", baseUrl: "" }
    expect((await search({ field: "any", q: "inversión" })).json).toEqual({
      message: "No fue posible consultar el catálogo de la biblioteca.",
      code: "catalog_unavailable",
    })
    expect(sent).toEqual([])
  })

  it("is only for the teacher role and validates the field and the text", async () => {
    as("bibliotecario")
    expect(await search({ field: "any", q: "inversión" })).toMatchObject({ status: 403, text: FORBIDDEN })
    as("docente")
    expect((await search({ field: "any" })).json.errors).toEqual({ q: ["El campo texto a buscar es obligatorio."] })
    expect((await search({ field: "otro", q: "inversión" })).json.errors).toEqual({ field: ["El valor seleccionado en campo de búsqueda no es válido."] })
    expect((await search({ field: "any", q: "a" })).json.errors).toEqual({ q: ["El campo texto a buscar debe tener al menos 2 caracteres."] })
    expect((await search({ field: "any", q: "a".repeat(121) })).json.errors).toEqual({ q: ["El campo texto a buscar no debe tener más de 120 caracteres."] })
    expect((await search({})).text).toBe(
      '{"message":"El campo campo de b\\u00fasqueda es obligatorio. (y 1 error m\\u00e1s)","errors":{"field":["El campo campo de b\\u00fasqueda es obligatorio."],"q":["El campo texto a buscar es obligatorio."]}}',
    )
    expect(sent).toEqual([])
  })

  it("limits the search per user with Laravel's 429", async () => {
    fakeKoha()
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await search({ field: "any", q: "inversión" })).status).toBe(200)
    const limited = await search({ field: "any", q: "inversión" })
    expect(limited.status).toBe(429)
    expect(limited.text).toBe('{\n    "message": "Too Many Attempts."\n}')
    expect(limited.headers.get("x-ratelimit-limit")).toBe("30")
  })

  it("says a thesis is a thesis", async () => {
    fakeKoha({ itemType: "TE" })
    const [first] = (await search({ field: "isbn", q: "978-956-343-106-3" })).json.data as Record<string, string>[]
    expect(first).toMatchObject({ kind: "Tesis", format: "Tesis física" })
  })

  it("searches only the libraries of the teacher's faculty, and all of them when it has none", async () => {
    fakeKoha()
    facultyLibraries = ["BGEN", "BHTM"]
    await search({ field: "any", q: "inversión" })
    facultyLibraries = []
    await search({ field: "any", q: "inversión" })
    expect(searchQueries()).toEqual(["kw,rtrn:inversión AND (branch:BGEN OR branch:BHTM)", "kw,rtrn:inversión"])
  })

  it("takes the call number from the copy in the faculty library", async () => {
    fakeKoha({
      record: RECORD.replace(
        "</record>",
        '<datafield tag="952" ind1=" " ind2=" "><subfield code="a">BGEN</subfield><subfield code="b">BGEN</subfield><subfield code="o">MATRIZ 123</subfield></datafield></record>',
      ),
    })
    const callNumber = async () => ((await search({ field: "any", q: "inversión" })).json.data as { call_number: string }[])[0].call_number
    expect(await callNumber()).toBe("658.404 S2411p")
    facultyLibraries = ["BGEN"]
    expect(await callNumber()).toBe("MATRIZ 123")
    facultyLibraries = ["BFCCA"]
    expect(await callNumber()).toBe("658.404 S2411p")
  })
})

describe("GET /api/v1/admin/library-catalog/libraries", () => {
  beforeEach(() => as("administrador"))

  it("lists the libraries Koha publishes, sorted by name, without invalid codes", async () => {
    respond = () =>
      ok([
        { library_id: "BHTM", name: "SAN MIGUEL" },
        { library_id: "BFCCA", name: "LAGUACOTO" },
        { library_id: "BGEN", name: "MATRIZ" },
        { library_id: "MAL CODIGO!", name: "Se ignora" },
      ])
    expect(await libraries()).toMatchObject({
      status: 200,
      text: '{"data":[{"id":"BFCCA","name":"LAGUACOTO"},{"id":"BGEN","name":"MATRIZ"},{"id":"BHTM","name":"SAN MIGUEL"}]}',
    })
    expect(sent.map((request) => [request.url.href, request.accept])).toEqual([["http://koha.test/api/v1/public/libraries", "application/json"]])
  })

  it("is only for administration and reports an unavailable or disabled Koha", async () => {
    respond = () => ok("error", 500)
    as("docente")
    expect(await libraries()).toMatchObject({ status: 403, text: FORBIDDEN })
    as("administrador")
    expect(await libraries()).toMatchObject({ status: 503, json: { code: "catalog_unavailable" } })
    settings = { ...settings, driver: "disabled" }
    expect((await libraries()).status).toBe(503)
  })

  it("reports an oversized list as unavailable", async () => {
    settings = { ...settings, responseBytes: 2048 }
    respond = () => ok(Array.from({ length: 100 }, (_, index) => ({ library_id: `B${index + 1}`, name: "Biblioteca ".repeat(5) })))
    expect(await libraries()).toMatchObject({ status: 503, json: { code: "catalog_unavailable" } })
  })
})
