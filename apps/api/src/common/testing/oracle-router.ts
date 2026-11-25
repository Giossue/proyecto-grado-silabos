import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"
import { unmatchedRoute } from "../../server/http/router"

export type OracleParams = Record<string, string | string[]>

export type OracleHandler = (request: Request, context: { params: Promise<OracleParams> }) => Promise<Response> | Response

export type OracleRoute = { path: string; handlers: Record<string, unknown> }

export type OracleMatch = { route: OracleRoute; params: OracleParams }

const rank = (segment: string) => (segment.startsWith("[[...") ? 3 : segment.startsWith("[...") ? 2 : segment.startsWith("[") ? 1 : 0)

const parameterName = (segment: string) => segment.replace(/^\[+(\.\.\.)?/, "").replace(/\]+$/, "")

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function matchSegments(pattern: string[], path: string[]): OracleParams | null {
  const params: OracleParams = {}
  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index]
    const kind = rank(segment)
    if (kind >= 2) {
      const rest = path.slice(index)
      if (rest.length === 0 && kind === 2) return null
      params[parameterName(segment)] = rest
      return params
    }
    if (index >= path.length) return null
    if (kind === 1) params[parameterName(segment)] = path[index]
    else if (segment !== path[index]) return null
  }
  return pattern.length === path.length ? params : null
}

function specificity(left: string[], right: string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = rank(left[index] ?? "") - rank(right[index] ?? "")
    if (difference !== 0) return difference
  }
  return right.length - left.length
}

export function matchOracleRoute(routes: readonly OracleRoute[], pathname: string): OracleMatch | null {
  const path = pathname.replace(/^\/+|\/+$/g, "").split("/").filter((segment) => segment !== "").map(decode)
  const matches = routes
    .map((route) => ({ route, pattern: route.path.split("/"), params: matchSegments(route.path.split("/"), path) }))
    .filter((candidate): candidate is { route: OracleRoute; pattern: string[]; params: OracleParams } => candidate.params !== null)
    .sort((left, right) => specificity(left.pattern, right.pattern))
  const best = matches[0]
  return best ? { route: best.route, params: best.params } : null
}

function handlerFor(route: OracleRoute, method: string): OracleHandler | null {
  const handler = route.handlers[method] ?? (method === "HEAD" ? route.handlers.GET : undefined)
  return typeof handler === "function" ? (handler as OracleHandler) : null
}

export async function dispatchOracle(routes: readonly OracleRoute[], request: Request): Promise<Response> {
  const match = matchOracleRoute(routes, new URL(request.url).pathname)
  const handler = match ? handlerFor(match.route, request.method) : null
  if (!match || !handler) return unmatchedRoute(request)
  const { result, cookies } = await withCookieQueue(async () => handler(request, { params: Promise.resolve(match.params) }))
  if (cookies.length === 0) return result
  try {
    return withSetCookies(result, cookies)
  } catch {
    return withSetCookies(new Response(result.body, result), cookies)
  }
}
