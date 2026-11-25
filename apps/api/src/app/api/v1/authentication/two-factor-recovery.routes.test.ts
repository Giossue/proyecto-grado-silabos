// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { nativeMethods, routerComparison } from "@/server/http/routerTesting"
import * as twoFactor from "./two-factor/route"
import * as confirm from "./two-factor/confirm/route"
import * as recoveryCodes from "./two-factor/recovery-codes/route"
import * as challenge from "./two-factor/challenge/route"
import * as passwordReset from "./password-reset/route"
import * as accountActivation from "./account-activation/route"

type Module = Record<string, (request: Request) => Promise<Response>>

const ROUTES: [string, Module, string[], string[]][] = [
  ["/api/v1/authentication/two-factor", twoFactor as Module, ["GET", "POST", "DELETE"], ["HEAD", "PUT", "PATCH", "OPTIONS"]],
  ["/api/v1/authentication/two-factor/confirm", confirm as Module, ["POST"], ["HEAD", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"]],
  ["/api/v1/authentication/two-factor/recovery-codes", recoveryCodes as Module, ["POST"], ["HEAD", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"]],
  ["/api/v1/authentication/two-factor/challenge", challenge as Module, ["POST"], ["HEAD", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"]],
  ["/api/v1/authentication/password-reset", passwordReset as Module, ["POST"], ["HEAD", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"]],
  ["/api/v1/authentication/account-activation", accountActivation as Module, ["POST"], ["HEAD", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"]],
]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("two-factor, password reset and account activation routes", () => {
  it.each(ROUTES)("answers the methods Next does not serve on %s like Laravel's router", async (path, module, served, others) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 405 }))
    vi.stubGlobal("fetch", fetchMock)
    const unserved = nativeMethods(module, served, others)
    for (const method of unserved) {
      const { next, unmatched } = await routerComparison(module, method, path)
      expect(next).toEqual(unmatched)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    for (const method of served) expect(unserved.map((name) => module[name])).not.toContain(module[method])
  })

  it.each(ROUTES.filter(([path]) => !path.endsWith("/challenge") && !path.endsWith("-reset") && !path.endsWith("-activation")))(
    "answers 401 in Next on %s without a stateful Referer",
    async (path, module, served) => {
      vi.stubEnv("APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
      const method = served.includes("GET") ? "GET" : "POST"
      const response = await module[method](new Request(`http://localhost:3000${path}`, { method, headers: { accept: "application/json" } }))
      expect(response.status).toBe(401)
      expect(await response.text()).toBe('{"message":"Unauthenticated."}')
    },
  )

  it("answers 400 in Next on the challenge without the web app", async () => {
    vi.stubEnv("APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    const response = await challenge.POST(new Request("http://localhost:3000/api/v1/authentication/two-factor/challenge", { method: "POST", headers: { accept: "application/json" } }))
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"message":"Inicie sesión desde la aplicación web."}')
  })
})
