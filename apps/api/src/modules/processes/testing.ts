import "reflect-metadata"
import type { DynamicModule, InjectionToken, Type } from "@nestjs/common"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { sessionCookie } from "../../server/auth/testing"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { LegacyModule } from "../legacy/legacy.module"

export const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const HEADERS = ["content-type", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-ratelimit-reset", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy", "cross-origin-resource-policy"]

export type Call = { method: string; path: string; body?: unknown; raw?: string; cookie?: boolean; headers?: Record<string, string> }
export type Answer = { status: number; body: string; headers: Record<string, string | null>; effects: unknown }
type Reply = Omit<Answer, "effects">

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/admin",
    "x-csrf-token": golden.csrfToken,
    ...(call.cookie === false ? {} : { cookie: COOKIE }),
    ...(call.body === undefined && call.raw === undefined ? {} : { "content-type": "application/json" }),
    ...call.headers,
  }
}

const payloadOf = (call: Call) => call.raw ?? (call.body === undefined ? undefined : JSON.stringify(call.body))

export function legacyRequest(call: Call): Request {
  return new Request(new URL(call.path, "http://localhost:3000"), { method: call.method, headers: headersOf(call), body: payloadOf(call) })
}

async function legacyReply(response: Response): Promise<Reply> {
  return { status: response.status, body: await response.text(), headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])) }
}

async function nestReply(app: NestExpressApplication, call: Call): Promise<Reply> {
  let pending = request(app.getHttpServer())[call.method.toLowerCase() as "get"](call.path)
  for (const [name, value] of Object.entries({ ...headersOf(call), "x-forwarded-host": "localhost:3000" })) pending = pending.set(name, value)
  const payload = payloadOf(call)
  const response = await (payload === undefined ? pending : pending.send(payload))
  const header = (name: string) => {
    const value = response.headers[name] as string | string[] | undefined
    return value === undefined ? null : Array.isArray(value) ? value.join(", ") : value
  }
  return { status: response.status, body: response.text ?? "", headers: Object.fromEntries(HEADERS.map((name) => [name, header(name)])) }
}

export type Harness = {
  reset: () => void
  legacy: (web: Request) => Promise<Response>
  effects: () => unknown
  app: () => NestExpressApplication
}

export async function bothSides(harness: Harness, calls: Call[]): Promise<{ legacy: Answer[]; nest: Answer[] }> {
  const run = async (send: (call: Call) => Promise<Reply>) => {
    harness.reset()
    const answers: Answer[] = []
    for (const call of calls) answers.push({ ...(await send(call)), effects: structuredClone(harness.effects()) })
    return answers
  }
  return { legacy: await run(async (call) => legacyReply(await harness.legacy(legacyRequest(call)))), nest: await run((call) => nestReply(harness.app(), call)) }
}

export async function equivalenceApp(module: Type<unknown> | DynamicModule, overrides: [InjectionToken, unknown][]): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AuthModule, module, LegacyModule] })
    .overrideProvider(PrismaService)
    .useValue({})
  for (const [token, value] of overrides) builder = builder.overrideProvider(token).useValue(value)
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
  return app
}
