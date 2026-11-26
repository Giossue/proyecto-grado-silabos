import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import LoginPage from "@/app/(auth)/ingresar/page"
import { getAuthProviders, getSession, login } from "@/api/session"
import { clearIntendedRoute, rememberIntendedRoute } from "@/lib/intended-route"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({
  login: vi.fn(),
  getSession: vi.fn(),
  getAuthProviders: vi.fn(),
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
    vi.mocked(getSession).mockReset()
    vi.mocked(getAuthProviders).mockReset().mockResolvedValue({ keycloak: false })
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

  it("lets «Ingresar» be pressed with empty fields and points to the first missing one", async () => {
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)
    const submit = screen.getByRole("button", { name: "Ingresar" })

    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(await screen.findByText("Ingrese su correo electrónico")).toBeTruthy()
    expect(screen.getByText("Ingrese su contraseña")).toBeTruthy()
    expect(document.activeElement).toBe(container.querySelector('input[type="email"]'))
    expect(vi.mocked(login)).not.toHaveBeenCalled()
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

  it("shows the server's field errors under the matching input", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client")
    vi.mocked(login).mockRejectedValue(new ApiError("Demasiados intentos.", 422, { correo_electronico: ["Ingrese un correo electrónico válido."] }))
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)

    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@example.test")
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    await user.click(screen.getByRole("button", { name: "Ingresar" }))

    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByText("Ingrese un correo electrónico válido")).toBeInTheDocument()
    expect(screen.queryByText("Demasiados intentos")).not.toBeInTheDocument()
  })

  it("checks the email shape with the server's schema before sending", async () => {
    const user = userEvent.setup()
    const { container } = render(<LoginPage />)

    await user.type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "docente@localhost")
    await user.type(container.querySelector<HTMLInputElement>('input[type="password"]')!, "secret")
    await user.click(screen.getByRole("button", { name: "Ingresar" }))

    expect(await screen.findByText("Ingrese un correo electrónico válido")).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it("shows «Ingresar con cuenta institucional» only when the API offers Keycloak", async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ keycloak: true })
    render(<LoginPage />)

    const link = await screen.findByRole("link", { name: "Ingresar con cuenta institucional" })
    expect(link).toHaveAttribute("href", "/auth/keycloak")
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument()
  })

  it("hides the institutional login when Keycloak is off or the providers call fails", async () => {
    const { unmount } = render(<LoginPage />)
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled())
    expect(screen.queryByRole("link", { name: "Ingresar con cuenta institucional" })).toBeNull()
    unmount()

    vi.mocked(getAuthProviders).mockRejectedValue(new Error("offline"))
    render(<LoginPage />)
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole("link", { name: "Ingresar con cuenta institucional" })).toBeNull()
  })

  it.each([
    ["keycloak_sin_cuenta", "Tu cuenta institucional no está registrada en el sistema. Pide acceso a Administración."],
    ["keycloak_error", "No se pudo ingresar con la cuenta institucional. Intenta de nuevo."],
  ])("explains the Keycloak error %s with the login error alert", (code, message) => {
    navigation.reset(`/ingresar?error=${code}`)
    render(<LoginPage />)

    expect(screen.getByRole("alert")).toHaveTextContent(message)
  })

  it("ignores unknown error codes", () => {
    navigation.reset("/ingresar?error=constructor")
    render(<LoginPage />)

    expect(screen.queryByRole("alert")).toBeNull()
  })
})
