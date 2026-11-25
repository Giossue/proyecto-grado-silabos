// @vitest-environment node
import { readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { portedRoutes } from "../ported-routes"
import { matchLegacyRoute } from "./legacy-router"
import { LEGACY_ROUTES } from "./legacy-routes"

const APP = join(process.cwd(), "src", "app")

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === "route.ts" ? [relative(APP, directory).split(sep).join("/")] : []
  })
}

describe("legacy route registry", () => {
  it("lists every route handler that is still on disk, and only those", () => {
    expect(LEGACY_ROUTES.map((route) => route.path).toSorted()).toEqual(routeFiles(APP).toSorted())
  })

  it("has no route handler left for a route Nest already serves", () => {
    const ported = portedRoutes().map((route) => route.segments.join("/"))
    expect(LEGACY_ROUTES.filter((route) => ported.includes(route.path)).map((route) => route.path)).toEqual([])
  })

  it("prefers static segments over parameters and parameters over catch-alls, like Next", () => {
    expect(matchLegacyRoute(LEGACY_ROUTES, "/api/v1/admin/template/assistant")?.route.path).toBe("api/v1/admin/template/assistant")
    expect(matchLegacyRoute(LEGACY_ROUTES, "/api/v1/admin/template/abc")?.route.path).toBe("api/v1/admin/template/[template]")
    expect(matchLegacyRoute(LEGACY_ROUTES, "/api/v1/admin/audit-events")?.route.path).toBe("api/[...path]")
    expect(matchLegacyRoute(LEGACY_ROUTES, "/api")?.route.path).toBe("api")
    expect(matchLegacyRoute(LEGACY_ROUTES, "/api/v1/academic/asignaturas/x%20y/ficha")?.params).toEqual({ asignatura: "x y" })
    expect(matchLegacyRoute(LEGACY_ROUTES, "/api/v1/notifications")?.route.path).toBe("api/[...path]")
  })
})
