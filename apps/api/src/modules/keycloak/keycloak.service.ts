import { randomBytes } from "node:crypto"
import { Inject, Injectable } from "@nestjs/common"
import { createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { z } from "zod"
import { controllerJson } from "../../server/auth/controllerResponse"
import { withSetCookies } from "../../server/auth/cookieQueue"
import { answerFor } from "../../server/identity/authentication"
import { IdentityDeps } from "../auth/identity.deps"
import { cookieValue, serializeCookie } from "./keycloak.cookies"
import type { EnabledKeycloakSettings, KeycloakSettings } from "./keycloak.config"
import type { KeycloakOidc } from "./keycloak.oidc"
import type { KeycloakStore } from "./keycloak.store"
import { KEYCLOAK_OIDC, KEYCLOAK_SETTINGS, KEYCLOAK_STORE } from "./keycloak.tokens"

export const FLOW_SECONDS = 600
export const LOGOUT_HINT_SECONDS = 7 * 24 * 60 * 60
export const NO_ACCOUNT = "keycloak_sin_cuenta"
export const FAILED = "keycloak_error"

class NoAccount extends Error {}

const signInVerifiedUser = createAuthEndpoint("/keycloak/sign-in", { method: "POST", body: z.object({ userId: z.string() }), metadata: { SERVER_ONLY: true } }, async (ctx) => {
  const session = await ctx.context.internalAdapter.createSession(ctx.body.userId)
  const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId)
  if (!session || !user) throw new Error("The Keycloak session could not be created.")
  await setSessionCookie(ctx, { session, user })
  return { id: session.id, token: session.token }
})

const redirect = (location: string, cookies: string[] = []): Response => {
  const response = new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } })
  for (const cookie of cookies) response.headers.append("set-cookie", cookie)
  return response
}

@Injectable()
export class KeycloakService {
  constructor(
    @Inject(KEYCLOAK_SETTINGS) private readonly settings: KeycloakSettings,
    @Inject(KEYCLOAK_OIDC) private readonly oidc: KeycloakOidc | null,
    @Inject(KEYCLOAK_STORE) private readonly store: KeycloakStore,
    @Inject(IdentityDeps) private readonly identity: IdentityDeps,
  ) {}

  get enabled(): boolean {
    return this.settings.enabled && this.oidc !== null
  }

  async begin(): Promise<Response> {
    const { settings, oidc } = this.active()
    const { url, flow } = await oidc.authorization()
    const id = randomBytes(32).toString("base64url")
    await this.store.putFlow(id, flow, FLOW_SECONDS)
    return redirect(url.href, [this.flowCookie(settings, id, FLOW_SECONDS)])
  }

  async complete(web: Request): Promise<Response> {
    const { settings, oidc } = this.active()
    const cleared = this.flowCookie(settings, "", 0)
    try {
      const id = cookieValue(web.headers.get("cookie"), settings.flowCookie)
      const flow = id ? await this.store.takeFlow(id) : null
      if (flow === null) throw new Error("The Keycloak login flow expired or is unknown.")
      const callback = new URL(settings.redirectUri)
      callback.search = new URL(web.url).search
      const { email, idToken } = await oidc.identity(callback, flow)
      if (email === null) throw new NoAccount()
      const credential = await this.identity.set.authentication.credentials.findActiveUserByEmail(email.trim().toLowerCase())
      if (credential === null) throw new NoAccount()
      const session = await this.signIn(credential.id, web)
      if (idToken !== null) await this.store.putLogout(session.id, idToken, LOGOUT_HINT_SECONDS)
      return redirect(settings.homeUrl, [cleared, ...session.cookies])
    } catch (error) {
      if (error instanceof NoAccount) return redirect(`${settings.loginUrl}?error=${NO_ACCOUNT}`, [cleared])
      console.error(JSON.stringify({ message: "keycloak-login-failed", error: error instanceof Error ? `${error.name}: ${error.message}` : "unknown" }))
      return redirect(`${settings.loginUrl}?error=${FAILED}`, [cleared])
    }
  }

  async logout(web: Request, run: () => Promise<Response>): Promise<Response> {
    if (!this.enabled) return run()
    const bridge = this.identity.set.authentication.bridge
    const current = await bridge.sessions.resolve(web).catch(() => null)
    const response = await run()
    if (current === null || response.status !== 204) return response
    const idToken = await this.store.takeLogout(current.id)
    if (idToken === null) return response
    const url = await this.active().oidc.endSession(idToken)
    return withSetCookies(controllerJson({ logout_url: url.href }, 200), response.headers.getSetCookie())
  }

  private async signIn(userId: string, web: Request): Promise<{ id: string; cookies: string[] }> {
    const authentication = this.identity.set.authentication
    const { headers, response } = await signInVerifiedUser({ body: { userId }, headers: web.headers, context: await authentication.auth().$context, returnHeaders: true })
    const resolved = await authentication.bridge.sessions.find(response.token)
    if (resolved === null) throw new Error("The new session was not stored.")
    await answerFor(resolved, authentication)
    return { id: response.id, cookies: headers.getSetCookie() }
  }

  private flowCookie(settings: EnabledKeycloakSettings, value: string, maxAge: number): string {
    return serializeCookie(settings.flowCookie, value, { maxAge, path: "/auth", httpOnly: true, secure: settings.secureCookies, sameSite: "lax" })
  }

  private active(): { settings: EnabledKeycloakSettings; oidc: KeycloakOidc } {
    if (!this.settings.enabled || this.oidc === null) throw new Error("Keycloak login is disabled.")
    return { settings: this.settings, oidc: this.oidc }
  }
}
