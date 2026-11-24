// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import * as help from "./help/route"
import * as helpAvailable from "./help/available/route"
import * as systemSettings from "./admin/system-settings/route"
import * as auditEvents from "./admin/audit-events/route"
import * as dashboard from "./dashboard/route"
import * as dashboardDeadline from "./dashboard/deadline/route"
import * as session from "./session/route"

const PASS_THROUGH = ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const
const ROUTES = [
  ["/api/v1/help", help],
  ["/api/v1/help/available", helpAvailable],
  ["/api/v1/admin/system-settings", systemSettings],
  ["/api/v1/admin/audit-events", auditEvents],
  ["/api/v1/dashboard", dashboard],
  ["/api/v1/dashboard/deadline", dashboardDeadline],
  ["/api/v1/session", session],
] as [string, Record<string, (request: Request) => Promise<Response>>][]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("operations, dashboard and identity routes", () => {
  it.each(ROUTES)("serves GET on %s and sends the rest to Laravel", async (path, module) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 405 }))
    vi.stubGlobal("fetch", fetchMock)
    for (const method of PASS_THROUGH) {
      const response = await module[method](new Request(`http://localhost:3000${path}`, { method, body: ["HEAD", "OPTIONS"].includes(method) ? undefined : "{}" }))
      expect(response.status).toBe(405)
    }
    expect(fetchMock).toHaveBeenCalledTimes(PASS_THROUGH.length)
    expect((fetchMock.mock.calls as unknown as [string][])[1][0]).toBe(`http://127.0.0.1:8001${path}`)
    expect(module.GET).not.toBe(module.POST)
  })

  it.each(ROUTES)("answers 401 in Next on %s without a stateful Referer", async (path, module) => {
    vi.stubEnv("LARAVEL_APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    const response = await module.GET(new Request(`http://localhost:3000${path}`, { headers: { accept: "application/json" } }))
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
  })
})
