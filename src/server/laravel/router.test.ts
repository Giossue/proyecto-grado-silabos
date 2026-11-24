// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { HTTP_ERROR_PAGE, NOT_FOUND_PAGE } from "./errorPages"
import { proxyToLaravel } from "./proxy"
import { laravelFallbackEnabled, laravelRouter, laravelRoutesMatching, modelNotFound, routeAllows, unknownRoute } from "./router"

const base = "http://localhost:3000"

function request(method: string, path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${base}${path}`, { method, headers })
}

async function snapshot(response: Response) {
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
    allow: response.headers.get("allow"),
    body: await response.text(),
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("laravelRoutesMatching", () => {
  it("honours optional parameters and where constraints like Laravel's compiled routes", () => {
    expect(laravelRoutesMatching("/api/v1/admin/academic").flatMap((route) => route.methods)).toEqual(["GET", "HEAD"])
    expect(laravelRoutesMatching("/api/v1/admin/academic/carrera").flatMap((route) => route.methods).sort()).toEqual(["GET", "HEAD", "POST"])
    expect(laravelRoutesMatching("/api/v1/admin/system-settings/ia").flatMap((route) => route.methods)).toEqual(["PUT"])
    expect(laravelRoutesMatching("/api/v1/admin/system-settings/otra")).toEqual([])
    expect(laravelRoutesMatching("/api/v1/coordination/academic/curriculum/no-uuid")).toEqual([])
  })

  it("lets \\d in a where constraint match any Unicode digit, like PCRE with the u modifier", () => {
    expect(laravelRoutesMatching("/api/v1/teacher/history/\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661-1111-1111-1111-111111111111")).toHaveLength(1)
  })

  it("tells whether Laravel has a route for the request's path and method", () => {
    const id = "0198a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b"
    expect(routeAllows(new Request(`${base}/api/v1/coordination/academic/parallels/${id}`, { method: "PATCH" }))).toBe(true)
    expect(routeAllows(new Request(`${base}/api/v1/coordination/academic/parallels/no-uuid`, { method: "PATCH" }))).toBe(false)
    expect(routeAllows(new Request(`${base}/api/v1/coordination/academic/parallels/${id}`, { method: "POST" }))).toBe(false)
  })
})

describe("laravelRouter", () => {
  it("answers an unknown API route with Laravel's production 404 JSON", async () => {
    expect(await snapshot(laravelRouter(request("GET", "/api/v1/nope")))).toEqual({
      status: 404,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: null,
      body: '{\n    "message": "The route api/v1/nope could not be found."\n}',
    })
  })

  it("treats the bare /api path as a route outside the API, like Request::is('api/*')", async () => {
    expect((await snapshot(laravelRouter(request("GET", "/api")))).body).toBe(NOT_FOUND_PAGE)
    expect((await snapshot(laravelRouter(request("GET", "/api", { accept: "application/json" })))).body).toBe('{\n    "message": "The route api could not be found."\n}')
  })

  it("answers an unknown route outside the API with Laravel's HTML 404 page unless JSON is expected", async () => {
    expect(await snapshot(laravelRouter(request("GET", "/sanctum/nope")))).toEqual({
      status: 404,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache, private",
      allow: null,
      body: NOT_FOUND_PAGE,
    })
    expect((await snapshot(laravelRouter(request("GET", "/sanctum/nope", { accept: "application/json" })))).body).toBe(
      '{\n    "message": "The route sanctum/nope could not be found."\n}',
    )
  })

  it("answers a known path with another method with Laravel's 405 and its Allow header", async () => {
    expect(await snapshot(laravelRouter(request("PUT", "/api/v1/session")))).toEqual({
      status: 405,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: "GET, HEAD",
      body: '{\n    "message": "The PUT method is not supported for route api/v1/session. Supported methods: GET, HEAD."\n}',
    })
    expect((await snapshot(laravelRouter(request("DELETE", "/api/v1/admin/academic/carrera")))).body).toBe(
      '{\n    "message": "The DELETE method is not supported for route api/v1/admin/academic/carrera. Supported methods: GET, HEAD, POST."\n}',
    )
  })

  it("renders Symfony's HTML 405 page outside the API", async () => {
    expect(await snapshot(laravelRouter(request("PUT", "/sanctum/csrf-cookie")))).toEqual({
      status: 405,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache, private",
      allow: "GET, HEAD",
      body: HTTP_ERROR_PAGE.replaceAll("{{status}}", "405").replaceAll("{{text}}", "Method Not Allowed"),
    })
  })

  it("answers OPTIONS on a known path with 200 and the comma-joined methods, like Laravel's router", async () => {
    expect(await snapshot(laravelRouter(request("OPTIONS", "/api/v1/session")))).toEqual({
      status: 200,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache, private",
      allow: "GET,HEAD",
      body: "",
    })
    expect((await snapshot(laravelRouter(request("OPTIONS", "/api/v1/nope")))).status).toBe(404)
  })

  it("keeps the raw path of the request in the message, as Request::path() does", async () => {
    expect((await snapshot(laravelRouter(request("GET", "/api/v1/caf%C3%A9/")))).body).toBe(
      '{\n    "message": "The route api/v1/caf%C3%A9 could not be found."\n}',
    )
  })
})

describe("modelNotFound", () => {
  it("writes the model class and the raw id like Laravel's production 404", async () => {
    expect(await snapshot(modelNotFound("App\\Models\\User", "abc"))).toEqual({
      status: 404,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: null,
      body: '{\n    "message": "No query results for model [App\\\\Models\\\\User] abc"\n}',
    })
  })
})

describe("LARAVEL_FALLBACK", () => {
  it("is on unless it is set to off", () => {
    expect(laravelFallbackEnabled()).toBe(true)
    vi.stubEnv("LARAVEL_FALLBACK", "on")
    expect(laravelFallbackEnabled()).toBe(true)
    vi.stubEnv("LARAVEL_FALLBACK", "off")
    expect(laravelFallbackEnabled()).toBe(false)
  })

  it("keeps proxyToLaravel away from Laravel when off and answers like Laravel's router for an unknown route", async () => {
    vi.stubEnv("LARAVEL_FALLBACK", "off")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const response = await proxyToLaravel(request("POST", "/api/v1/teacher/syllabi/abc/submit"))
    expect(fetch).not.toHaveBeenCalled()
    expect(await snapshot(response)).toEqual(await snapshot(unknownRoute(request("POST", "/api/v1/teacher/syllabi/abc/submit"))))
    expect(response.status).toBe(404)
  })

  it("still forwards to Laravel when on", async () => {
    vi.stubEnv("LARAVEL_URL", "http://laravel.test")
    const fetch = vi.fn(async () => new Response("ok", { status: 201 }))
    vi.stubGlobal("fetch", fetch)
    const response = await proxyToLaravel(request("GET", "/api/v1/session?x=1"))
    expect(fetch).toHaveBeenCalledWith("http://laravel.test/api/v1/session?x=1", expect.objectContaining({ method: "GET" }))
    expect(response.status).toBe(201)
  })
})
