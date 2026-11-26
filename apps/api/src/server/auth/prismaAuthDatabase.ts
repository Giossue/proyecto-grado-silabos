import { prismaAdapter } from "better-auth/adapters/prisma"
import type { PrismaClient } from "../../generated/prisma/client"
import type { AuthSchema } from "./betterAuth"

const USER_ID = "usuario_id"
const MOMENT_FLAGS = new Set(["correo_verificado_en"])
const USER_COLUMNS = new Set([USER_ID, "nombre_usuario", "correo_electronico", "usuario_activo", ...MOMENT_FLAGS])

export const PRISMA_AUTH_SCHEMA: AuthSchema = {
  user: { modelName: "usuarios", fields: { name: "nombre_usuario", email: "correo_electronico", emailVerified: "correo_verificado_en" } },
  userActive: "usuario_activo",
  session: {
    modelName: "sesiones_usuario",
    fields: { expiresAt: "expires_at", token: "token", createdAt: "created_at", updatedAt: "updated_at", ipAddress: "ip_address", userAgent: "user_agent", userId: "user_id" },
  },
  sessionActiveRoleAssignmentId: "active_role_assignment_id",
  account: {
    modelName: "cuentas_usuario",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      scope: "scope",
      password: "password",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verificaciones_usuario",
    fields: { identifier: "identifier", value: "value", expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  },
}

type Row = Record<string, unknown>

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)

function renamedId(key: string): string {
  return key === "id" ? USER_ID : key
}

export function userWhere(where: unknown): unknown {
  if (Array.isArray(where)) return where.map(userWhere)
  if (!isRow(where)) return where
  return Object.fromEntries(Object.entries(where).map(([key, value]) => [renamedId(key), key === "AND" || key === "OR" || key === "NOT" ? userWhere(value) : value]))
}

export function userSelect(select: unknown): unknown {
  if (!isRow(select)) return select
  return Object.fromEntries(Object.entries(select).flatMap(([key, value]) => (USER_COLUMNS.has(renamedId(key)) ? [[renamedId(key), value]] : [])))
}

export function userData(data: unknown, now: () => Date = () => new Date()): unknown {
  if (!isRow(data)) return data
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => {
      const column = renamedId(key)
      if (!USER_COLUMNS.has(column)) return []
      return [[column, MOMENT_FLAGS.has(column) && !(value instanceof Date) ? (value ? now() : null) : value]]
    }),
  )
}

export function userResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(userResult)
  if (!isRow(result) || !Object.keys(result).some((key) => USER_COLUMNS.has(key))) return result
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [key === USER_ID ? "id" : key, MOMENT_FLAGS.has(key) && typeof value !== "boolean" ? value !== null && value !== undefined : value]),
  )
}

export function userArgs(args: unknown): unknown {
  if (!isRow(args)) return args
  return {
    ...args,
    ...("where" in args ? { where: userWhere(args.where) } : {}),
    ...("select" in args && args.select !== undefined ? { select: userSelect(args.select) } : {}),
    ...("data" in args ? { data: userData(args.data) } : {}),
    ...("orderBy" in args ? { orderBy: userWhere(args.orderBy) } : {}),
  }
}

export function authPrismaClient(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      usuarios: {
        async $allOperations({ args, query }) {
          return userResult(await query(userArgs(args) as typeof args)) as never
        },
      },
    },
  })
}

export function prismaAuthDatabase(prisma: PrismaClient) {
  return prismaAdapter(authPrismaClient(prisma), { provider: "postgresql" })
}
