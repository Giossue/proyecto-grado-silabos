import { screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProfilePage from "./ProfilePage"
import { sessionState } from "@/state/session"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

describe("ProfilePage — datos de la cuenta", () => {
  beforeEach(() => sessionState.clear())

  it("el docente ve solo los datos de la cuenta: la formación la escribe en su sílabo", () => {
    sessionState.replace({
      user: { id: "u-1", name: "DOCENTE UNO", email: "docente@ueb.edu.ec", email_verified: true, can_edit_identity: false },
      active_role: { id: "r-1", code: "docente", career_id: null, career_name: null },
      available_roles: [],
    })
    const { container } = renderWithProviders(<ProfilePage />)

    expect(screen.getByText("Datos de la cuenta")).toBeInTheDocument()
    expect(container.querySelector("#formation")).toBeNull()
    expect(container.textContent).not.toContain("Formación y experiencia")
  })

  it("el administrador también solo consulta sus datos: sin Guardar y sin acordeón, y los corrige en Usuarios", () => {
    sessionState.replace({
      user: { id: "u-2", name: "ADMIN UNO", email: "admin@ueb.edu.ec", email_verified: true, can_edit_identity: true },
      active_role: { id: "r-2", code: "administrador", career_id: null, career_name: null },
      available_roles: [],
    })
    const { container } = renderWithProviders(<ProfilePage />)

    expect(screen.getByRole("heading", { name: "Datos de la cuenta" })).toBeInTheDocument()
    expect(container.querySelector("[aria-expanded]")).toBeNull()
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull()
    expect(container.querySelector("form")).toBeNull()
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("ADMIN UNO")
    expect(screen.getByLabelText("Nombre completo")).toBeDisabled()
    expect(screen.getByLabelText("Correo electrónico")).toBeDisabled()
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "/admin/usuarios")
  })
})
