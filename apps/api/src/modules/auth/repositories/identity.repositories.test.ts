// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { Prisma } from "../../../generated/prisma/client"
import type { PrismaService } from "../../../prisma/prisma.service"
import oracle from "./__fixtures__/identity-oracle.json"
import { credentialStoreOn } from "./credentials.repository"
import { profileRepositoryOn } from "./profile.repository"
import type { RawExecutor } from "./raw-executor"
import { recoveryRepositoryOn, recoveryStoreOn } from "./recovery.repository"
import { sessionStoreOn } from "./session-store.repository"
import { TRANSACTION_OPTIONS } from "./transactions"

type Captured = { sql: string; params: unknown[] }
type Oracle = Record<string, { queries: Captured[]; expected: unknown }>

vi.mock("node:crypto", async (original) => ({ ...(await original<typeof import("node:crypto")>()), randomUUID: () => "00000000-0000-4000-8000-00000000000a" }))

const squash = (text: string) => text.replace(/\s+/g, " ").replace(/;$/, "").trim()

function prismaFake(rows: unknown[], count = 0) {
  const queries: Prisma.Sql[] = []
  const executor = {
    $queryRaw: async (query: Prisma.Sql) => (queries.push(query), rows),
    $executeRaw: async (query: Prisma.Sql) => (queries.push(query), count),
  } as unknown as RawExecutor
  return { executor, captured: () => queries.map((query): Captured => ({ sql: squash(query.text), params: query.values })) }
}

async function same<T>(name: string, prismaRows: unknown[], after: (executor: RawExecutor) => Promise<T>, count = 0): Promise<T> {
  const recorded = (oracle as Oracle)[name]
  const prisma = prismaFake(prismaRows, count)
  const actual = await after(prisma.executor)
  expect(prisma.captured()).toEqual(recorded.queries)
  expect(actual).toEqual(recorded.expected === "__undefined__" ? undefined : recorded.expected)
  return actual
}

const USER = "0193a3c2-1111-7000-8000-000000000001"

describe("identity repositories on Prisma send the same SQL and map the rows like the recorded previous ones", () => {
  it("finds the session user and the effective roles", async () => {
    const user = { usuario_id: USER, contrasena: "$2y$12$hash", usuario_activo: true, correo_verificado_en: "2026-01-01 00:00:00+00", preferencias_correo_usuario: { a: true } }
    expect(await same("findUser", [user], (executor) => sessionStoreOn(executor).findUser(USER))).toMatchObject({ id: USER, active: true })
    await same("findUserMissing", [], (executor) => sessionStoreOn(executor).findUser(USER))
    const role = { asignacion_rol_id: "r-1", usuario_id: USER, rol: "docente", carrera_id: "c-1", career_label: "Software · SW" }
    const roles = await same("effectiveRoleAssignments", [role], (executor) => sessionStoreOn(executor).effectiveRoleAssignments(USER))
    expect(roles).toEqual([{ id: "r-1", userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software · SW" }])
  })

  it("reads the profile", async () => {
    const row = { nombre_usuario: "ANA", correo_electronico: "ana@silabos.test" }
    await same("profile", [row], (executor) => profileRepositoryOn(executor).find(USER))
    await same("profileMissing", [], (executor) => profileRepositoryOn(executor).find(USER))
  })

  it("finds active credentials", async () => {
    await same("findActiveUserByEmail", [{ usuario_id: USER }], (executor) => credentialStoreOn(executor).findActiveUserByEmail("ana@silabos.test"))
  })

  it("reads and writes reset tokens, invitations, passwords and sessions like before", async () => {
    const at = 1800000000
    const token = { token: "$2y$hash", created: "1799999000" }
    await same("resetToken", [{ ...token, created: 1799999000n }], (executor) => recoveryStoreOn(executor).resetToken("ana@silabos.test"))
    await same("userByEmail", [{ usuario_id: USER, correo_electronico: "ana@silabos.test" }], (executor) => recoveryStoreOn(executor).userByEmail("ana@silabos.test"))
    const invitation = { invitacion_activacion_id: "i-1", usuario_id: USER, hash_activacion: "abc", expires: "1800003600", used: null, invalidated: "1799990000" }
    const locked = await same("lockInvitation", [{ ...invitation, expires: 1800003600n, invalidated: 1799990000n }], (executor) => recoveryStoreOn(executor).lockInvitation("abc"))
    expect(locked).toEqual({ id: "i-1", userId: USER, hash: "abc", expiresAt: 1800003600, usedAt: null, invalidatedAt: 1799990000 })
    await same("lockUser", [{ usuario_id: USER, usuario_activo: true, verified: false }], (executor) => recoveryStoreOn(executor).lockUser(USER))
    await same("deleteResetTokens", [], (executor) => recoveryStoreOn(executor).deleteResetTokens("ana@silabos.test"))
    await same("insertResetToken", [], (executor) => recoveryStoreOn(executor).insertResetToken("ana@silabos.test", "$2y$hash", at))
    await same("setPassword", [], (executor) => recoveryStoreOn(executor).setPassword(USER, "$2y$new"))
    expect(await same("deleteSessions", [], (executor) => recoveryStoreOn(executor).deleteSessions(USER), 3)).toBe(3)
    await same("activate", [], (executor) => recoveryStoreOn(executor).activate(USER, "$2y$new", at))
    await same("useInvitation", [], (executor) => recoveryStoreOn(executor).useInvitation("i-1", at))
    await same("invalidateOtherInvitations", [], (executor) => recoveryStoreOn(executor).invalidateOtherInvitations(USER, "i-1", at))
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
})
