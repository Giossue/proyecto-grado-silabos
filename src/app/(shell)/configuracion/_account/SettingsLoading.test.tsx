import { act, fireEvent, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getTwoFactorStatus, type Session, type TwoFactorStatus } from "@/api/session"
import ProfilePage from "./ProfilePage"
import SecurityPage from "./SecurityPage"
import { sessionState } from "@/state/session"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({
  getTwoFactorStatus: vi.fn(),
  updatePassword: vi.fn(),
  updateProfile: vi.fn(),
  resendActivation: vi.fn(),
  confirmTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  getDeviceSessions: vi.fn(),
  closeOtherDeviceSessions: vi.fn(),
}))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

const session: Session = {
  user: { id: "user-test", name: "PERSONA DE PRUEBA", email: "persona@example.test", email_verified: true, can_edit_identity: false },
  active_role: { id: "role-test", code: "docente", career_id: "career-test", career_name: "Software" },
  available_roles: [],
}

const section = (name: string): HTMLElement | null => document.body.querySelector(`[data-settings-section="${name}"]`)
const openPasswordDialog = (): HTMLElement => document.body.querySelector<HTMLElement>('[data-test="open-password-dialog"]')!
const activate = (): HTMLButtonElement | undefined => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Activar 2FA")

describe("carga de Configuración", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sessionState.replace(session)
  })
  afterEach(() => sessionState.clear())

  it("espera una única consulta de seguridad antes de revelar el formulario y segundo factor", async () => {
    let finish!: (status: TwoFactorStatus) => void
    vi.mocked(getTwoFactorStatus).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderWithProviders(<SecurityPage />)

    expect(section("security")).toBeVisible()
    expect(openPasswordDialog()).not.toBeVisible()
    expect(getTwoFactorStatus).toHaveBeenCalledTimes(1)

    await act(async () => finish({ enabled: false, confirmation_required: false }))
    await flush()

    expect(section("security")).toBeNull()
    expect(openPasswordDialog()).toBeVisible()
    expect(activate()).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /Verificación en dos pasos/ }))
    await flush()
    expect(activate()!.closest('[data-slot="accordion-content"]')?.getAttribute("data-state")).toBe("open")
    expect(getTwoFactorStatus).toHaveBeenCalledTimes(1)
  })

  it("libera el formulario de contraseña cuando falla el segundo factor sin inventar su estado", async () => {
    vi.mocked(getTwoFactorStatus).mockRejectedValue(new ApiError("No se pudo consultar la protección", 503))
    renderWithProviders(<SecurityPage />)
    await flush()

    expect(section("security")).toBeNull()
    expect(openPasswordDialog()).toBeVisible()
    expect(document.body.textContent).toContain("No se pudo consultar la protección")
    expect([...document.body.querySelectorAll("button")].some((button) => /Activar 2FA|Desactivar 2FA/.test(button.textContent ?? ""))).toBe(false)
  })

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

  it("presenta directamente el perfil editable cuando su sesión ya está disponible", () => {
    sessionState.replace({
      ...session,
      user: { ...session.user, can_edit_identity: true },
      active_role: { ...session.active_role!, code: "administrador", career_id: null, career_name: null },
    })
    renderWithProviders(<ProfilePage />)

    expect(section("profile")).toBeNull()
    expect(document.body.querySelector<HTMLInputElement>("#name")!.value).toBe(session.user.name)
    expect(document.body.querySelector('[data-test="update-profile-button"]')).not.toBeNull()
  })
})
