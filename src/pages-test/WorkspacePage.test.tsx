import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WorkspacePage from "@/app/(workspace)/rol/WorkspacePage"
import { getSession, selectActiveRole } from "@/api/session"
import { clearIntendedRoute, rememberIntendedRoute } from "@/lib/intended-route"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ getSession: vi.fn(), selectActiveRole: vi.fn(), updateAccessibility: vi.fn().mockResolvedValue({}) }))

const roles = [
  { id: "role-docente", code: "docente" as const, career_id: "career-1", career_name: "Software" },
  { id: "role-coordinador", code: "coordinador" as const, career_id: "career-1", career_name: "Software" },
]

const withoutRole = {
  user: { id: "u1", name: "Ana Pérez", email: "ana@ueb.edu.ec", email_verified: true, can_edit_identity: false },
  active_role: null,
  available_roles: roles,
}

describe("Seleccionar ámbito de trabajo", () => {
  beforeEach(() => {
    navigation.reset("/rol")
    vi.mocked(getSession).mockReset()
    vi.mocked(selectActiveRole).mockReset()
    sessionState.clear()
    clearIntendedRoute()
  })

  it("saluda, lista los ámbitos y entra al elegido", async () => {
    vi.mocked(getSession).mockResolvedValue(withoutRole)
    vi.mocked(selectActiveRole).mockResolvedValue({ ...withoutRole, active_role: roles[1] })
    const user = userEvent.setup()
    renderWithProviders(<WorkspacePage />)

    expect(await screen.findByRole("heading", { name: "Hola, Ana Pérez" })).toBeInTheDocument()
    expect(screen.getByText("Seleccione la carrera con la que trabajará en esta sesión")).toBeInTheDocument()
    expect(screen.getByText("Docencia")).toBeInTheDocument()
    expect(screen.getByText("Coordinación")).toBeInTheDocument()

    await user.click(screen.getAllByRole("button", { name: "Entrar a esta carrera" })[1])

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones"))
    expect(selectActiveRole).toHaveBeenCalledWith("role-coordinador")
    expect(sessionState.current.value?.active_role?.code).toBe("coordinador")
  })

  it("con un rol activo vuelve al destino pendiente", async () => {
    rememberIntendedRoute("/docente/historial")
    vi.mocked(getSession).mockResolvedValue({ ...withoutRole, active_role: roles[0] })
    renderWithProviders(<WorkspacePage />)

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/docente/historial"))
  })

  it("sin asignaciones vigentes lo dice", async () => {
    vi.mocked(getSession).mockResolvedValue({ ...withoutRole, available_roles: [] })
    renderWithProviders(<WorkspacePage />)

    expect(await screen.findByText("No tiene asignaciones vigentes")).toBeInTheDocument()
    expect(screen.getByText("Contáctese con el coordinador de la carrera")).toBeInTheDocument()
  })

  it("si no carga la sesión ofrece reintentar", async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new Error("red")).mockResolvedValue(withoutRole)
    const user = userEvent.setup()
    renderWithProviders(<WorkspacePage />)

    expect(await screen.findByText("No se pudo cargar su sesión")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Reintentar" }))

    expect(await screen.findByRole("heading", { name: "Hola, Ana Pérez" })).toBeInTheDocument()
  })
})
