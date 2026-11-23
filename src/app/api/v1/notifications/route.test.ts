// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import * as notifications from "./route"
import * as emailPreferences from "./email-preferences/route"
import * as readAll from "./read-all/route"
import * as markRead from "./[notification]/read/route"
import * as open from "./[notification]/open/route"

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS"
type Handler = (request: Request, context: { params: Promise<{ notification: string }> }) => Promise<Response>
const ALL: Method[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
const except = (...served: Method[]) => ALL.filter((method) => !served.includes(method))
const NOTIFICATION = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e6f"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("notification routes", () => {
  it.each([
    ["/api/v1/notifications", notifications, except("GET")],
    ["/api/v1/notifications/email-preferences", emailPreferences, except("GET", "PUT")],
    ["/api/v1/notifications/read-all", readAll, except("POST")],
    [`/api/v1/notifications/${NOTIFICATION}/read`, markRead, except("POST")],
    [`/api/v1/notifications/${NOTIFICATION}/open`, open, except("POST")],
  ] as [string, Record<string, unknown>, Method[]][])("sends the methods Next does not serve on %s to Laravel unchanged", async (path, module, passThrough) => {
    const fetchMock = vi.fn(async () => new Response('{"message":"from laravel"}', { status: 405, headers: { "set-cookie": "a=1", "content-length": "26" } }))
    vi.stubGlobal("fetch", fetchMock)
    for (const method of passThrough) {
      const handler = module[method] as Handler
      const request = new Request(`http://localhost:3000${path}?x=1`, {
        method,
        headers: { host: "localhost:3000", cookie: "c=1", "x-xsrf-token": "t" },
        body: ["GET", "HEAD", "OPTIONS"].includes(method) ? undefined : "{}",
      })
      const response = await handler(request, { params: Promise.resolve({ notification: NOTIFICATION }) })
      expect(response.status).toBe(405)
      expect(response.headers.get("set-cookie")).toBe("a=1")
    }
    expect(fetchMock).toHaveBeenCalledTimes(passThrough.length)
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    const [target, init] = calls[1]
    expect(target).toBe(`http://127.0.0.1:8001${path}?x=1`)
    expect(init.method).toBe(passThrough[1])
    const headers = new Headers(init.headers)
    expect(headers.get("cookie")).toBe("c=1")
    expect(headers.get("x-xsrf-token")).toBe("t")
    expect(headers.get("x-forwarded-host")).toBe("localhost:3000")
    expect(headers.has("host")).toBe(false)
  })

  it("serves the ported methods in Next", () => {
    expect(notifications.GET).not.toBe(notifications.POST)
    expect(emailPreferences.GET).not.toBe(emailPreferences.POST)
    expect(emailPreferences.PUT).not.toBe(emailPreferences.POST)
    expect(readAll.POST).not.toBe(readAll.GET)
    expect(markRead.POST).not.toBe(markRead.GET)
    expect(open.POST).not.toBe(open.GET)
  })
})
