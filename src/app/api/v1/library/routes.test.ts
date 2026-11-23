// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import * as reviews from "./reviews/route"
import * as history from "./history/route"
import * as libraries from "../admin/library-catalog/libraries/route"
import * as search from "../teacher/library-catalog/search/route"

const PASS_THROUGH = ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("library routes", () => {
  it.each([
    ["/api/v1/library/reviews", reviews],
    ["/api/v1/library/history", history],
    ["/api/v1/admin/library-catalog/libraries", libraries],
    ["/api/v1/teacher/library-catalog/search", search],
  ] as [string, Record<string, (request: Request) => Promise<Response>>][])("serves GET on %s and sends the rest to Laravel", async (path, module) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 405 }))
    vi.stubGlobal("fetch", fetchMock)
    for (const method of PASS_THROUGH) {
      const response = await module[method](new Request(`http://localhost:3000${path}`, { method, body: ["HEAD", "OPTIONS"].includes(method) ? undefined : "{}" }))
      expect(response.status).toBe(405)
    }
    expect(fetchMock).toHaveBeenCalledTimes(PASS_THROUGH.length)
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe(`http://127.0.0.1:8001${path}`)
    expect(module.GET).not.toBe(module.POST)
  })

  it("answers 401 in Next without a stateful Referer", async () => {
    vi.stubEnv("LARAVEL_APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    const response = await reviews.GET(new Request("http://localhost:3000/api/v1/library/reviews", { headers: { accept: "application/json" } }))
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
  })
})
