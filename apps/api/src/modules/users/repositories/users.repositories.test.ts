// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { ListSort, ManagedUserSort } from "@silabos/shared/schemas/listSort"
import type { Prisma } from "../../../generated/prisma/client"
import type { ManagedUserFilters } from "../../../server/identity/managedUsers"
import type { RawExecutor } from "../../auth/repositories/raw-executor"
import { identityImportStoreOn } from "./identity-import.repository"
import recordedOracle from "./__fixtures__/users-oracle.json"
import { managedUserOrder, managedUserRepositoryOn } from "./managed-users.repository"

type Captured = { sql: string; params: unknown[] }
type Oracle = Record<string, { queries: Captured[]; expected?: unknown; careers?: unknown; labels?: unknown }>

const oracle = recordedOracle as Oracle

const squash = (text: string) => text.replace(/\s+/g, " ").replace(/;$/, "").trim()
const unaliased = (text: string) => squash(text.replace(/ as "[A-Za-z]+"/g, ""))

const USER = "90000000-0000-4000-8000-000000000001"
const OTHER = "90000000-0000-4000-8000-000000000002"

type Answers = { count: number; users: unknown[][]; assignments: unknown[][]; careers: unknown[][] }

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

async function samePage(name: string, filters: ManagedUserFilters, page: number, sort: ListSort<ManagedUserSort>, given: Answers = answers) {
  const after = prismaWorld(given, { users: USER_COLUMNS, assignments: ASSIGNMENT_COLUMNS, careers: [] })
  const actual = await managedUserRepositoryOn(after.executor).page(filters, page, 20, sort)
  expect(after.queries).toEqual(oracle[name].queries)
  expect(actual).toEqual(oracle[name].expected)
  return actual
}

const NONE: ManagedUserFilters = { search: null, status: null, role: null, career: null }

describe("account management repositories on Prisma send the same SQL and map the rows like the recorded previous ones", () => {
  it("pages the accounts with their assignments, unfiltered and in the default order", async () => {
    const page = await samePage("unfiltered", NONE, 1, null)
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
  ] as [string, ManagedUserFilters, number, ListSort<ManagedUserSort>][])("pages with %s", async (name, filters, page, sort) => {
    await samePage(name, filters, page, sort)
  })

  it("stops after the count when nothing matches", async () => {
    expect(await samePage("nothing matches", NONE, 1, null, { ...answers, count: 0 })).toEqual({ total: 0, items: [] })
  })

  it("lists the active careers with the label that tells apart repeated names", async () => {
    const careers = { ...answers, careers: [["c1", "Software · SW"]] }
    const after = prismaWorld(careers, { users: [], assignments: [], careers: ["id", "nombre"] })
    expect(await managedUserRepositoryOn(after.executor).careers()).toEqual(oracle.careers.expected)
    expect(after.queries).toEqual(oracle.careers.queries)
  })

  it("reads the careers for the import and its template", async () => {
    const rows = { ...answers, careers: [["c1", "Software", null, "Software · SW"], ["c2", null, "DER", null]] }
    const after = prismaWorld(rows, { users: [], assignments: [], careers: ["id", "name", "code", "label"] })
    expect(await identityImportStoreOn(after.executor).activeCareers()).toEqual(oracle.imports.careers)
    const labels = { ...answers, careers: [["Software · SW"], [null]] }
    const afterLabels = prismaWorld(labels, { users: [], assignments: [], careers: ["label"] })
    expect(await identityImportStoreOn(afterLabels.executor).templateCareerLabels()).toEqual(oracle.imports.labels)
    expect([...after.queries, ...afterLabels.queries]).toEqual(oracle.imports.queries)
  })

  describe("managed user order", () => {
    it("keeps today's ORDER BY when no column is chosen", () => {
      const order = managedUserOrder(null)
      expect(order.text).toBe('"usuarios"."nombre_usuario" asc')
      expect(order.values).toEqual([])
    })

    it("sorts by name with nulls last and the id as tie-breaker", () => {
      expect(managedUserOrder({ column: "name", direction: "desc" }).text).toBe(
        '"usuarios"."nombre_usuario" desc nulls last, "usuarios"."nombre_usuario" asc, "usuarios"."usuario_id" asc',
      )
    })

    it("sorts by the status label shown in the table", () => {
      const { text, values } = managedUserOrder({ column: "status", direction: "asc" })
      expect(values).toEqual(["Inactivo", "Pendiente", "Invitación vencida", "Activo"])
      expect(text).toMatch(/^case when "usuarios"\."usuario_activo" = false then \$1::text[\s\S]* asc nulls last, "usuarios"\."nombre_usuario" asc, "usuarios"\."usuario_id" asc$/)
    })
  })
})
