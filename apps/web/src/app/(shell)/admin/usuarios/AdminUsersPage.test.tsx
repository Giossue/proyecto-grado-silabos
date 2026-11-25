import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getManagedUsers, type ManagedUser, type ManagedUsersResponse } from "@/api/admin-users"
import { getSession, type Session } from "@/api/session"
import AdminUsersPage from "./AdminUsersPage"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/admin-users", async (importOriginal) => ({ ...(await importOriginal<object>()), getManagedUsers: vi.fn() }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/components/domain/ImportSpreadsheetDialog", () => ({ ImportSpreadsheetDialog: () => null }))
vi.mock("@/components/domain/identity/ManagedUserDialog", () => ({ ManagedUserDialog: () => null }))

const user: ManagedUser = {
  id: "u1",
  nombre: "Ana Pérez",
  correo_electronico: "ana@ueb.edu.ec",
  active: true,
  pending_activation: false,
  invitation_expired: false,
  two_factor_enabled: false,
  roles: [{ id: "r1", code: "docente", name: "Docente", career_name: "Software" }],
  careers: ["Software"],
  assignments: [],
}

const response = (users: ManagedUser[]): ManagedUsersResponse => ({
  users: { data: users, current_page: 1, last_page: 1, per_page: 15, from: 1, to: 1, total: 1 },
  filters: { q: null, status: null, role: null, career: null },
  roles: [],
  careers: [],
})

const session = { active_role: { code: "administrador" }, user: { id: "admin" } } as Session

const cells = (): HTMLTableCellElement[] => [...document.body.querySelectorAll<HTMLTableCellElement>("tbody td")]

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    navigation.reset("/admin/usuarios")
    vi.mocked(getSession).mockResolvedValue(session)
  })

  it("en móvil muestra el estado junto al correo y oculta la celda de Estado", async () => {
    vi.mocked(getManagedUsers).mockResolvedValue(response([user]))
    renderWithProviders(<AdminUsersPage />)
    await flush()

    const row = cells()
    const mobileBadge = row[0]!.querySelector(".sm\\:hidden")
    expect(row[0]!.textContent).toContain("ana@ueb.edu.ec")
    expect(mobileBadge).not.toBeNull()
    expect(mobileBadge!.textContent).toBe(row[3]!.textContent)
    expect(row[3]!.dataset.cardHide).toBe("true")
    expect(row).toHaveLength(4)
  })

  it("en móvil une rol y carrera en una línea, y sin carrera muestra solo el rol", async () => {
    vi.mocked(getManagedUsers).mockResolvedValue(
      response([{ ...user, roles: [...user.roles, { id: "r2", code: "administrador", name: "Administrador", career_name: null }] }]),
    )
    renderWithProviders(<AdminUsersPage />)
    await flush()

    const row = cells()
    expect([...row[0]!.querySelectorAll("[data-user-roles-label]")].map((label) => label.textContent)).toEqual(["Roles"])
    expect([...row[0]!.querySelectorAll("[data-user-role-line]")].map((line) => line.textContent)).toEqual(["Docente · Software", "Administrador"])
    expect(row[1]!.dataset.cardHide).toBe("true")
    expect(row[2]!.dataset.cardHide).toBe("true")
  })

  it("lee los filtros de la dirección y «Quitar filtros» vuelve a cargar sin ellos", async () => {
    navigation.reset("/admin/usuarios?q=ana&status=active&page=2")
    vi.mocked(getManagedUsers).mockResolvedValue(response([user]))
    renderWithProviders(<AdminUsersPage />)
    await flush()

    expect(getManagedUsers).toHaveBeenCalledWith({ q: "ana", status: "active", role: "all", career: "all", page: 2 })
    expect(document.body.querySelector<HTMLInputElement>("#users-search")!.value).toBe("ana")

    fireEvent.click([...document.body.querySelectorAll("button")].find((button) => button.textContent === "Quitar filtros")!)
    await flush()

    expect(getManagedUsers).toHaveBeenLastCalledWith({ q: "", status: "all", role: "all", career: "all", page: 1 })
    expect(navigation.fullPath).toBe("/admin/usuarios")
  })

  it("ordena todas las cuentas desde el encabezado: vuelve a la página 1, lo guarda en la dirección y lo anuncia", async () => {
    navigation.reset("/admin/usuarios?page=3")
    vi.mocked(getManagedUsers).mockResolvedValue(response([user]))
    renderWithProviders(<AdminUsersPage />)
    await flush()

    const button = screen.getByRole("button", { name: "Usuario" })
    expect(button.closest("th")!.hasAttribute("aria-sort")).toBe(false)
    fireEvent.click(button)
    await flush()

    expect(getManagedUsers).toHaveBeenLastCalledWith({ q: "", status: "all", role: "all", career: "all", sort: "name", dir: "asc", page: 1 })
    expect(screen.getByRole("columnheader", { name: "Usuario" }).getAttribute("aria-sort")).toBe("ascending")
    expect(navigation.fullPath).toBe("/admin/usuarios?sort=name&dir=asc")
    expect(screen.getByRole("status").textContent).toBe("Ordenado por Usuario, ascendente, 1 fila")

    fireEvent.click(screen.getByRole("button", { name: "Usuario" }))
    await flush()
    expect(getManagedUsers).toHaveBeenLastCalledWith({ q: "", status: "all", role: "all", career: "all", sort: "name", dir: "desc", page: 1 })
    expect(screen.getByRole("columnheader", { name: "Usuario" }).getAttribute("aria-sort")).toBe("descending")
  })

  it("el selector «Ordenar por» conserva los filtros y pide la lista una sola vez", async () => {
    navigation.reset("/admin/usuarios?q=ana&sort=status&dir=desc&page=2")
    vi.mocked(getManagedUsers).mockResolvedValue(response([user]))
    renderWithProviders(<AdminUsersPage />)
    await flush()

    expect(getManagedUsers).toHaveBeenCalledWith({ q: "ana", status: "all", role: "all", career: "all", sort: "status", dir: "desc", page: 2 })
    expect(screen.getByRole("columnheader", { name: "Estado" }).getAttribute("aria-sort")).toBe("descending")
    vi.mocked(getManagedUsers).mockClear()

    const actor = userEvent.setup()
    await actor.click(screen.getByRole("combobox", { name: "Ordenar por" }))
    await actor.click(await screen.findByRole("option", { name: "Usuario: Z a A" }))
    await flush()

    expect(getManagedUsers).toHaveBeenCalledTimes(1)
    expect(getManagedUsers).toHaveBeenCalledWith({ q: "ana", status: "all", role: "all", career: "all", sort: "name", dir: "desc", page: 1 })
    expect(navigation.fullPath).toBe("/admin/usuarios?q=ana&sort=name&dir=desc")
  })
})
