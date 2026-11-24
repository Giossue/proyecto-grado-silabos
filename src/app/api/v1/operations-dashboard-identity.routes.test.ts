// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { nativeMethods, routerComparison } from "@/server/laravel/routerTesting"
import * as help from "./help/route"
import * as helpAvailable from "./help/available/route"
import * as systemSettings from "./admin/system-settings/route"
import * as dashboard from "./dashboard/route"
import * as dashboardDeadline from "./dashboard/deadline/route"
import * as session from "./session/route"

const PASS_THROUGH = ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const
const ROUTES = [
  ["/api/v1/help", help],
  ["/api/v1/help/available", helpAvailable],
  ["/api/v1/admin/system-settings", systemSettings],
  ["/api/v1/dashboard", dashboard],
  ["/api/v1/dashboard/deadline", dashboardDeadline],
  ["/api/v1/session", session],
] as [string, Record<string, (request: Request) => Promise<Response>>][]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("operations, dashboard and identity routes", () => {
  it.each(ROUTES)("serves GET on %s and answers the rest like Laravel's router", async (path, module) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 405 }))
    vi.stubGlobal("fetch", fetchMock)
    for (const method of nativeMethods(module, ["GET"], [...PASS_THROUGH])) {
      const { next, laravel } = await routerComparison(module, method, path)
      expect(next).toEqual(laravel)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(module.GET).not.toBe(module.POST)
  })

  it.each(ROUTES)("answers 401 in Next on %s without a stateful Referer", async (path, module) => {
    vi.stubEnv("LARAVEL_APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    const response = await module.GET(new Request(`http://localhost:3000${path}`, { headers: { accept: "application/json" } }))
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
  })
})
