import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LoginPage from "@/app/(auth)/ingresar/page"
import TwoFactorChallengePage from "@/app/(auth)/verificar-dos-factores/page"
import { completeTwoFactorLogin, getSession, login } from "@/api/session"
import { clearIntendedRoute, rememberIntendedRoute } from "@/lib/intended-route"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({
  login: vi.fn(),
  completeTwoFactorLogin: vi.fn(),
  getSession: vi.fn(),
}))

const authenticatedSession = {
  user: {
    id: "user-1",
    name: "Docente",
    email: "docente@example.test",
    email_verified: true,
    can_edit_identity: false,
  },
  active_role: { id: "role-1", code: "docente" as const, career_id: "career-1", career_name: "Software" },
  available_roles: [],
}

describe("authentication pages", () => {
  beforeEach(() => {
    navigation.reset("/ingresar")
    vi.mocked(login).mockReset()
    vi.mocked(completeTwoFactorLogin).mockReset()
    vi.mocked(getSession).mockReset()
    sessionState.clear()
    clearIntendedRoute()
  })

  it("replaces a cached guest state after logging in again in the same tab", async () => {
    vi.mocked(login).mockResolvedValue(authenticatedSession)
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)

    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@example.test")
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    await user.click(screen.getByRole("button", { name: "Ingresar" }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/docente/mis-silabos"))
    expect(login).toHaveBeenCalledWith("docente@example.test", "secret")
    expect(sessionState.current.value).toEqual(authenticatedSession)
  })

  it("keeps «Ingresar» disabled until the form is complete", async () => {
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)
    const submit = screen.getByRole("button", { name: "Ingresar" })

    expect(submit).toBeDisabled()
    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@example.test")
    expect(submit).toBeDisabled()
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    expect(submit).toBeEnabled()
    expect(container.querySelector("[required]")).toBeNull()
  })

  it("does not offer «Mantener la sesión iniciada»", () => {
    render(<LoginPage />)

    expect(screen.queryByText("Mantener la sesión iniciada")).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("returns to the remembered destination after logging in", async () => {
    vi.mocked(login).mockResolvedValue(authenticatedSession)
    rememberIntendedRoute("/docente/historial")
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)

    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@example.test")
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    await user.click(screen.getByRole("button", { name: "Ingresar" }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/docente/historial"))
  })

  it("asks for the second factor when the account requires it", async () => {
    vi.mocked(login).mockResolvedValue({ two_factor_required: true, message: "Se requiere el segundo factor" })
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)

    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@example.test")
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    await user.click(screen.getByRole("button", { name: "Ingresar" }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/verificar-dos-factores"))
    expect(sessionState.current.value).toBeNull()
  })

  it("shows the server message when the credentials are rejected", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client")
    vi.mocked(login).mockRejectedValue(new ApiError("Las credenciales no son válidas.", 422))
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)

    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@example.test")
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    await user.click(screen.getByRole("button", { name: "Ingresar" }))

    expect(await screen.findByText("Las credenciales no son válidas")).toBeInTheDocument()
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it("reloads the authenticated session after completing the second factor", async () => {
    vi.mocked(completeTwoFactorLogin).mockResolvedValue({ message: "ok" })
    vi.mocked(getSession).mockResolvedValue(authenticatedSession)
    const user = userEvent.setup()
    const { container } = render(<TwoFactorChallengePage />)

    await user.type(container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!, "123456")
    await user.click(screen.getByRole("button", { name: "Continuar" }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/docente/mis-silabos"))
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("123456", "")
    expect(getSession).toHaveBeenCalledOnce()
    expect(sessionState.current.value).toEqual(authenticatedSession)
  })
})
