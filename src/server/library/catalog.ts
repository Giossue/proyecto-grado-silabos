import { DOMParser, type Document, type Element } from "@xmldom/xmldom"
import { phpRawUrlEncode } from "../laravel/pagination"

export const CATALOG_FIELDS = ["author", "title", "isbn", "any"]

export type CatalogSettings = {
  driver: string
  baseUrl: string
  connectTimeoutSeconds: number
  timeoutSeconds: number
  responseBytes: number
}

export type KohaResponse = { status: number; body: Buffer }
export type KohaRequest = { accept?: string; settings: CatalogSettings }
export type KohaFetch = (url: string, request: KohaRequest) => Promise<KohaResponse>

export class KohaTransportError extends Error {}
export class CatalogUnavailable extends Error {}

export type CatalogBook = {
  id: string
  title: string
  author: string
  year: string
  place: string
  publisher: string
  isbn: string
  call_number: string
  format: string
  kind: string
}

export type CatalogLibrary = { id: string; name: string }

export type CatalogPage = { books: CatalogBook[]; total: number; page: number; perPage: number }

export interface BibliographicCatalog {
  search(field: string, term: string, page: number, libraries: string[]): Promise<CatalogPage>
  libraries(): Promise<CatalogLibrary[]>
}

const PER_PAGE = 20
const CONCURRENT_REQUESTS = 5
const MAX_WORDS = 6
const MARC_NAMESPACE = "http://www.loc.gov/MARC21/slim"
const OPENSEARCH_NAMESPACE = "http://a9.com/-/spec/opensearch/1.1/"
const LIBRARY_CODE = /^[A-Za-z0-9_-]{1,20}$/
const INDEXES: Record<string, string> = { author: "au", title: "ti", isbn: "isbn", any: "kw" }
const ITEM_TYPES: Record<string, { kind: string; format: string }> = {
  BK: { kind: "Libro", format: "Libro físico" },
  REF: { kind: "Referencia", format: "Libro físico" },
  TE: { kind: "Tesis", format: "Tesis física" },
  CR: { kind: "Revista", format: "Revista física" },
}
const DISABLED = "La búsqueda en el catálogo de la biblioteca está deshabilitada en este entorno."
const NOT_REACHABLE = "El catálogo de la biblioteca no está disponible."
const FAILED = "No fue posible consultar el catálogo de la biblioteca."
const ERROR_STATUS = "El catálogo de la biblioteca respondió con un error."
const UNREADABLE = "El catálogo de la biblioteca devolvió una respuesta que no se pudo leer."
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

export function pageMeta(page: CatalogPage) {
  const from = page.books.length === 0 ? null : (page.page - 1) * page.perPage + 1
  return {
    current_page: page.page,
    last_page: Math.max(1, Math.ceil(page.total / page.perPage)),
    per_page: page.perPage,
    from,
    to: from === null ? null : from + page.books.length - 1,
    total: page.total,
  }
}

function itemType(code: string): { kind: string; format: string } {
  return ITEM_TYPES[code.replace(PHP_TRIM, "").toUpperCase()] ?? ITEM_TYPES.BK
}

function clean(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(PHP_TRIM, "")
    .replace(/^[ \t/:;,.]+|[ \t/:;,.]+$/g, "")
}

function document(xml: string): Document | null {
  try {
    const parsed = new DOMParser({
      onError: (level, message) => {
        throw new Error(`${level}: ${message}`)
      },
    }).parseFromString(xml, "text/xml")
    return parsed.documentElement ? parsed : null
  } catch {
    return null
  }
}

function text(body: Buffer): string {
  return new TextDecoder().decode(body)
}

function elements(list: { length: number; item(index: number): Element | null }): Element[] {
  return Array.from({ length: list.length }, (_, index) => list.item(index)).filter((item): item is Element => item !== null)
}

function buildQuery(query: Record<string, string | number>): string {
  return Object.entries(query)
    .map(([key, value]) => `${phpRawUrlEncode(key)}=${phpRawUrlEncode(String(value))}`)
    .join("&")
}

function phpIsNumeric(value: string): boolean {
  return /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(value)
}

function caseInsensitiveBytes(left: string, right: string): number {
  const lower = (value: string) => Buffer.from(value.replace(/[A-Z]/g, (letter) => letter.toLowerCase()))
  return Buffer.compare(lower(left), lower(right))
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const runner = async () => {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: "fulfilled", value: await work(items[index]) }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, runner))
  return results
}

class KohaPublicCatalog implements BibliographicCatalog {
  constructor(
    private readonly settings: CatalogSettings,
    private readonly fetch: KohaFetch,
  ) {}

  async search(field: string, term: string, page: number, libraries: string[]): Promise<CatalogPage> {
    page = Math.max(1, page)
    let query = this.query(field, term)
    if (query === null) return { books: [], total: 0, page, perPage: PER_PAGE }
    const codes = [...new Set(libraries.filter((code) => LIBRARY_CODE.test(code)))]
    if (codes.length > 0) query += ` AND (${codes.map((code) => `branch:${code}`).join(" OR ")})`
    const [ids, total] = await this.ids(query, page)
    return { books: ids.length === 0 ? [] : await this.books(ids, codes), total, page, perPage: PER_PAGE }
  }

  async libraries(): Promise<CatalogLibrary[]> {
    const response = await this.get("/api/v1/public/libraries", {}, "application/json")
    let payload: unknown
    try {
      payload = JSON.parse(text(response.body))
    } catch {
      payload = null
    }
    const entries = typeof payload === "object" && payload !== null ? Object.values(payload) : []
    const libraries: CatalogLibrary[] = []
    for (const library of entries) {
      const record = typeof library === "object" && library !== null && !Array.isArray(library) ? (library as Record<string, unknown>) : null
      const id = record?.library_id
      const name = record?.name
      if (typeof id === "string" && LIBRARY_CODE.test(id)) {
        const trimmed = typeof name === "string" ? name.replace(PHP_TRIM, "") : ""
        libraries.push({ id, name: trimmed !== "" ? trimmed : id })
      }
    }
    return libraries.sort((left, right) => caseInsensitiveBytes(left.name, right.name))
  }

  private query(field: string, term: string): string | null {
    const index = INDEXES[field]
    if (index === undefined) return null
    if (field === "isbn") {
      const isbn = term.replace(/[^0-9Xx]/g, "").toUpperCase()
      return isbn.length === 10 || isbn.length === 13 ? `isbn:${isbn}` : null
    }
    const words = term.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "" && !["and", "or", "not"].includes(word.toLowerCase()))
    return words.length === 0 ? null : words.slice(0, MAX_WORDS).map((word) => `${index},rtrn:${word}`).join(" AND ")
  }

  private async ids(query: string, page: number): Promise<[string[], number]> {
    const response = await this.get("/cgi-bin/koha/opac-search.pl", { q: query, format: "rss2", count: PER_PAGE, offset: (page - 1) * PER_PAGE })
    const xml = this.withinLimit(response) ? document(text(response.body)) : null
    if (xml === null) throw new CatalogUnavailable(UNREADABLE)
    const ids = new Map<string, string>()
    for (const item of elements(xml.getElementsByTagName("item"))) {
      const link = item.getElementsByTagName("link").item(0)
      const match = link ? /biblionumber=(\d+)/.exec(link.textContent ?? "") : null
      if (match) ids.set(match[1], match[1])
    }
    const total = xml.getElementsByTagNameNS(OPENSEARCH_NAMESPACE, "totalResults").item(0)?.textContent ?? null
    const reported = total !== null && phpIsNumeric(total) ? Math.trunc(Number(total.trim())) : 0
    return [[...ids.values()].slice(0, PER_PAGE), Math.max(reported, ids.size)]
  }

  private async books(ids: string[], libraries: string[]): Promise<CatalogBook[]> {
    const url = this.url("/cgi-bin/koha/opac-export.pl")
    if (url === null) throw new CatalogUnavailable(FAILED)
    const responses = await pool(ids, CONCURRENT_REQUESTS, (id) =>
      this.fetch(`${url}?${buildQuery({ op: "export", bib: id, format: "marcxml" })}`, { settings: this.settings }),
    )
    const books: CatalogBook[] = []
    ids.forEach((id, index) => {
      const result = responses[index]
      if (result.status !== "fulfilled") return
      const response = result.value
      if (response.status < 200 || response.status >= 300 || !this.withinLimit(response)) return
      const book = this.book(id, text(response.body), libraries)
      if (book !== null) books.push(book)
    })
    return books
  }

  private book(id: string, marcXml: string, libraries: string[]): CatalogBook | null {
    const xml = document(marcXml)
    if (xml === null) return null
    const marc = this.subfields(xml)
    const first = (tag: string, code: string) => clean(marc.get(`${tag}${code}`) ?? "")
    const title = clean(`${first("245", "a")} ${first("245", "b")}`)
    if (title === "") return null
    const author = first("100", "a") || first("110", "a") || first("700", "a")
    const publication = first("264", "c") || first("260", "c")
    const isbnToken = first("020", "a").replace(/^[ (]+/, "").split(/[ (]/)[0] ?? ""
    const type = itemType(first("942", "c") || first("952", "y"))
    return {
      id,
      title,
      author,
      year: /\d{4}/.exec(publication)?.[0] ?? "",
      place: first("264", "a") || first("260", "a"),
      publisher: first("264", "b") || first("260", "b"),
      isbn: isbnToken.replace(/[^0-9Xx]/g, "").toUpperCase(),
      call_number: this.itemCallNumber(xml, libraries) || clean(`${first("082", "a")} ${first("082", "b")}`),
      format: type.format,
      kind: type.kind,
    }
  }

  private itemCallNumber(xml: Document, libraries: string[]): string {
    let fallback = ""
    for (const field of elements(xml.getElementsByTagNameNS(MARC_NAMESPACE, "datafield"))) {
      if (field.getAttribute("tag") !== "952") continue
      const values = new Map<string, string>()
      for (const subfield of elements(field.getElementsByTagNameNS(MARC_NAMESPACE, "subfield"))) {
        const code = subfield.getAttribute("code") ?? ""
        if (!values.has(code)) values.set(code, subfield.textContent ?? "")
      }
      const callNumber = clean(values.get("o") ?? "")
      if (callNumber === "") continue
      if (libraries.length === 0 || libraries.includes(values.get("a") ?? "") || libraries.includes(values.get("b") ?? "")) return callNumber
      fallback = fallback === "" ? callNumber : fallback
    }
    return libraries.length === 0 ? "" : fallback
  }

  private subfields(xml: Document): Map<string, string> {
    const values = new Map<string, string>()
    for (const field of elements(xml.getElementsByTagNameNS(MARC_NAMESPACE, "datafield"))) {
      for (const subfield of elements(field.getElementsByTagNameNS(MARC_NAMESPACE, "subfield"))) {
        const key = `${field.getAttribute("tag") ?? ""}${subfield.getAttribute("code") ?? ""}`
        if (!values.has(key)) values.set(key, subfield.textContent ?? "")
      }
    }
    return values
  }

  private async get(path: string, query: Record<string, string | number>, accept = "application/xml, text/xml"): Promise<KohaResponse> {
    let response: KohaResponse
    try {
      const url = this.url(path)
      if (url === null) throw new CatalogUnavailable("Falta configurar la dirección del catálogo de la biblioteca.")
      const search = buildQuery(query)
      response = await this.fetch(search === "" ? url : `${url}?${search}`, { accept, settings: this.settings })
    } catch (error) {
      throw new CatalogUnavailable(error instanceof KohaTransportError ? NOT_REACHABLE : FAILED)
    }
    if (response.status < 200 || response.status >= 300) throw new CatalogUnavailable(ERROR_STATUS)
    if (!this.withinLimit(response)) throw new CatalogUnavailable(UNREADABLE)
    return response
  }

  private url(path: string): string | null {
    const base = this.settings.baseUrl.replace(/\/+$/, "")
    return base === "" ? null : `${base}${path}`
  }

  private withinLimit(response: KohaResponse): boolean {
    return response.body.length <= Math.max(1, this.settings.responseBytes)
  }
}

class DisabledCatalog implements BibliographicCatalog {
  async search(): Promise<CatalogPage> {
    throw new CatalogUnavailable(DISABLED)
  }

  async libraries(): Promise<CatalogLibrary[]> {
    throw new CatalogUnavailable(DISABLED)
  }
}

export function createCatalog(settings: CatalogSettings, fetch: KohaFetch): BibliographicCatalog {
  return settings.driver === "koha" ? new KohaPublicCatalog(settings, fetch) : new DisabledCatalog()
}
