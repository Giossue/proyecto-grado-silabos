import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { requireSession, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession, SessionRequirements } from "../auth/types"
import { phpQuery, type PhpValue } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { phpFilterInt } from "@/schemas/php"
import { catalogSearchSchema } from "@/schemas/library"
import { validateSchema } from "../http/schemaValidation"
import { CATALOG_FIELDS, CatalogUnavailable, createCatalog, pageMeta, type BibliographicCatalog, type CatalogSettings, type KohaFetch } from "./catalog"
import { kohaFetch } from "./kohaHttp"

export type CatalogDeps = {
  bridge: BridgeDeps
  limiter: RateLimiter
  settings: () => Promise<CatalogSettings>
  fetch: KohaFetch
  facultyLibraries: (careerId: string) => Promise<string[]>
}

const REQUESTS_PER_MINUTE = 30
const TERM_CHARACTERS = 120
const RESPONSE_BYTES = 524288
const FORBIDDEN = "No tiene permiso para hacer esto."

function envInteger(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

async function storedSettings(): Promise<Map<string, unknown>> {
  try {
    const result = await db.execute(sql`select clave_ajuste, valor_ajuste from ajustes_sistema where clave_ajuste in ('library.driver', 'library.base_url')`)
    return new Map((result.rows as { clave_ajuste: string; valor_ajuste: unknown }[]).map((row) => [row.clave_ajuste, row.valor_ajuste]))
  } catch {
    return new Map()
  }
}

function asConfigString(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (value === true) return "1"
  return ""
}

export async function catalogSettings(): Promise<CatalogSettings> {
  const stored = await storedSettings()
  const pick = (field: string, environment: string | undefined) => (stored.has(field) ? stored.get(field) : (environment ?? null))
  return {
    driver: asConfigString(pick("library.driver", process.env.CATALOG_DRIVER ?? "disabled")),
    baseUrl: asConfigString(pick("library.base_url", process.env.KOHA_BASE_URL)),
    connectTimeoutSeconds: envInteger("KOHA_CONNECT_TIMEOUT", 3),
    timeoutSeconds: envInteger("KOHA_TIMEOUT", 10),
    responseBytes: RESPONSE_BYTES,
  }
}

async function facultyLibraries(careerId: string): Promise<string[]> {
  const result = await db.execute(sql`select f.bibliotecas_koha_facultad as libraries from carreras c
    join facultades f on f.facultad_id = c.facultad_id where c.carrera_id = ${careerId} limit 1`)
  const libraries = (result.rows[0] as { libraries?: unknown } | undefined)?.libraries
  if (typeof libraries !== "object" || libraries === null) return []
  return Object.values(libraries).flatMap((code) => (typeof code === "string" ? [code] : typeof code === "number" ? [String(code)] : []))
}

export function defaultCatalogDeps(): CatalogDeps {
  return { bridge: defaultBridgeDeps(), limiter: sharedRateLimiter(), settings: catalogSettings, fetch: kohaFetch, facultyLibraries }
}

type Authorized = { session: AppSession; finish: (response: Response) => Response; catalog: () => Promise<BibliographicCatalog> }

async function authorize(request: Request, deps: CatalogDeps, role: string): Promise<Authorized | Response> {
  let gate: Throttle | null = null
  const requirements: SessionRequirements = {
    verified: true,
    activeRole: "required",
    afterAuthentication: (user) => {
      gate = throttle(deps.limiter, { key: `library-catalog:${user.id}`, maxAttempts: REQUESTS_PER_MINUTE, decaySeconds: 60 }, deps.bridge.now)
      return gate.hit()
    },
  }
  const session = await requireSession(request, requirements, deps.bridge)
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  if (session instanceof Response) return finish(session)
  if (!session.user.active || session.activeRole?.role !== role) return finish(apiJson({ message: FORBIDDEN }, 403))
  return { session, finish, catalog: async () => createCatalog(await deps.settings(), deps.fetch) }
}

function unavailable(error: unknown): Response {
  if (!(error instanceof CatalogUnavailable)) throw error
  return apiJson({ message: error.message, code: "catalog_unavailable" }, 503)
}

function phpIntval(value: PhpValue | undefined): number {
  if (value === undefined || value === null) return 1
  return phpFilterInt(value) ?? 1
}

export async function searchCatalog(request: Request, deps: CatalogDeps = defaultCatalogDeps()): Promise<Response> {
  const authorized = await authorize(request, deps, "docente")
  if (authorized instanceof Response) return authorized
  const { session, finish } = authorized
  const input = phpQuery(new URL(request.url))
  const { errors } = await validateSchema(catalogSearchSchema(CATALOG_FIELDS, TERM_CHARACTERS), input)
  if (errors !== null) return finish(validationError(errors))
  const careerId = session.activeRole?.careerId ?? null
  const libraries = careerId === null ? [] : await deps.facultyLibraries(careerId)
  try {
    const page = await (await authorized.catalog()).search(String(input.field), String(input.q), Math.max(1, phpIntval(input.page)), libraries)
    return finish(apiJson({ data: page.books, meta: pageMeta(page) }))
  } catch (error) {
    return finish(unavailable(error))
  }
}

export async function catalogLibraries(request: Request, deps: CatalogDeps = defaultCatalogDeps()): Promise<Response> {
  const authorized = await authorize(request, deps, "administrador")
  if (authorized instanceof Response) return authorized
  try {
    return authorized.finish(apiJson({ data: await (await authorized.catalog()).libraries() }))
  } catch (error) {
    return authorized.finish(unavailable(error))
  }
}
