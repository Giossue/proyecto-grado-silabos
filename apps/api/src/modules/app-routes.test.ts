// @vitest-environment node
import "reflect-metadata"
import { ModulesContainer } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { AppModule } from "../app.module"
import { configureApi, DOCS_PATH, setupSwagger } from "../bootstrap"
import { WebResponseExpressAdapter } from "../common/http/web-response.adapter"
import { PrismaService } from "../prisma/prisma.service"
import { unmatchedRoute } from "../server/http/router"
import { FallbackApiController, FallbackRootController } from "./fallback/fallback.controller"
import { PORTED_CONTROLLERS, portedHandlers, portedRoutes, ROUTE_METHODS, type PortedHandler } from "./ported-routes"

const UUID = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const BODILESS = ["GET", "HEAD", "OPTIONS"]
const HANDLERS = portedHandlers()

let app: NestExpressApplication

const samplePath = (segments: string[], value: (name: string) => string) => `/${segments.map((segment) => (segment.startsWith("[") ? value(segment.slice(1, -1)) : segment)).join("/")}`

const matches = (handler: PortedHandler, path: string) => {
  const parts = path.split("/").filter((part) => part !== "")
  return parts.length === handler.segments.length && handler.segments.every((segment, index) => segment.startsWith("[") || segment === parts[index])
}

const handles = (handler: PortedHandler, method: string) => handler.method === "ALL" || handler.method === method || (method === "HEAD" && handler.method === "GET")

type Shape = { status: number; contentType: string | null; cacheControl: string | null; allow: string | null; body: string }

async function nestShape(method: string, path: string, headers: Record<string, string> = {}): Promise<Shape> {
  let pending = request(app.getHttpServer())[method.toLowerCase() as "get"](path)
  for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value)
  const response = await (BODILESS.includes(method) ? pending : pending.send("{}")).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = []
    res.on("data", (chunk: Buffer) => chunks.push(chunk))
    res.on("end", () => done(null, Buffer.concat(chunks)))
  })
  const header = (name: string) => (response.headers[name] as string | undefined) ?? null
  return { status: response.status, contentType: header("content-type"), cacheControl: header("cache-control"), allow: header("allow"), body: Buffer.isBuffer(response.body) ? response.body.toString("utf8") : "" }
}

async function routerShape(method: string, path: string, headers: Record<string, string> = {}): Promise<Shape> {
  const response = unmatchedRoute(new Request(`http://localhost${path}`, { method, headers, body: BODILESS.includes(method) ? undefined : "{}" }))
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
    allow: response.headers.get("allow"),
    body: method === "HEAD" ? "" : await response.text(),
  }
}

beforeAll(async () => {
  vi.stubEnv("APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6399/15")
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({}).compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  setupSwagger(app)
  await app.init()
}, 60_000)

afterAll(async () => {
  await app?.close()
  vi.unstubAllEnvs()
})

describe("registered routes", () => {
  it("registers every ported controller in the app, in order, with the fallback last", () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap((module) => [...module.controllers.keys()])
    expect(controllers.slice(-2)).toEqual([FallbackApiController, FallbackRootController])
    expect(controllers.slice(0, -2)).toEqual([...PORTED_CONTROLLERS])
  })

  it("serves the public files at the root and everything else under /api/v1", () => {
    const roots = portedRoutes()
      .map((route) => route.segments.join("/"))
      .filter((path) => !path.startsWith("api/v1/"))
    expect(roots.toSorted()).toEqual(["auth/callback", "auth/keycloak", "images/silabo/[file]", "logos/facultad/[faculty]", "logos/institucion", "plantilla.schema.json"])
  })

  it("serves /images/silabo/:file from a single controller", () => {
    expect(HANDLERS.filter((handler) => handler.segments.join("/") === "images/silabo/[file]").map((handler) => `${handler.method} ${handler.controller}`)).toEqual(["GET TemplateAssetsController"])
  })

  it("never shadows a route with an earlier route of the same method", () => {
    const shadowed = HANDLERS.flatMap((handler, index) => {
      const path = samplePath(handler.segments, (name) => `sample-${name}`)
      return HANDLERS.slice(0, index)
        .filter((earlier) => earlier.segments.join("/") !== handler.segments.join("/") && (earlier.method === "ALL" || earlier.method === handler.method) && matches(earlier, path))
        .map((earlier) => `${handler.method} /${handler.segments.join("/")} (${handler.controller}) behind /${earlier.segments.join("/")} (${earlier.controller})`)
    })
    expect(shadowed).toEqual([])
  })
})

describe("unknown routes and methods", () => {
  it("answers every method a route does not serve like the contract router", async () => {
    const mismatches: string[] = []
    for (const route of portedRoutes()) {
      const path = samplePath(route.segments, () => UUID)
      for (const method of ROUTE_METHODS) {
        if (HANDLERS.some((handler) => handles(handler, method) && matches(handler, path))) continue
        const [nest, router] = [await nestShape(method, path), await routerShape(method, path)]
        if (JSON.stringify(nest) !== JSON.stringify(router)) mismatches.push(`${method} ${path}: ${JSON.stringify(nest)} != ${JSON.stringify(router)}`)
      }
    }
    expect(mismatches).toEqual([])
  }, 60_000)

  it.each([
    "/api/v1/nonexistent",
    "/api/v1",
    "/api",
    "/api/other",
    "/api/v1/admin/audit-events",
    "/api/v1/caf%C3%A9/",
    "/logos/otro",
    "/images/otra.png",
  ])("answers %s like the contract router for every method", async (path) => {
    for (const method of ROUTE_METHODS) {
      for (const headers of [{}, { accept: "application/json" }] as Record<string, string>[]) expect(await nestShape(method, path, headers), `${method} ${path}`).toEqual(await routerShape(method, path, headers))
    }
  })

  it("answers an unknown /api/v1 path with the JSON 404", async () => {
    expect(await nestShape("GET", "/api/v1/nonexistent")).toEqual({
      status: 404,
      contentType: "application/json",
      cacheControl: "no-cache, private",
      allow: null,
      body: '{"message":"The route api/v1/nonexistent could not be found."}',
    })
  })

  it("answers a wrong method on a known route with 405 and the allowed methods", async () => {
    const answer = await nestShape("PUT", "/api/v1/session")
    expect(answer.status).toBe(405)
    expect(answer.allow).toBe("GET, HEAD")
    expect(answer.body).toBe('{"message":"The PUT method is not supported for route api/v1/session. Supported methods: GET, HEAD."}')
  })
})

describe("authentication on the registered routes", () => {
  it.each([
    "/api/v1/help",
    "/api/v1/help/available",
    "/api/v1/admin/system-settings",
    "/api/v1/dashboard",
    "/api/v1/dashboard/deadline",
    "/api/v1/session",
    "/api/v1/library/reviews",
    "/api/v1/library/history",
    "/api/v1/admin/library-catalog/libraries",
    "/api/v1/teacher/library-catalog/search",
    `/api/v1/coordination/academic/curriculum/${UUID}`,
    "/api/v1/coordination/academic/teacher-assignments",
    "/api/v1/coordination/support-documents",
    "/api/v1/teacher/support-documents",
  ])("answers GET %s with 401 without a session", async (path) => {
    expect(await nestShape("GET", path, { accept: "application/json" })).toMatchObject({ status: 401, body: '{"message":"Unauthenticated."}' })
  })

  it("answers POST /api/v1/coordination/academic/parallels with 401 without a session", async () => {
    expect(await nestShape("POST", "/api/v1/coordination/academic/parallels", { accept: "application/json", "content-type": "application/json" })).toMatchObject({
      status: 401,
      body: '{"message":"Unauthenticated."}',
    })
  })

  it.each([
    ["PUT", "authentication/password"],
    ["GET", "authentication/two-factor"],
    ["POST", "authentication/two-factor"],
    ["DELETE", "authentication/two-factor"],
    ["POST", "authentication/two-factor/confirm"],
    ["POST", "authentication/two-factor/recovery-codes"],
    ["POST", "authentication/two-factor/challenge"],
    ["PUT", "authentication/formation"],
  ])("answers the removed %s /api/v1/%s with the JSON 404", async (method, path) => {
    expect(await nestShape(method, `/api/v1/${path}`, { accept: "application/json", "content-type": "application/json" })).toMatchObject({
      status: 404,
      body: `{"message":"The route api/v1/${path} could not be found."}`,
    })
  })
})

describe("OpenAPI document", () => {
  it("is served as JSON and documents every ported route", async () => {
    const response = await request(app.getHttpServer()).get(`/${DOCS_PATH}-json`)
    expect(response.status).toBe(200)
    const document = response.body as { openapi: string; paths: Record<string, Record<string, unknown>> }
    expect(document.openapi).toMatch(/^3\./)
    const documented = new Set(Object.entries(document.paths).flatMap(([path, operations]) => Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`)))
    const expected = HANDLERS.filter((handler) => handler.method !== "ALL").map((handler) => `${handler.method} /${handler.segments.map((segment) => (segment.startsWith("[") ? `{${segment.slice(1, -1)}}` : segment)).join("/")}`)
    expect(expected.filter((operation) => !documented.has(operation))).toEqual([])
    expect(Object.keys(document.paths).filter((path) => path.includes("*") || path === "/api/v1" || path === "/api")).toEqual([])
  })
})
