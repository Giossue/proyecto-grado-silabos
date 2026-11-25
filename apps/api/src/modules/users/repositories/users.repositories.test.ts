// @vitest-environment node
import { drizzle } from "drizzle-orm/pg-proxy"
import { describe, expect, it } from "vitest"
import type { ListSort, ManagedUserSort } from "@silabos/shared/schemas/listSort"
import * as schema from "@/db/schema"
import type { Prisma } from "../../../generated/prisma/client"
import { identityImportStoreOn as drizzleImportStore } from "../../../server/identity/importsStore"
import { managedUserRepositoryOn as drizzleManagedUsers } from "../../../server/identity/managedUserQueries"
import type { ManagedUserFilters } from "../../../server/identity/managedUsers"
import type { RawExecutor } from "../../auth/repositories/raw-executor"
import { identityImportStoreOn } from "./identity-import.repository"
import { managedUserRepositoryOn } from "./managed-users.repository"

type Captured = { sql: string; params: unknown[] }

const squash = (text: string) => text.replace(/\s+/g, " ").replace(/;$/, "").trim()
const unaliased = (text: string) => squash(text.replace(/ as "[A-Za-z]+"/g, ""))

const USER = "90000000-0000-4000-8000-000000000001"
const OTHER = "90000000-0000-4000-8000-000000000002"

type Answers = { count: number; users: unknown[][]; assignments: unknown[][]; careers: unknown[][] }

function drizzleWorld(answers: Answers) {
  const queries: Captured[] = []
  const db = drizzle(
    async (sql, params) => {
      queries.push({ sql: squash(sql), params })
      if (sql.startsWith("select count")) return { rows: [{ count: String(answers.count) }] }
      if (sql.includes('from "usuarios"')) return { rows: answers.users }
      if (sql.includes('from "asignaciones_rol"')) return { rows: answers.assignments }
      return { rows: answers.careers }
    },
    { schema },
  )
  return { db: db as never, queries }
}

function prismaWorld(answers: Answers, columns: { users: string[]; assignments: string[]; careers: string[] }) {
  const queries: Captured[] = []
  const zip = (names: string[], rows: unknown[][]) => rows.map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])))
  const executor = {
    $queryRaw: async (query: Prisma.Sql) => {
      queries.push({ sql: unaliased(query.text), params: query.values })
      if (query.text.startsWith("select count")) return [{ count: BigInt(answers.count) }]
      if (query.text.includes('from "usuarios"')) return zip(columns.users, answers.users)
      if (query.text.includes('from "asignaciones_rol"')) return zip(columns.assignments, answers.assignments)
      return zip(columns.careers, answers.careers)
    },
    $executeRaw: async () => 0,
  } as unknown as RawExecutor
  return { executor, queries }
}

const USER_COLUMNS = ["id", "name", "email", "active", "verified", "twoFactor", "invitationActive"]
const ASSIGNMENT_COLUMNS = ["userId", "id", "role", "careerLabel", "active"]

const answers: Answers = {
  count: 2,
  users: [
    [USER, "Ana Pérez", "ana@ueb.edu.ec", true, true, false, false],
    [OTHER, "Luis Mora", "luis@ueb.edu.ec", true, false, false, true],
  ],
  assignments: [
    [USER, "a1", "docente", "Software", true],
    [OTHER, "a2", "coordinador", null, false],
  ],
  careers: [],
}

async function samePage(filters: ManagedUserFilters, page: number, sort: ListSort<ManagedUserSort>, given: Answers = answers) {
  const before = drizzleWorld(given)
  const expected = await drizzleManagedUsers(before.db).page(filters, page, 20, sort)
  const after = prismaWorld(given, { users: USER_COLUMNS, assignments: ASSIGNMENT_COLUMNS, careers: [] })
  const actual = await managedUserRepositoryOn(after.executor).page(filters, page, 20, sort)
  expect(after.queries).toEqual(before.queries)
  expect(actual).toEqual(expected)
  return actual
}

const NONE: ManagedUserFilters = { search: null, status: null, role: null, career: null }

describe("account management repositories on Prisma send the same SQL and map the rows like the Drizzle ones", () => {
  it("pages the accounts with their assignments, unfiltered and in the default order", async () => {
    const page = await samePage(NONE, 1, null)
    expect(page.total).toBe(2)
    expect(page.items[0].assignments).toEqual([{ id: "a1", role: "docente", careerLabel: "Software", active: true }])
  })

  it.each([
    ["every filter, the status order and a second page", { search: "Jo%sé_\\", status: "pending", role: "docente", career: "c1" }, 2, { column: "status", direction: "desc" }],
    ["the active status and the name order", { ...NONE, status: "active" }, 1, { column: "name", direction: "asc" }],
    ["the inactive status alone", { ...NONE, status: "inactive" }, 1, null],
    ["the search alone", { ...NONE, search: "Ñandú" }, 1, null],
    ["the role alone", { ...NONE, role: "administrador" }, 1, null],
    ["the career alone", { ...NONE, career: "c2" }, 3, { column: "status", direction: "asc" }],
  ] as [string, ManagedUserFilters, number, ListSort<ManagedUserSort>][])("pages with %s", async (_, filters, page, sort) => {
    await samePage(filters, page, sort)
  })

  it("stops after the count when nothing matches", async () => {
    expect(await samePage(NONE, 1, null, { ...answers, count: 0 })).toEqual({ total: 0, items: [] })
  })

  it("lists the active careers with the label that tells apart repeated names", async () => {
    const careers = { ...answers, careers: [["c1", "Software · SW"]] }
    const before = drizzleWorld(careers)
    const after = prismaWorld(careers, { users: [], assignments: [], careers: ["id", "nombre"] })
    expect(await managedUserRepositoryOn(after.executor).careers()).toEqual(await drizzleManagedUsers(before.db).careers())
    expect(after.queries).toEqual(before.queries)
  })

  it("reads the careers for the import and its template", async () => {
    const rows = { ...answers, careers: [["c1", "Software", null, "Software · SW"], ["c2", null, "DER", null]] }
    const before = drizzleWorld(rows)
    const after = prismaWorld(rows, { users: [], assignments: [], careers: ["id", "name", "code", "label"] })
    expect(await identityImportStoreOn(after.executor).activeCareers()).toEqual(await drizzleImportStore(before.db).activeCareers())
    const labels = { ...answers, careers: [["Software · SW"], [null]] }
    const beforeLabels = drizzleWorld(labels)
    const afterLabels = prismaWorld(labels, { users: [], assignments: [], careers: ["label"] })
    expect(await identityImportStoreOn(afterLabels.executor).templateCareerLabels()).toEqual(await drizzleImportStore(beforeLabels.db).templateCareerLabels())
    expect([...after.queries, ...afterLabels.queries]).toEqual([...before.queries, ...beforeLabels.queries])
  })
})
