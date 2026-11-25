import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { asignacionesRol, usuarios } from "./tables"

const moment = (name: string) => timestamp(name, { withTimezone: true, mode: "date" })

export const sesionesUsuario = pgTable(
  "sesiones_usuario",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usuarios.usuarioId, { onDelete: "cascade" }),
    expiresAt: moment("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeRoleAssignmentId: uuid("active_role_assignment_id").references(() => asignacionesRol.asignacionRolId, { onDelete: "set null" }),
    createdAt: moment("created_at").defaultNow().notNull(),
    updatedAt: moment("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("sesiones_usuario_token_unique").on(table.token), index("sesiones_usuario_user_id_index").on(table.userId)],
)

export const cuentasUsuario = pgTable(
  "cuentas_usuario",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usuarios.usuarioId, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: moment("access_token_expires_at"),
    refreshTokenExpiresAt: moment("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: moment("created_at").defaultNow().notNull(),
    updatedAt: moment("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cuentas_usuario_provider_account_unique").on(table.providerId, table.accountId),
    index("cuentas_usuario_user_id_index").on(table.userId),
  ],
)

export const verificacionesUsuario = pgTable(
  "verificaciones_usuario",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: moment("expires_at").notNull(),
    createdAt: moment("created_at").defaultNow().notNull(),
    updatedAt: moment("updated_at").defaultNow().notNull(),
  },
  (table) => [index("verificaciones_usuario_identifier_index").on(table.identifier)],
)

export const dosFactoresUsuario = pgTable(
  "dos_factores_usuario",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usuarios.usuarioId, { onDelete: "cascade" }),
    verified: boolean("verified").default(true).notNull(),
    failedVerificationCount: integer("failed_verification_count").default(0).notNull(),
    lockedUntil: moment("locked_until"),
  },
  (table) => [uniqueIndex("dos_factores_usuario_user_id_unique").on(table.userId)],
)
