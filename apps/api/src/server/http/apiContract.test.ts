// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { portedRoutes } from "../../modules/ported-routes"
import { API_ROUTES, REMOVED_ROUTES, type ApiRoute } from "./router"

type NestRoute = { file: string; segments: string[]; native: Set<string> }

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

const NEST_ROUTES: NestRoute[] = portedRoutes().map((route) => ({ file: `nest:${route.controller}`, segments: route.segments, native: new Set(route.methods) }))

const rank = (segment: string) => (segment.startsWith("[[...") ? 3 : segment.startsWith("[...") ? 2 : segment.startsWith("[") ? 1 : 0)

function nestRouteFor(path: string[]): NestRoute | null {
  const candidates = NEST_ROUTES.filter(({ segments }) => {
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

  it("is the committed route list, without the audit, report, two-factor, password change, teacher formation, open sessions and accessibility routes removed from the system", () => {
    expect(rows.length).toBe(229)
    expect(REMOVED_ROUTES.filter((uri) => API_ROUTES.some((route) => route.uri === uri))).toEqual([])
  })

  it.each(rows.map(({ method, route }) => [`${method} ${route.uri}`, method, route] as const))("%s has its own route handler", (key, method, route) => {
    for (const path of samplePaths(route)) {
      const route = nestRouteFor(path)
      expect(route, `${key} → /${path.join("/")}`).not.toBeNull()
            const served = route !== null && (route.native.has(method) || (method === "HEAD" && route.native.has("GET")))
      expect(served, `${key} is not served by ${route?.file}`).toBe(true)
    }
  })

  it("serves no route the contract removed, so they reach the unmatched-route answer", () => {
    expect(REMOVED_ROUTES.map((uri) => nestRouteFor(uri.split("/"))?.file ?? null)).toEqual(REMOVED_ROUTES.map(() => null))
  })

  it("has no forwarding to another server left in server modules", () => {
    const files = serverFiles(SERVER)
    expect(files.filter((file) => FORWARDING.test(readFileSync(file, "utf8"))).map((file) => relative(process.cwd(), file))).toEqual([])
  })
})
