import { HTTP_ERROR_PAGE, NOT_FOUND_PAGE } from "./errorPages"
import { laravelHttpError } from "./responses"
import { expectsJson } from "./request"
import routeTable from "./routeTable.json"

export type LaravelRoute = { methods: string[]; uri: string; wheres: Record<string, string>; bindings: Record<string, string> }

const ROUTER_VERBS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, private" }
const STATUS_TEXTS: Record<number, string> = { 404: "Not Found", 405: "Method Not Allowed" }

export const LARAVEL_ROUTES: readonly LaravelRoute[] = routeTable as LaravelRoute[]

export const REMOVED_ROUTES: readonly string[] = ["api/v1/admin/audit-events", "api/v1/admin/audit-events/export", "api/v1/admin/reports", "api/v1/admin/reports/export"]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

function compile(route: LaravelRoute): RegExp {
  const segments = route.uri === "/" ? [] : route.uri.split("/")
  let pattern = ""
  for (const segment of segments) {
    const parameter = /^\{(\w+)(\?)?\}$/.exec(segment)
    if (!parameter) {
      pattern += `/${escapeRegExp(segment)}`
      continue
    }
    const requirement = (route.wheres[parameter[1]] ?? "[^/]+").replace(/\\d/g, "\\p{Nd}")
    pattern += parameter[2] ? `(?:/(?:${requirement}))?` : `/(?:${requirement})`
  }
  return new RegExp(`^${pattern === "" ? "/" : pattern}$`, "su")
}

const COMPILED = LARAVEL_ROUTES.map((route) => ({ route, regex: compile(route) }))

function rawUrlDecode(path: string): string | null {
  const bytes: number[] = []
  for (let index = 0; index < path.length; index += 1) {
    const hex = path.slice(index + 1, index + 3)
    if (path[index] === "%" && /^[0-9a-fA-F]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16))
      index += 2
    } else {
      bytes.push(...new TextEncoder().encode(path[index]))
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

export function laravelRoutesMatching(pathname: string): LaravelRoute[] {
  const decoded = rawUrlDecode(pathname.replace(/\/+$/, "") || "/")
  if (decoded === null) return []
  return COMPILED.filter(({ regex }) => regex.test(decoded)).map(({ route }) => route)
}

export function removedFromSystem(pathname: string): boolean {
  const decoded = rawUrlDecode(pathname.replace(/\/+$/, "") || "/")
  return decoded !== null && REMOVED_ROUTES.includes(decoded.replace(/^\/+/, ""))
}

export function routeAllows(request: Request): boolean {
  return laravelRoutesMatching(new URL(request.url).pathname).some((route) => route.methods.includes(request.method))
}

export function laravelPath(request: Request): string {
  const trimmed = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "")
  return trimmed === "" ? "/" : trimmed
}

function rendersJson(request: Request): boolean {
  const path = laravelPath(request)
  return (path.startsWith("api/") && path.length > 4) || expectsJson(request)
}

function htmlError(status: number, headers: Record<string, string> = {}): Response {
  const body = status === 404 ? NOT_FOUND_PAGE : HTTP_ERROR_PAGE.replaceAll("{{status}}", String(status)).replaceAll("{{text}}", STATUS_TEXTS[status])
  return new Response(body, { status, headers: { ...headers, ...HTML_HEADERS } })
}

export function unknownRoute(request: Request): Response {
  if (!rendersJson(request)) return htmlError(404)
  return laravelHttpError(404, `The route ${laravelPath(request)} could not be found.`)
}

function methodNotAllowed(request: Request, methods: string[]): Response {
  const allow = methods.join(", ")
  if (!rendersJson(request)) return htmlError(405, { Allow: allow })
  const response = laravelHttpError(405, `The ${request.method} method is not supported for route ${laravelPath(request)}. Supported methods: ${allow}.`)
  response.headers.set("Allow", allow)
  return response
}

export function laravelRouter(request: Request): Response {
  const routes = laravelRoutesMatching(new URL(request.url).pathname)
  const others = ROUTER_VERBS.filter((verb) => verb !== request.method && routes.some((route) => route.methods.includes(verb)))
  if (routes.some((route) => route.methods.includes(request.method)) || others.length === 0) return unknownRoute(request)
  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: { Allow: others.join(","), ...HTML_HEADERS } })
  return methodNotAllowed(request, others)
}

export function laravelRouterHandler(request: Request): Promise<Response> {
  return Promise.resolve(laravelRouter(request))
}

export function modelNotFound(model: string, id: string): Response {
  return laravelHttpError(404, `No query results for model [${model}] ${id}`)
}

export function laravelFallbackEnabled(): boolean {
  return (process.env.LARAVEL_FALLBACK ?? "on").trim().toLowerCase() !== "off"
}
