import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError } from "better-auth/api"
import type { PrismaClient } from "../../generated/prisma/client"
import { bcryptHash, bcryptVerify } from "./bcrypt"
import { PRISMA_AUTH_SCHEMA, prismaAuthDatabase } from "./prismaAuthDatabase"

export const INACTIVE_ACCOUNT = "La cuenta está desactivada."
export const SESSION_REFRESH_SECONDS = 60

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

type ModelMapping = { modelName?: string; fields?: Record<string, string> }

export type AuthSchema = {
  user?: { modelName?: string; fields?: Partial<Record<"name" | "email" | "emailVerified" | "image" | "createdAt" | "updatedAt", string>> }
  userActive?: string
  session?: { modelName?: string; fields?: Partial<Record<"expiresAt" | "token" | "createdAt" | "updatedAt" | "ipAddress" | "userAgent" | "userId", string>> }
  sessionActiveRoleAssignmentId?: string
  account?: ModelMapping
  verification?: ModelMapping
}

export function createAuth(database: BetterAuthOptions["database"], settings: AuthSettings, schema: AuthSchema = {}) {
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
      ...schema.user,
      additionalFields: {
        active: { type: "boolean", required: false, input: false, fieldName: schema.userActive },
      },
    },
    session: {
      ...schema.session,
      expiresIn: settings.lifetimeMinutes * 60,
      updateAge: SESSION_REFRESH_SECONDS,
      additionalFields: {
        activeRoleAssignmentId: { type: "string", required: false, input: false, fieldName: schema.sessionActiveRoleAssignmentId },
      },
    },
    account: { ...schema.account, accountLinking: { enabled: false } },
    verification: { ...schema.verification },
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
  })
}

export type Auth = ReturnType<typeof createAuth>

const globalForAuth = globalThis as unknown as { silabosAuth?: Auth; silabosAuthDatabase?: PrismaClient }

export function bindAuthDatabase(prisma: PrismaClient): void {
  if (globalForAuth.silabosAuthDatabase === prisma) return
  globalForAuth.silabosAuthDatabase = prisma
  globalForAuth.silabosAuth = undefined
}

export function sharedAuth(): Auth {
  const prisma = globalForAuth.silabosAuthDatabase
  if (prisma === undefined) throw new Error("The Better Auth database is not bound.")
  globalForAuth.silabosAuth ??= createAuth(prismaAuthDatabase(prisma), authSettings(), PRISMA_AUTH_SCHEMA)
  return globalForAuth.silabosAuth
}
