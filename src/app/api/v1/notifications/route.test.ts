// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { nativeMethods, routerComparison } from "@/server/http/routerTesting"
import * as notifications from "./route"
import * as emailPreferences from "./email-preferences/route"
import * as readAll from "./read-all/route"
import * as markRead from "./[notification]/read/route"
import * as open from "./[notification]/open/route"

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS"
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
  ] as [string, Record<string, unknown>, Method[]][])("answers the methods Next does not serve on %s like Laravel's router", async (path, module, others) => {
    const fetchMock = vi.fn(async () => new Response('{"message":"from laravel"}', { status: 405 }))
    vi.stubGlobal("fetch", fetchMock)
    const served = ALL.filter((method) => !others.includes(method))
    for (const method of nativeMethods(module, served, others)) {
      const { next, unmatched } = await routerComparison(module, method, path, { notification: NOTIFICATION })
      expect(next).toEqual(unmatched)
    }
    expect(fetchMock).not.toHaveBeenCalled()
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
