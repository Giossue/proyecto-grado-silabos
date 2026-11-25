// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { managedUsers, type ManagedUserFilters, type ManagedUserRepository, type ManagedUserRow } from "./managedUsers"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const CAREER = "c0000000-0000-4000-8000-000000000001"

let world: FakeWorld
let rows: ManagedUserRow[]
let calls: { filters: ManagedUserFilters; page: number; perPage: number }[]

const repository = (): ManagedUserRepository => ({
  async page(filters, page, perPage) {
    calls.push({ filters, page, perPage })
    return { total: rows.length, items: rows.slice((page - 1) * perPage, page * perPage) }
  },
  careers: async () => [{ id: CAREER, nombre: "Software" }],
})

const user = (overrides: Partial<ManagedUserRow> = {}): ManagedUserRow => ({
  id: "90000000-0000-4000-8000-000000000001",
  name: "Ana Pérez",
  email: "ana@ueb.edu.ec",
  active: true,
  verified: true,
  twoFactor: false,
  invitationActive: false,
  assignments: [
    { id: "a1", role: "docente", careerLabel: "Software", active: true },
    { id: "a2", role: "coordinador", careerLabel: "Software", active: false },
  ],
  ...overrides,
})

async function list(query = "") {
  const response = await managedUsers(apiRequest(`/api/v1/admin/users${query}`, { cookie }), { bridge: fakeDeps(world), users: repository() })
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, ReturnType<typeof JSON.parse>>) : null }
}

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  rows = [user()]
  calls = []
})

describe("GET admin/users", () => {
  it("lists users with their effective roles, every assignment and the paginator", async () => {
    const { status, json } = await list()
    expect(status).toBe(200)
    expect(Object.keys(json!)).toEqual(["users", "filters", "roles", "careers"])
    expect(json!.users.data).toEqual([
      {
        id: "90000000-0000-4000-8000-000000000001",
        nombre: "Ana Pérez",
        correo_electronico: "ana@ueb.edu.ec",
        active: true,
        pending_activation: false,
        invitation_expired: false,
        two_factor_enabled: false,
        roles: [{ id: "a1", code: "docente", name: "Docente", career_name: "Software" }],
        careers: ["Software"],
        assignments: [
          { id: "a1", role_name: "Docente", career_name: "Software", active: true },
          { id: "a2", role_name: "Coordinador", career_name: "Software", active: false },
        ],
      },
    ])
    expect(json!.users).toMatchObject({ current_page: 1, per_page: 20, total: 1, path: "http://localhost:3000/api/v1/admin/users" })
    expect(json!.filters).toEqual({ q: null, status: null, role: null, career: null })
    expect(json!.roles).toEqual([
      { codigo: "administrador", nombre: "Administrador" },
      { codigo: "coordinador", nombre: "Coordinador" },
      { codigo: "docente", nombre: "Docente" },
      { codigo: "bibliotecario", nombre: "Bibliotecario" },
    ])
    expect(json!.careers).toEqual([{ id: CAREER, nombre: "Software" }])
  })

  it("marks pending invitations that are still valid or already expired", async () => {
    rows = [user({ verified: false, invitationActive: true }), user({ id: "u2", verified: false, invitationActive: false, assignments: [] })]
    const { json } = await list()
    expect(json!.users.data.map((item: Record<string, unknown>) => [item.pending_activation, item.invitation_expired])).toEqual([
      [true, false],
      [true, true],
    ])
  })

  it("applies the search, status, role and career filters like Laravel", async () => {
    const { json } = await list(`?q=%20P%C3%A9rez%20&status=pending&role=docente&career=${CAREER}&page=2`)
    expect(calls).toEqual([{ filters: { search: "Pérez", status: "pending", role: "docente", career: CAREER }, page: 2, perPage: 20 }])
    expect(json!.filters).toEqual({ q: "Pérez", status: "pending", role: "docente", career: CAREER })
    await list("?status=all&role=all&career=no-es-uuid&q=0")
    expect(calls[1].filters).toEqual({ search: null, status: null, role: null, career: null })
  })

  it("validates the filters with Laravel's attribute names", async () => {
    const { status, json } = await list(`?status=x&role=x&career=${"a".repeat(37)}&page=0`)
    expect(status).toBe(422)
    expect(json!.errors).toEqual({
      status: ["El valor seleccionado en estado no es válido."],
      role: ["El valor seleccionado en rol no es válido."],
      career: ["El campo carrera no debe tener más de 36 caracteres."],
      page: ["El campo página debe ser al menos 1."],
    })
    expect(calls).toEqual([])
  })

  it("forbids any role but Administration", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect(await list()).toMatchObject({ status: 403, text: '{"message":"No tiene permiso para hacer esto."}' })
  })
})

describe("ordering GET admin/users", () => {
  const names = Array.from({ length: 25 }, (_, index) => `Usuario ${String(index + 1).padStart(2, "0")}`)
  let sorts: unknown[]

  const sortingRepository = (): ManagedUserRepository => ({
    ...repository(),
    async page(_filters, page, perPage, sort) {
      sorts.push(sort ?? null)
      const all = names.map((name, index) => user({ id: `u${index}`, name }))
      const ordered = sort ? all.toSorted((left, right) => (sort.direction === "asc" ? 1 : -1) * left.name.localeCompare(right.name)) : all
      return { total: all.length, items: ordered.slice((page - 1) * perPage, page * perPage) }
    },
  })

  const sorted = async (query: string) => {
    const response = await managedUsers(apiRequest(`/api/v1/admin/users${query}`, { cookie }), { bridge: fakeDeps(world), users: sortingRepository() })
    const text = await response.text()
    return { status: response.status, text, json: JSON.parse(text) as Record<string, ReturnType<typeof JSON.parse>> }
  }

  beforeEach(() => {
    sorts = []
  })

  it("sorts every account by the chosen column before paginating", async () => {
    const { status, json } = await sorted("?sort=name&dir=desc&page=2")
    expect(status).toBe(200)
    expect(sorts).toEqual([{ column: "name", direction: "desc" }])
    expect(json.users.data.map((item: { nombre: string }) => item.nombre)).toEqual(["Usuario 05", "Usuario 04", "Usuario 03", "Usuario 02", "Usuario 01"])
    expect(json.filters).toEqual({ q: null, status: null, role: null, career: null })
  })

  it("keeps today's order and payload when no column is chosen", async () => {
    const plain = await list("?status=all")
    const { text } = await sorted("?status=all")
    expect(sorts).toEqual([null])
    expect(Object.keys(JSON.parse(text))).toEqual(Object.keys(plain.json!))
    expect(JSON.parse(text).users.data.map((item: { nombre: string }) => item.nombre)).toEqual(names.slice(0, 20))
  })

  it("rejects a column or direction outside the whitelist", async () => {
    const { status, json } = await sorted("?sort=correo&dir=up")
    expect(status).toBe(422)
    expect(json.errors).toEqual({ sort: ["El valor seleccionado en orden no es válido."], dir: ["El valor seleccionado en dirección del orden no es válido."] })
    expect(sorts).toEqual([])
  })
})
