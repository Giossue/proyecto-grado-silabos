// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import * as notifications from "./route"
import * as emailPreferences from "./email-preferences/route"

const PASS_THROUGH = ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("notification routes", () => {
  it.each([
    ["/api/v1/notifications", notifications],
    ["/api/v1/notifications/email-preferences", emailPreferences],
  ])("sends every method except GET on %s to Laravel unchanged", async (path, module) => {
    const fetchMock = vi.fn(async () => new Response('{"message":"from laravel"}', { status: 405, headers: { "set-cookie": "a=1", "content-length": "26" } }))
    vi.stubGlobal("fetch", fetchMock)
    for (const method of PASS_THROUGH) {
      const handler = module[method]
      const request = new Request(`http://localhost:3000${path}?x=1`, {
        method,
        headers: { host: "localhost:3000", cookie: "c=1", "x-xsrf-token": "t" },
        body: ["HEAD", "OPTIONS"].includes(method) ? undefined : "{}",
      })
      const response = await handler(request)
      expect(response.status).toBe(405)
      expect(response.headers.get("set-cookie")).toBe("a=1")
    }
    expect(fetchMock).toHaveBeenCalledTimes(PASS_THROUGH.length)
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    const [target, init] = calls[1]
    expect(target).toBe(`http://127.0.0.1:8001${path}?x=1`)
    expect(init.method).toBe("POST")
    const headers = new Headers(init.headers)
    expect(headers.get("cookie")).toBe("c=1")
    expect(headers.get("x-xsrf-token")).toBe("t")
    expect(headers.get("x-forwarded-host")).toBe("localhost:3000")
    expect(headers.has("host")).toBe(false)
  })

  it("serves GET in Next", () => {
    expect(typeof notifications.GET).toBe("function")
    expect(notifications.GET).not.toBe(notifications.POST)
    expect(emailPreferences.GET).not.toBe(emailPreferences.PUT)
  })
})
