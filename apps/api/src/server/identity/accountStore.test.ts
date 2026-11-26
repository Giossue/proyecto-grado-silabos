import { describe, expect, it, vi } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import recordedStatements from "./__fixtures__/account-store-statements.json"
import type { AccountRepository, AccountTx } from "./accounts"
import { accountRepositoryOn, accountTx } from "./accountStore"

vi.mock("../http/uuid7", () => ({ uuid7: () => "01a1c5ba-0000-7000-8000-000000000099" }))

type Statement = { text: string; values: unknown[] }

const U = "01a1c5ba-10b4-7129-925f-c28a9489323c"
const C = "01a1c5ba-10b4-7129-925f-c28a9489323d"
const G = "01a1c5ba-10b4-7129-925f-c28a9489323e"

function recordingDatabase(rows: unknown[] = [], count = 7) {
  const statements: string[] = []
  const recorded: Statement[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    statements.push(sql.text)
    recorded.push({ text: sql.text, values: sql.values })
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), rows),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), count),
  } as unknown as Db
  return { db, statements, recorded }
}

const squash = (text: string) => text.replace(/\s+/g, " ").replace(/;$/, "").trim()
const unaliased = (text: string) => squash(text.replace(/ as "[A-Za-z]+"/g, ""))

function withoutDefaults(text: string): string {
  const insert = /^insert into (\S+) \((.*)\) values \((.*)\)$/.exec(text)
  if (!insert) return text
  const columns = insert[2].split(", ")
  const values = insert[3].split(", ")
  const kept = columns.flatMap((column, index) => (values[index] === "default" ? [] : [[column, values[index]]]))
  return `insert into ${insert[1]} (${kept.map(([column]) => column).join(", ")}) values (${kept.map(([, value]) => value).join(", ")})`
}

const ACCESSIBILITY = { high_contrast: true, text_size: "130", no_motion: false, dyslexia: false }

const CALLS: [string, (tx: AccountTx, repo: AccountRepository) => Promise<unknown>, unknown][] = [
  ["nested", (tx) => tx.nested(async () => 1), 1],
  ["lockAccount", (tx) => tx.lockAccount(U), null],
  ["lockAccountByEmail", (tx) => tx.lockAccountByEmail("ana@x.ec"), null],
  ["insertAccount", (tx) => tx.insertAccount({ name: "Ana", email: "ana@x.ec", passwordHash: "$2y$h" }), { id: "01a1c5ba-0000-7000-8000-000000000099", name: "Ana", email: "ana@x.ec", active: true, verified: false }],
  ["updateIdentity", (tx) => tx.updateIdentity(U, "Ana", "ana@x.ec"), undefined],
  ["setActive", (tx) => tx.setActive(U, false), undefined],
  ["setAccessibility", (tx) => tx.setAccessibility(U, ACCESSIBILITY), undefined],
  ["effectiveRoles", (tx) => tx.effectiveRoles(U), []],
  ["lockEffectiveGrants", (tx) => tx.lockEffectiveGrants(U), []],
  ["lockCurrentCoordinator", (tx) => tx.lockCurrentCoordinator(C, U), null],
  ["lockCurrentCoordinatorNull", (tx) => tx.lockCurrentCoordinator(null, U), null],
  ["findGrantActiveFirst", (tx) => tx.findGrant(U, "docente", C, true), null],
  ["findGrantNull", (tx) => tx.findGrant(U, "administrador", null, false), null],
  ["lockActiveGrant", (tx) => tx.lockActiveGrant(U, "docente", C), null],
  ["insertGrant", (tx) => tx.insertGrant(U, "docente", C, 1800000000), { id: "01a1c5ba-0000-7000-8000-000000000099", userId: U, role: "docente", careerId: C, active: true }],
  ["insertGrantNull", (tx) => tx.insertGrant(U, "administrador", null, 1800000000), { id: "01a1c5ba-0000-7000-8000-000000000099", userId: U, role: "administrador", careerId: null, active: true }],
  ["setGrantActive", (tx) => tx.setGrantActive(G, true), undefined],
  ["invitationRoleNull", (tx) => tx.invitationRole(U), null],
  ["lockActiveParallelAssignments", (tx) => tx.lockActiveParallelAssignments(G), []],
  ["deleteParallelAssignment", (tx) => tx.deleteParallelAssignment(G), undefined],
  ["closeParallelAssignments", (tx) => tx.closeParallelAssignments(U), 7],
  ["lockEffectiveCoordinations", (tx) => tx.lockEffectiveCoordinations(U), []],
  ["isEffectiveAdministrator", (tx) => tx.isEffectiveAdministrator(U), false],
  ["otherActiveAdministratorExists", (tx) => tx.otherActiveAdministratorExists(U), false],
  ["hasActiveInvitation", (tx) => tx.hasActiveInvitation(U, 1800000000), false],
  ["invalidateInvitations", (tx) => tx.invalidateInvitations(U, 1800000000), undefined],
  ["insertInvitation", (tx) => tx.insertInvitation({ userId: U, hash: "abc", expiresAt: 1800003600, issuerId: C, createdAt: 1800000000 }), undefined],
  ["deleteSessions", (tx) => tx.deleteSessions(U, null), 7],
  ["deleteSessionsExcept", (tx) => tx.deleteSessions(U, "s-1"), 7],
  ["deleteSession", (tx) => tx.deleteSession("s-1", U), undefined],
  ["hasActivity", (tx) => tx.hasActivity(U), false],
  ["purgeAccount", (tx) => tx.purgeAccount(U), undefined],
  ["careerLocked", (tx) => tx.careerLocked(C), false],
  ["repo.findAccount", (_, repo) => repo.findAccount(U), null],
  ["repo.findGrant", (_, repo) => repo.findGrant(G), null],
  ["repo.hasEffectiveRole", (_, repo) => repo.hasEffectiveRole(U, "docente", C), false],
]

function recordedOf(name: string): Statement[] {
  return (recordedStatements as Record<string, Statement[]>)[name].map((statement) => ({ text: withoutDefaults(squash(statement.text)), values: statement.values }))
}

describe("accountTx", () => {
  it("locks only the coordinator assignment and requires an active user", async () => {
    const { db, statements } = recordingDatabase()
    expect(await accountTx(db).lockCurrentCoordinator("01a1c5ba-10b4-7129-925f-c28a9489323c", "01a1c5ba-10b4-7129-925f-c28a9489323d")).toBeNull()
    expect(statements[0]).toContain('inner join "usuarios" on ("usuarios"."usuario_id" = "asignaciones_rol"."usuario_id" and "usuarios"."usuario_activo" = $1)')
    expect(statements[0]).toContain('"asignaciones_rol"."rol" = $')
    expect(statements[0]).toMatch(/limit \$\d+ for update of "asignaciones_rol"$/)
  })

  it("matches a missing career with is null", async () => {
    const { db, statements } = recordingDatabase()
    await accountTx(db).findGrant("01a1c5ba-10b4-7129-925f-c28a9489323c", "administrador", null, true)
    expect(statements[0]).toContain('"asignaciones_rol"."carrera_id" is null')
    expect(statements[0]).toContain('order by "asignaciones_rol"."asignacion_rol_activa" desc')
  })

  it("labels the coordinations it locks without locking the careers", async () => {
    const { db, statements } = recordingDatabase([{ id: "01a1c5ba-10b4-7129-925f-c28a9489323c", careerId: null, label: null }])
    expect(await accountTx(db).lockEffectiveCoordinations("01a1c5ba-10b4-7129-925f-c28a9489323d")).toEqual([{ id: "01a1c5ba-10b4-7129-925f-c28a9489323c", label: "" }])
    expect(statements[0]).toContain('left join "carreras"')
    expect(statements[0]).toMatch(/for update of "asignaciones_rol"$/)
  })

  it.each(CALLS)("sends the recorded statements of the previous store for %s", async (name, call, expected) => {
    const { db, recorded } = recordingDatabase()
    const result = await call(accountTx(db), accountRepositoryOn(db, async () => null as never))
    expect(recorded.map((statement) => ({ text: unaliased(statement.text), values: statement.values }))).toEqual(recordedOf(name))
    expect(result).toEqual(expected)
  })

  it("labels the career of the invited role and the careers with syllabi in progress", async () => {
    const role = recordingDatabase([{ role: "docente", careerId: C, label: "Software · SW" }])
    expect(await accountTx(role.db).invitationRole(U)).toEqual({ role: "docente", careerLabel: "Software · SW" })
    expect(role.recorded.map((statement) => ({ text: unaliased(statement.text), values: statement.values }))).toEqual(recordedOf("invitationRole"))
    const syllabi = recordingDatabase([{ careerId: C, total: 3n, label: "Software · SW" }])
    expect(await accountTx(syllabi.db).syllabiInProgress(U)).toEqual([{ careerLabel: "Software · SW", total: 3 }])
    expect(syllabi.recorded.map((statement) => ({ text: unaliased(statement.text), values: statement.values }))).toEqual(recordedOf("syllabiInProgress"))
  })

  it("reads the issuer of the latest invitation as an account", async () => {
    const issuer = { issuerId: C, id: C, name: "Luis", email: "luis@x.ec", active: true, verified: true }
    const { db, recorded } = recordingDatabase([issuer])
    expect(await accountTx(db).latestInvitationIssuer(U)).toEqual(issuer)
    expect(recorded.map((statement) => ({ text: unaliased(statement.text), values: statement.values }))).toEqual(recordedOf("latestInvitationIssuer"))
  })

  it("counts taken emails and active careers like the previous store", async () => {
    const taken = recordingDatabase([{ count: 1n }])
    const repo = accountRepositoryOn(taken.db, async () => null as never)
    expect(await repo.emailTaken("ana@x.ec", null)).toBe(true)
    expect(await repo.emailTaken("ana@x.ec", U)).toBe(true)
    expect(await repo.activeCareer(C)).toBe(true)
    expect(taken.recorded.map((statement) => ({ text: squash(statement.text), values: statement.values }))).toEqual([
      ...recordedOf("repo.emailTaken"),
      ...recordedOf("repo.emailTakenIgnoring"),
      ...recordedOf("repo.activeCareer"),
    ])
    const free = recordingDatabase([{ count: 0n }])
    expect(await accountRepositoryOn(free.db, async () => null as never).emailTaken("ana@x.ec", null)).toBe(false)
  })

  it("rolls back to the savepoint when the nested work fails", async () => {
    const { db, statements } = recordingDatabase()
    const tx = accountTx(db)
    await expect(tx.nested(async () => Promise.reject(new Error("duplicate")))).rejects.toThrow("duplicate")
    await tx.nested(async () => 1)
    expect(statements).toEqual(["savepoint identity_1", "rollback to savepoint identity_1", "savepoint identity_2", "release savepoint identity_2"])
  })
})
