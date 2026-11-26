import { screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProfilePage from "./ProfilePage"
import { sessionState } from "@/state/session"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ updateProfile: vi.fn(), resendActivation: vi.fn() }))
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
})
