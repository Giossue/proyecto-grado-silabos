// @vitest-environment node
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Prisma } from "../../../generated/prisma/client"
import type { PrismaService } from "../../../prisma/prisma.service"
import { sessionStoreOn as drizzleSessionStore } from "../../../server/auth/store"
import { credentialStoreOn as drizzleCredentialStore } from "../../../server/identity/authentication"
import { recoveryStoreOn as drizzleRecoveryStore } from "../../../server/identity/passwordRecovery"
import { createProfileRepository } from "../../../server/identity/session"
import { createActiveSessionStore } from "../../../server/identity/sessions"
import { twoFactorStoreOn as drizzleTwoFactorStore } from "../../../server/identity/twoFactor"
import { activeSessionStoreOn } from "./active-sessions.repository"
import { credentialStoreOn } from "./credentials.repository"
import { profileRepositoryOn } from "./profile.repository"
import type { RawExecutor } from "./raw-executor"
import { recoveryRepositoryOn, recoveryStoreOn } from "./recovery.repository"
import { sessionStoreOn } from "./session-store.repository"
import { TRANSACTION_OPTIONS } from "./transactions"
import { twoFactorStoreOn } from "./two-factor.repository"

type Captured = { sql: string; params: unknown[] }

const drizzleLog = vi.hoisted(() => ({ queries: [] as unknown[], rows: [] as unknown[], rowCount: 0 }))

vi.mock("@/db", async (original) => {
  const actual = await original<typeof import("@/db")>()
  const execute = async (query: unknown) => (drizzleLog.queries.push(query), { rows: drizzleLog.rows, rowCount: drizzleLog.rowCount })
  return { ...actual, db: new Proxy(actual.db, { get: (target, key, receiver) => (key === "execute" ? execute : Reflect.get(target, key, receiver)) }) }
})

vi.mock("node:crypto", async (original) => ({ ...(await original<typeof import("node:crypto")>()), randomUUID: () => "00000000-0000-4000-8000-00000000000a" }))

const dialect = new PgDialect()
const squash = (text: string) => text.replace(/\s+/g, " ").replace(/;$/, "").trim()

const drizzleExecutor = { execute: async (query: SQL) => (drizzleLog.queries.push(query), { rows: drizzleLog.rows, rowCount: drizzleLog.rowCount }) }

function drizzleQueries(): Captured[] {
  return drizzleLog.queries.map((query) => {
    const rendered = dialect.sqlToQuery(query as SQL)
    return { sql: squash(rendered.sql), params: rendered.params }
  })
}

function prismaFake(rows: unknown[], count = 0) {
  const queries: Prisma.Sql[] = []
  const executor = {
    $queryRaw: async (query: Prisma.Sql) => (queries.push(query), rows),
    $executeRaw: async (query: Prisma.Sql) => (queries.push(query), count),
  } as unknown as RawExecutor
  return { executor, captured: () => queries.map((query): Captured => ({ sql: squash(query.text), params: query.values })) }
}

beforeEach(() => {
  drizzleLog.queries = []
  drizzleLog.rows = []
  drizzleLog.rowCount = 0
})

async function same<T>(pgRows: unknown[], prismaRows: unknown[], before: () => Promise<T>, after: (executor: RawExecutor) => Promise<T>, count = 0): Promise<T> {
  drizzleLog.queries = []
  drizzleLog.rows = pgRows
  drizzleLog.rowCount = count
  const expected = await before()
  const prisma = prismaFake(prismaRows, count)
  const actual = await after(prisma.executor)
  expect(prisma.captured()).toEqual(drizzleQueries())
  expect(actual).toEqual(expected)
  return actual
}

const USER = "0193a3c2-1111-7000-8000-000000000001"

describe("identity repositories on Prisma send the same SQL and map the rows like the Drizzle ones", () => {
  it("finds the session user and the effective roles", async () => {
    const user = { usuario_id: USER, contrasena: "$2y$12$hash", usuario_activo: true, correo_verificado_en: "2026-01-01 00:00:00+00", preferencias_correo_usuario: { a: true } }
    expect(await same([user], [user], () => drizzleSessionStore(drizzleExecutor).findUser(USER), (executor) => sessionStoreOn(executor).findUser(USER))).toMatchObject({ id: USER, active: true })
    await same([], [], () => drizzleSessionStore(drizzleExecutor).findUser(USER), (executor) => sessionStoreOn(executor).findUser(USER))
    const role = { asignacion_rol_id: "r-1", usuario_id: USER, rol: "docente", carrera_id: "c-1", career_label: "Software · SW" }
    const roles = await same([role], [role], () => drizzleSessionStore(drizzleExecutor).effectiveRoleAssignments(USER), (executor) => sessionStoreOn(executor).effectiveRoleAssignments(USER))
    expect(roles).toEqual([{ id: "r-1", userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software · SW" }])
  })

  it("reads the profile with its two-factor flags", async () => {
    const row = { nombre_usuario: "ANA", correo_electronico: "ana@silabos.test", formacion_experiencia_usuario: null, preferencias_accesibilidad_usuario: { text_size: "130" }, two_factor_secret: true, two_factor_confirmed: false }
    await same([row], [row], () => createProfileRepository().find(USER), (executor) => profileRepositoryOn(executor).find(USER))
    await same([], [], () => createProfileRepository().find(USER), (executor) => profileRepositoryOn(executor).find(USER))
  })

  it("lists the open sessions, with the epoch the driver returns as text or as a bigint", async () => {
    const pg = { id: "s-1", ip_address: "203.0.113.5", user_agent: "Firefox/1", last_activity: "1800000000" }
    const sessions = await same([pg], [{ ...pg, last_activity: 1800000000n }], () => createActiveSessionStore().sessions(USER), (executor) => activeSessionStoreOn(executor).sessions(USER))
    expect(sessions).toEqual([{ id: "s-1", ip: "203.0.113.5", agent: "Firefox/1", lastActivity: 1800000000 }])
  })

  it("finds active credentials and mirrors the Better Auth password", async () => {
    await same([{ usuario_id: USER }], [{ usuario_id: USER }], () => drizzleCredentialStore(drizzleExecutor).findActiveUserByEmail("ana@silabos.test"), (executor) => credentialStoreOn(executor).findActiveUserByEmail("ana@silabos.test"))
    await same([], [], () => drizzleCredentialStore(drizzleExecutor).mirrorPassword(USER), (executor) => credentialStoreOn(executor).mirrorPassword(USER))
  })

  it("reads and writes reset tokens, invitations, passwords and sessions like before", async () => {
    const at = 1800000000
    const token = { token: "$2y$hash", created: "1799999000" }
    await same([token], [{ ...token, created: 1799999000n }], () => drizzleRecoveryStore(drizzleExecutor).resetToken("ana@silabos.test"), (executor) => recoveryStoreOn(executor).resetToken("ana@silabos.test"))
    await same([{ usuario_id: USER, correo_electronico: "ana@silabos.test" }], [{ usuario_id: USER, correo_electronico: "ana@silabos.test" }], () => drizzleRecoveryStore(drizzleExecutor).userByEmail("ana@silabos.test"), (executor) => recoveryStoreOn(executor).userByEmail("ana@silabos.test"))
    const invitation = { invitacion_activacion_id: "i-1", usuario_id: USER, hash_activacion: "abc", expires: "1800003600", used: null, invalidated: "1799990000" }
    const locked = await same([invitation], [{ ...invitation, expires: 1800003600n, invalidated: 1799990000n }], () => drizzleRecoveryStore(drizzleExecutor).lockInvitation("abc"), (executor) => recoveryStoreOn(executor).lockInvitation("abc"))
    expect(locked).toEqual({ id: "i-1", userId: USER, hash: "abc", expiresAt: 1800003600, usedAt: null, invalidatedAt: 1799990000 })
    await same([{ usuario_id: USER, usuario_activo: true, verified: false }], [{ usuario_id: USER, usuario_activo: true, verified: false }], () => drizzleRecoveryStore(drizzleExecutor).lockUser(USER), (executor) => recoveryStoreOn(executor).lockUser(USER))
    await same([], [], () => drizzleRecoveryStore(drizzleExecutor).deleteResetTokens("ana@silabos.test"), (executor) => recoveryStoreOn(executor).deleteResetTokens("ana@silabos.test"))
    await same([], [], () => drizzleRecoveryStore(drizzleExecutor).insertResetToken("ana@silabos.test", "$2y$hash", at), (executor) => recoveryStoreOn(executor).insertResetToken("ana@silabos.test", "$2y$hash", at))
    await same([], [], () => drizzleRecoveryStore(drizzleExecutor).setPassword(USER, "$2y$new"), (executor) => recoveryStoreOn(executor).setPassword(USER, "$2y$new"))
    expect(await same([], [], () => drizzleRecoveryStore(drizzleExecutor).deleteSessions(USER), (executor) => recoveryStoreOn(executor).deleteSessions(USER), 3)).toBe(3)
    await same([], [], () => drizzleRecoveryStore(drizzleExecutor).activate(USER, "$2y$new", at), (executor) => recoveryStoreOn(executor).activate(USER, "$2y$new", at))
    await same([], [], () => drizzleRecoveryStore(drizzleExecutor).useInvitation("i-1", at), (executor) => recoveryStoreOn(executor).useInvitation("i-1", at))
    await same([], [], () => drizzleRecoveryStore(drizzleExecutor).invalidateOtherInvitations(USER, "i-1", at), (executor) => recoveryStoreOn(executor).invalidateOtherInvitations(USER, "i-1", at))
  })

  it("runs the activation inside one interactive transaction without the five-second default timeout", async () => {
    const tx = prismaFake([{ usuario_id: USER, usuario_activo: true, verified: false }])
    const calls: unknown[] = []
    const prisma = {
      $transaction: async (work: (client: RawExecutor) => Promise<unknown>, options: unknown) => (calls.push(options), work(tx.executor)),
    } as unknown as PrismaService
    const user = await recoveryRepositoryOn(prisma).transaction((store) => store.lockUser(USER))
    expect(user).toEqual({ id: USER, active: true, verified: false })
    expect(calls).toEqual([TRANSACTION_OPTIONS])
    expect(tx.captured()[0].sql).toMatch(/for update$/)
  })

  it("reads the two-factor account and clears the legacy secret", async () => {
    const row = { usuario_id: USER, correo_electronico: "ana@silabos.test", has_secret: true, confirmed: true }
    await same([row], [row], () => drizzleTwoFactorStore(drizzleExecutor).account(USER), (executor) => twoFactorStoreOn(executor).account(USER))
    await same([], [], () => drizzleTwoFactorStore(drizzleExecutor).clearLegacy(USER), (executor) => twoFactorStoreOn(executor).clearLegacy(USER))
  })
})
