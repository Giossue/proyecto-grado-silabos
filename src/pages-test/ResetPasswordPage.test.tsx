import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import ResetPasswordPage from "@/app/(auth)/restablecer-contrasena/page"
import { resetForgottenPassword } from "@/api/session"
import { paths } from "@/lib/routes"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ resetForgottenPassword: vi.fn() }))

afterEach(() => sessionState.clear())

describe("Restablecer contraseña", () => {
  it("con una sesión abierta, al terminar la olvida y lleva a ingresar", async () => {
    sessionState.replace({
      user: { id: "u1", name: "Ana", email: "ana@ueb.edu.ec", email_verified: true, can_edit_identity: false },
      active_role: null,
      available_roles: [],
    })
    vi.mocked(resetForgottenPassword).mockResolvedValue({ message: "Contraseña restablecida" })
    navigation.reset(`${paths.passwordReset}?email=ana@ueb.edu.ec&token=abc`)
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />)

    expect(screen.getByRole("button", { name: "Restablecer contraseña" })).toBeDisabled()
    await user.type(document.querySelector<HTMLInputElement>("#new-password")!, "NuevaClave-2026!")
    await user.type(document.querySelector<HTMLInputElement>("#new-password-confirmation")!, "NuevaClave-2026!")
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }))

    await waitFor(() => expect(navigation.pathname).toBe(paths.login))
    expect(resetForgottenPassword).toHaveBeenCalledWith("ana@ueb.edu.ec", "abc", "NuevaClave-2026!", "NuevaClave-2026!")
    expect(navigation.fullPath).toBe(`${paths.login}?status=Contrase%C3%B1a%20restablecida`)
    expect(sessionState.current.value).toBeNull()
  })
})
