import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { generateRandomString } from "better-auth/crypto"
import { twoFactor } from "better-auth/plugins"
import { db } from "@/db"
import { authTables } from "./authTables"
import { bcryptHash, bcryptVerify } from "./bcrypt"

export const INACTIVE_ACCOUNT = "La cuenta está desactivada."
export const RECOVERY_CODE_COUNT = 8
export const SESSION_REFRESH_SECONDS = 60
const TWO_FACTOR_CHALLENGE_SECONDS = 600

export type Environment = Record<string, string | undefined>

export type AuthSettings = {
  appName: string
  secret: string
  baseURL: string
  trustedOrigins: string[]
  lifetimeMinutes: number
  bcryptRounds: number
  cookiePrefix: string
}

export function statefulDomains(env: Environment = process.env): string[] {
  return (env.STATEFUL_DOMAINS ?? "localhost:3000")
    .split(",")
    .map((domain) => domain.trim())
    .filter((domain) => domain !== "")
}

export function trustedOriginsOf(domains: string[]): string[] {
  return domains.flatMap((domain) => [`http://${domain}`, `https://${domain}`])
}

export function sessionLifetimeMinutes(env: Environment = process.env): number {
  const minutes = Number(env.SESSION_LIFETIME ?? 240)
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 240
}

export function authSettings(env: Environment = process.env): AuthSettings {
  const secret = env.BETTER_AUTH_SECRET ?? ""
  if (secret === "") throw new Error("BETTER_AUTH_SECRET is not configured.")
  const domains = statefulDomains(env)
  return {
    appName: env.APP_NAME ?? "Sílabos UEB",
    secret,
    baseURL: env.BETTER_AUTH_URL || env.FRONTEND_URL?.split(",")[0]?.trim() || `http://${domains[0] ?? "localhost:3000"}`,
    trustedOrigins: trustedOriginsOf(domains),
    lifetimeMinutes: sessionLifetimeMinutes(env),
    bcryptRounds: Number.parseInt(env.BCRYPT_ROUNDS ?? "12", 10),
    cookiePrefix: env.SESSION_COOKIE_PREFIX ?? "silabos-ueb",
  }
}

export function recoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => `${generateRandomString(10, "a-z", "A-Z", "0-9")}-${generateRandomString(10, "a-z", "A-Z", "0-9")}`)
}

export function createAuth(database: BetterAuthOptions["database"], settings: AuthSettings) {
  return betterAuth({
    appName: settings.appName,
    secret: settings.secret,
    baseURL: settings.baseURL,
    trustedOrigins: settings.trustedOrigins,
    database,
    telemetry: { enabled: false },
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 1,
      maxPasswordLength: 4096,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => bcryptHash(password, settings.bcryptRounds),
        verify: async ({ hash, password }) => (await bcryptVerify(password, hash)) === true,
      },
    },
    user: {
      additionalFields: {
        active: { type: "boolean", required: false, input: false },
      },
    },
    session: {
      expiresIn: settings.lifetimeMinutes * 60,
      updateAge: SESSION_REFRESH_SECONDS,
      additionalFields: {
        activeRoleAssignmentId: { type: "string", required: false, input: false },
      },
    },
    account: { accountLinking: { enabled: false } },
    advanced: {
      cookiePrefix: settings.cookiePrefix,
      database: { validateSchema: false },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            const user = await context?.context.internalAdapter.findUserById(session.userId)
            if (!user || (user as { active?: unknown }).active === false) throw APIError.from("FORBIDDEN", { message: INACTIVE_ACCOUNT, code: "ACCOUNT_INACTIVE" })
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: settings.appName,
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
        totpOptions: { period: 30, digits: 6 },
        backupCodeOptions: { customBackupCodesGenerate: recoveryCodes },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

const globalForAuth = globalThis as unknown as { silabosAuth?: Auth }

export function sharedAuth(): Auth {
  globalForAuth.silabosAuth ??= createAuth(drizzleAdapter(db, { provider: "pg", schema: authTables }), authSettings())
  return globalForAuth.silabosAuth
}
