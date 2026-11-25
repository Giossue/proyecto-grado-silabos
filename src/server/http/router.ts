import { HTTP_ERROR_PAGE, NOT_FOUND_PAGE } from "./errorPages"
import { jsonError } from "./responses"
import { expectsJson } from "./request"
import apiRoutes from "./apiRoutes.json"

export type ApiRoute = { methods: string[]; uri: string; wheres: Record<string, string>; bindings: Record<string, string> }

const ROUTER_VERBS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, private" }
const STATUS_TEXTS: Record<number, string> = { 404: "Not Found", 405: "Method Not Allowed" }
const MINIMAL_TITLES: Record<number, string> = { 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 419: "Page Expired", 429: "Too Many Requests", 500: "Server Error", 503: "Service Unavailable" }

export const API_ROUTES: readonly ApiRoute[] = apiRoutes as ApiRoute[]

export const REMOVED_ROUTES: readonly string[] = ["api/v1/admin/audit-events", "api/v1/admin/audit-events/export", "api/v1/admin/reports", "api/v1/admin/reports/export"]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

function compile(route: ApiRoute): RegExp {
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

const COMPILED = API_ROUTES.map((route) => ({ route, regex: compile(route) }))

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

export function routesMatching(pathname: string): ApiRoute[] {
  const decoded = rawUrlDecode(pathname.replace(/\/+$/, "") || "/")
  if (decoded === null) return []
  return COMPILED.filter(({ regex }) => regex.test(decoded)).map(({ route }) => route)
}

export function routeAllows(request: Request): boolean {
  return routesMatching(new URL(request.url).pathname).some((route) => route.methods.includes(request.method))
}

export function routePath(request: Request): string {
  const trimmed = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "")
  return trimmed === "" ? "/" : trimmed
}

function rendersJson(request: Request): boolean {
  const path = routePath(request)
  return (path.startsWith("api/") && path.length > 4) || expectsJson(request)
}

export function minimalErrorPage(status: number, message: string = MINIMAL_TITLES[status]): string {
  return NOT_FOUND_PAGE.replace("<title>Not Found</title>", `<title>${MINIMAL_TITLES[status]}</title>`)
    .replace("404                    </h1>", `${status}                    </h1>`)
    .replace("Not Found                    </div>", `${escapeHtml(message)}                    </div>`)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

export function httpError(request: Request, status: number, message = ""): Response {
  if (rendersJson(request)) return jsonError(status, status === 500 ? "Server Error" : message)
  return new Response(minimalErrorPage(status, message || MINIMAL_TITLES[status]), { status, headers: HTML_HEADERS })
}

function htmlError(status: number, headers: Record<string, string> = {}): Response {
  const body = status === 404 ? NOT_FOUND_PAGE : HTTP_ERROR_PAGE.replaceAll("{{status}}", String(status)).replaceAll("{{text}}", STATUS_TEXTS[status])
  return new Response(body, { status, headers: { ...headers, ...HTML_HEADERS } })
}

export function unknownRoute(request: Request): Response {
  if (!rendersJson(request)) return htmlError(404)
  return jsonError(404, `The route ${routePath(request)} could not be found.`)
}

function methodNotAllowed(request: Request, methods: string[]): Response {
  const allow = methods.join(", ")
  if (!rendersJson(request)) return htmlError(405, { Allow: allow })
  const response = jsonError(405, `The ${request.method} method is not supported for route ${routePath(request)}. Supported methods: ${allow}.`)
  response.headers.set("Allow", allow)
  return response
}

export function unmatchedRoute(request: Request): Response {
  const routes = routesMatching(new URL(request.url).pathname)
  const others = ROUTER_VERBS.filter((verb) => verb !== request.method && routes.some((route) => route.methods.includes(verb)))
  if (routes.some((route) => route.methods.includes(request.method)) || others.length === 0) return unknownRoute(request)
  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: { Allow: others.join(","), ...HTML_HEADERS } })
  return methodNotAllowed(request, others)
}

export function unmatchedRouteHandler(request: Request): Promise<Response> {
  return Promise.resolve(unmatchedRoute(request))
}

export function modelNotFound(model: string, id: string): Response {
  return jsonError(404, `No query results for model [${model}] ${id}`)
}
