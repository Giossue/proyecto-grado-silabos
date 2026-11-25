// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { HTTP_ERROR_PAGE, NOT_FOUND_PAGE } from "./errorPages"
import { unmatchedRoute, routesMatching, modelNotFound, routeAllows, unknownRoute } from "./router"

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

describe("routesMatching", () => {
  it("honours optional parameters and where constraints like Laravel's compiled routes", () => {
    expect(routesMatching("/api/v1/admin/academic").flatMap((route) => route.methods)).toEqual(["GET", "HEAD"])
    expect(routesMatching("/api/v1/admin/academic/carrera").flatMap((route) => route.methods).sort()).toEqual(["GET", "HEAD", "POST"])
    expect(routesMatching("/api/v1/admin/system-settings/ia").flatMap((route) => route.methods)).toEqual(["PUT"])
    expect(routesMatching("/api/v1/admin/system-settings/otra")).toEqual([])
    expect(routesMatching("/api/v1/coordination/academic/curriculum/no-uuid")).toEqual([])
  })

  it("lets \\d in a where constraint match any Unicode digit, like PCRE with the u modifier", () => {
    expect(routesMatching("/api/v1/teacher/history/\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661-1111-1111-1111-111111111111")).toHaveLength(1)
  })

  it("tells whether Laravel has a route for the request's path and method", () => {
    const id = "0198a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b"
    expect(routeAllows(new Request(`${base}/api/v1/coordination/academic/parallels/${id}`, { method: "PATCH" }))).toBe(true)
    expect(routeAllows(new Request(`${base}/api/v1/coordination/academic/parallels/no-uuid`, { method: "PATCH" }))).toBe(false)
    expect(routeAllows(new Request(`${base}/api/v1/coordination/academic/parallels/${id}`, { method: "POST" }))).toBe(false)
  })
})

describe("unmatchedRoute", () => {
  it("answers an unknown API route with Laravel's production 404 JSON", async () => {
    expect(await snapshot(unmatchedRoute(request("GET", "/api/v1/nope")))).toEqual({
      status: 404,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: null,
      body: '{"message":"The route api/v1/nope could not be found."}',
    })
  })

  it("treats the bare /api path as a route outside the API, like Request::is('api/*')", async () => {
    expect((await snapshot(unmatchedRoute(request("GET", "/api")))).body).toBe(NOT_FOUND_PAGE)
    expect((await snapshot(unmatchedRoute(request("GET", "/api", { accept: "application/json" })))).body).toBe('{"message":"The route api could not be found."}')
  })

  it("answers an unknown route outside the API with Laravel's HTML 404 page unless JSON is expected", async () => {
    expect(await snapshot(unmatchedRoute(request("GET", "/sanctum/nope")))).toEqual({
      status: 404,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache, private",
      allow: null,
      body: NOT_FOUND_PAGE,
    })
    expect((await snapshot(unmatchedRoute(request("GET", "/sanctum/nope", { accept: "application/json" })))).body).toBe(
      '{"message":"The route sanctum/nope could not be found."}',
    )
  })

  it("answers a known path with another method with Laravel's 405 and its Allow header", async () => {
    expect(await snapshot(unmatchedRoute(request("PUT", "/api/v1/session")))).toEqual({
      status: 405,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: "GET, HEAD",
      body: '{"message":"The PUT method is not supported for route api/v1/session. Supported methods: GET, HEAD."}',
    })
    expect((await snapshot(unmatchedRoute(request("DELETE", "/api/v1/admin/academic/carrera")))).body).toBe(
      '{"message":"The DELETE method is not supported for route api/v1/admin/academic/carrera. Supported methods: GET, HEAD, POST."}',
    )
  })

  it("renders Symfony's HTML 405 page outside the API", async () => {
    expect(await snapshot(unmatchedRoute(request("PUT", "/logos/institucion")))).toEqual({
      status: 405,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache, private",
      allow: "GET, HEAD",
      body: HTTP_ERROR_PAGE.replaceAll("{{status}}", "405").replaceAll("{{text}}", "Method Not Allowed"),
    })
  })

  it("answers OPTIONS on a known path with 200 and the comma-joined methods, like Laravel's router", async () => {
    expect(await snapshot(unmatchedRoute(request("OPTIONS", "/api/v1/session")))).toEqual({
      status: 200,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache, private",
      allow: "GET,HEAD",
      body: "",
    })
    expect((await snapshot(unmatchedRoute(request("OPTIONS", "/api/v1/nope")))).status).toBe(404)
  })

  it("keeps the raw path of the request in the message, as Request::path() does", async () => {
    expect((await snapshot(unmatchedRoute(request("GET", "/api/v1/caf%C3%A9/")))).body).toBe(
      '{"message":"The route api/v1/caf%C3%A9 could not be found."}',
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
      body: '{"message":"No query results for model [App\\\\Models\\\\User] abc"}',
    })
  })
})

describe("Auditoría and Reportes removed from the system", () => {
  const removed = ["api/v1/admin/audit-events", "api/v1/admin/audit-events/export", "api/v1/admin/reports", "api/v1/admin/reports/export"]

  it("no longer lists their routes, so every method is an unknown route", () => {
    for (const path of removed) expect(routesMatching(`/${path}`)).toEqual([])
  })

  it.each(removed)("answers %s with Laravel's production 404", async (path) => {
    for (const method of ["GET", "HEAD", "POST", "DELETE", "OPTIONS"]) {
      for (const variant of [`/${path}`, `/${path}?period=1`, `/${path.replace("admin/", "admin%2F").replace(/-/g, "%2D")}`]) {
        expect(await snapshot(unmatchedRoute(request(method, variant)))).toEqual(await snapshot(unknownRoute(request(method, variant))))
      }
    }
    expect(await snapshot(unmatchedRoute(request("GET", `/${path}`)))).toEqual({
      status: 404,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: null,
      body: `{"message":"The route ${path} could not be found."}`,
    })
  })
})
