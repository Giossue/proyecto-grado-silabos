// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { API_ROUTES, REMOVED_ROUTES, routesMatching, type ApiRoute } from "./router"

type NextRoute = { file: string; segments: string[]; native: Set<string>; source: string }

const APP = join(process.cwd(), "src", "app")
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
const UUID = "0198a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b"

const SERVER = join(process.cwd(), "src", "server")
const FORWARDING = /proxyToLaravel|laravelFallback|LARAVEL_FALLBACK|LARAVEL_URL|NeedsLaravel|\.forward\(|x-forwarded-host/

function serverFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return serverFiles(path)
    return entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [path] : []
  })
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === "route.ts" ? [path] : []
  })
}

function nativeMethods(source: string): Set<string> {
  const native = new Set<string>()
  for (const match of source.matchAll(/export (?:async )?function (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)) native.add(match[1])
  for (const block of source.matchAll(/export \{([^}]*)\}/g)) {
    for (const alias of block[1].matchAll(/(\w+) as (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)) {
      if (alias[1] !== "proxyToLaravel" && alias[1] !== "unmatchedRouteHandler" && alias[1] !== "laravelFallback") native.add(alias[2])
    }
  }
  return native
}

const NEXT_ROUTES: NextRoute[] = routeFiles(APP).map((file) => {
  const source = readFileSync(file, "utf8")
  const segments = relative(APP, file).split(sep).slice(0, -1).filter((segment) => !/^\(.*\)$/.test(segment))
  return { file: relative(process.cwd(), file), segments, native: nativeMethods(source), source }
})

const rank = (segment: string) => (segment.startsWith("[[...") ? 3 : segment.startsWith("[...") ? 2 : segment.startsWith("[") ? 1 : 0)

function nextRouteFor(path: string[]): NextRoute | null {
  const candidates = NEXT_ROUTES.filter(({ segments }) => {
    const last = segments[segments.length - 1] ?? ""
    if (rank(last) >= 2) {
      const fixed = segments.slice(0, -1)
      return path.length > fixed.length && fixed.every((segment, index) => rank(segment) === 1 || segment === path[index])
    }
    return segments.length === path.length && segments.every((segment, index) => rank(segment) === 1 || segment === path[index])
  })
  candidates.sort((left, right) => {
    for (let index = 0; index < Math.max(left.segments.length, right.segments.length); index += 1) {
      const difference = rank(left.segments[index] ?? "") - rank(right.segments[index] ?? "")
      if (difference !== 0) return difference
    }
    return 0
  })
  return candidates[0] ?? null
}

function sampleFor(name: string, where: string | undefined): string {
  if (where === undefined) return `sample-${name}`
  if (where.includes("[\\da-fA-F]{8}")) return UUID
  if (where === ".*") return "sample"
  return where.split("|")[0]
}

function samplePaths(route: ApiRoute): string[][] {
  const build = (uri: string) =>
    uri === "/" ? [] : uri.split("/").map((segment) => segment.replace(/^\{(\w+)\??\}$/, (_, name: string) => sampleFor(name, route.wheres[name])))
  if (!route.uri.includes("?}")) return [build(route.uri)]
  return [build(route.uri.replace(/\/\{\w+\?\}/g, "")), build(route.uri)]
}

describe("API contract", () => {
  const rows = API_ROUTES.flatMap((route) => route.methods.map((method) => ({ method, route })))

  it("is the committed route list, without the audit and report routes removed from the system", () => {
    expect(rows.length).toBe(203)
    expect(REMOVED_ROUTES.filter((uri) => API_ROUTES.some((route) => route.uri === uri))).toEqual([])
  })

  it.each(rows.map(({ method, route }) => [`${method} ${route.uri}`, method, route] as const))("%s has its own route handler", (key, method, route) => {
    for (const path of samplePaths(route)) {
      const next = nextRouteFor(path)
      expect(next, `${key} → /${path.join("/")}`).not.toBeNull()
      const catchAll = next !== null && rank(next.segments[next.segments.length - 1] ?? "") >= 2
      expect(catchAll, `${key} only reaches the catch-all ${next?.file}`).toBe(false)
      const served = next !== null && (next.native.has(method) || (method === "HEAD" && next.native.has("GET")))
      expect(served, `${key} is not served by ${next?.file}`).toBe(true)
    }
  })

  it("never answers with the unmatched-route handler a method that the contract dispatches on the same path", () => {
    const shadowed = NEXT_ROUTES.flatMap((route) => {
      const path = "/" + route.segments.map((segment) => (rank(segment) === 1 ? UUID : rank(segment) >= 2 ? "sample" : segment)).join("/")
      return METHODS.filter((method) => new RegExp(`unmatchedRouteHandler as ${method}\\b`).test(route.source))
        .filter((method) => routesMatching(path).some((contract) => contract.methods.includes(method)))
        .map((method) => `${method} ${path}`)
    })
    expect(shadowed).toEqual([])
  })

  it("answers the removed routes with the catch-all, which only knows the unmatched-route answer", () => {
    expect(REMOVED_ROUTES.map((uri) => nextRouteFor(uri.split("/"))?.file)).toEqual(REMOVED_ROUTES.map(() => join("src", "app", "api", "[...path]", "route.ts")))
    const catchAlls = NEXT_ROUTES.filter((route) => rank(route.segments[route.segments.length - 1] ?? "") >= 2 || route.file === join("src", "app", "api", "route.ts"))
    expect(catchAlls.map((route) => route.native.size)).toEqual(catchAlls.map(() => 0))
  })

  it("answers every method in every route file, natively or with the unmatched-route answer", () => {
    const silent = NEXT_ROUTES.flatMap((route) =>
      METHODS.filter((method) => {
        if (route.native.has(method) || (method === "HEAD" && route.native.has("GET"))) return false
        return !new RegExp(`unmatchedRouteHandler as ${method}\\b`).test(route.source)
      }).map((method) => `${method} ${route.file}`),
    )
    expect(silent).toEqual([])
  })

  it("has no forwarding to another server left in route files or server modules", () => {
    const files = [...NEXT_ROUTES.map((route) => join(process.cwd(), route.file)), ...serverFiles(SERVER)]
    expect(files.filter((file) => FORWARDING.test(readFileSync(file, "utf8"))).map((file) => relative(process.cwd(), file))).toEqual([])
  })
})
