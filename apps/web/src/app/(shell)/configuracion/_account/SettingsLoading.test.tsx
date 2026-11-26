import { act } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "@/api/session"
import ProfilePage from "./ProfilePage"
import { sessionState } from "@/state/session"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

const session: Session = {
  user: { id: "user-test", name: "PERSONA DE PRUEBA", email: "persona@example.test", email_verified: true, can_edit_identity: false },
  active_role: { id: "role-test", code: "docente", career_id: "career-test", career_name: "Software" },
  available_roles: [],
}

const section = (name: string): HTMLElement | null => document.body.querySelector(`[data-settings-section="${name}"]`)

describe("carga de Configuración", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sessionState.replace(session)
  })
  afterEach(() => sessionState.clear())

  it("carga Perfil hasta tener la identidad y conserva la consulta de un docente", async () => {
    sessionState.clear()
    renderWithProviders(<ProfilePage />)

    expect(section("profile")).toBeVisible()
    expect(document.body.querySelector("input")).toBeNull()

    act(() => sessionState.replace(session))
    await flush()

    expect(section("profile")).toBeNull()
    expect(document.body.querySelector<HTMLInputElement>("#readonly-name")!.value).toBe(session.user.name)
    expect(document.body.querySelector<HTMLInputElement>("#readonly-name")!.disabled).toBe(true)
    expect(document.body.querySelector('[data-test="update-profile-button"]')).toBeNull()
  })

  it("presenta directamente el perfil de consulta del administrador cuando su sesión ya está disponible", () => {
    sessionState.replace({
      ...session,
      user: { ...session.user, can_edit_identity: true },
      active_role: { ...session.active_role!, code: "administrador", career_id: null, career_name: null },
    })
    renderWithProviders(<ProfilePage />)

    expect(section("profile")).toBeNull()
    expect(document.body.querySelector<HTMLInputElement>("#readonly-name")!.value).toBe(session.user.name)
    expect(document.body.querySelector<HTMLInputElement>("#readonly-name")!.disabled).toBe(true)
    expect(document.body.querySelector('[data-test="update-profile-button"]')).toBeNull()
  })
})
