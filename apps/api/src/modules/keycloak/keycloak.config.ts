import { z } from "zod"
import { frontendUrl } from "../../server/mail/config"

type Environment = Record<string, string | undefined>

export type EnabledKeycloakSettings = {
  enabled: true
  issuer: URL
  clientId: string
  clientSecret: string
  redirectUri: string
  postLogoutRedirectUri: string
  homeUrl: string
  loginUrl: string
  flowCookie: string
  secureCookies: boolean
}

export type KeycloakSettings = { enabled: false } | EnabledKeycloakSettings

export const DEFAULT_REDIRECT_URI = "http://localhost:8000/auth/callback"

const flag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1")

const keycloakEnvironment = z.object({
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().trim().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().trim().min(1),
  KEYCLOAK_REDIRECT_URI: z.url().default(DEFAULT_REDIRECT_URI),
  KEYCLOAK_POST_LOGOUT_REDIRECT_URI: z.url().optional(),
})

const blankAsMissing = (env: Environment): Environment => Object.fromEntries(Object.entries(env).map(([name, value]) => [name, value?.trim() === "" ? undefined : value]))

export function keycloakSettings(env: Environment = process.env): KeycloakSettings {
  const enabled = flag.safeParse(env.KEYCLOAK_ENABLED?.trim().toLowerCase())
  if (!enabled.success) throw new Error("KEYCLOAK_ENABLED must be true or false.")
  if (!enabled.data) return { enabled: false }
  const parsed = keycloakEnvironment.safeParse(blankAsMissing(env))
  if (!parsed.success) throw new Error(`Invalid Keycloak configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}.`)
  const web = frontendUrl(env).replace(/\/+$/, "")
  const loginUrl = `${web}/ingresar`
  return {
    enabled: true,
    issuer: new URL(parsed.data.KEYCLOAK_ISSUER),
    clientId: parsed.data.KEYCLOAK_CLIENT_ID,
    clientSecret: parsed.data.KEYCLOAK_CLIENT_SECRET,
    redirectUri: parsed.data.KEYCLOAK_REDIRECT_URI,
    postLogoutRedirectUri: parsed.data.KEYCLOAK_POST_LOGOUT_REDIRECT_URI ?? loginUrl,
    homeUrl: `${web}/rol`,
    loginUrl,
    flowCookie: `${env.SESSION_COOKIE_PREFIX ?? "silabos-ueb"}.keycloak_flow`,
    secureCookies: env.APP_ENV === "production",
  }
}
