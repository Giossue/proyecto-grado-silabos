import { fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { disableTwoFactor, enableTwoFactor, getTwoFactorStatus, type TwoFactorStatus } from "@/api/session"
import { ManageTwoFactor } from "@/components/ManageTwoFactor"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/session", () => ({
  getTwoFactorStatus: vi.fn(),
  confirmTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}))

const simulateExitAnimation = (): void => {
  const style = document.createElement("style")
  style.dataset.exit = ""
  style.textContent = '[data-state="closed"] { animation-name: exit; }'
  document.head.append(style)
}

const buttons = (): HTMLButtonElement[] => Array.from(document.body.querySelectorAll("button"))
const toggles = (): HTMLButtonElement[] => buttons().filter((button) => /Activar 2FA|Desactivar 2FA/.test(button.textContent ?? ""))
const type = async (selector: string, value: string): Promise<void> => {
  fireEvent.change(document.body.querySelector<HTMLInputElement>(selector)!, { target: { value } })
  await flush()
}
const submitButton = (): HTMLButtonElement => document.body.querySelector<HTMLButtonElement>('form button[type="submit"]')!

describe("ManageTwoFactor", () => {
  afterEach(() => document.head.querySelectorAll("style[data-exit]").forEach((style) => style.remove()))
  beforeEach(() => vi.resetAllMocks())

  it("espera el estado conocido antes de ofrecer activar o desactivar la protección", async () => {
    let finish!: (status: TwoFactorStatus) => void
    vi.mocked(getTwoFactorStatus).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const onLoadingChange = vi.fn()
    renderWithProviders(<ManageTwoFactor onLoadingChange={onLoadingChange} />)

    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true")
    expect(onLoadingChange.mock.calls).toEqual([[true]])
    expect(toggles()).toHaveLength(0)

    finish({ enabled: true, confirmation_required: false })
    await flush()

    expect(document.body.querySelector('[aria-busy="true"]')).toBeNull()
    expect(onLoadingChange.mock.calls).toEqual([[true], [false]])
    expect(document.body.textContent).toContain("Desactivar 2FA")
    expect(document.body.textContent).not.toContain("Activar 2FA")
  })

  it("no presenta una cuenta como desprotegida si falla la consulta inicial", async () => {
    vi.mocked(getTwoFactorStatus).mockRejectedValue(new ApiError("No se pudo consultar la protección", 503))
    const onLoadingChange = vi.fn()
    renderWithProviders(<ManageTwoFactor onLoadingChange={onLoadingChange} />)
    await flush()

    expect(document.body.querySelector('[aria-busy="true"]')).toBeNull()
    expect(onLoadingChange.mock.calls).toEqual([[true], [false]])
    expect(document.body.textContent).toContain("No se pudo consultar la protección")
    expect(toggles()).toHaveLength(0)
  })

  const openDisable = async (): Promise<void> => {
    vi.mocked(getTwoFactorStatus).mockResolvedValue({ enabled: true, confirmation_required: false })
    renderWithProviders(<ManageTwoFactor />)
    await flush()
    fireEvent.click(buttons().find((button) => button.textContent?.includes("Desactivar 2FA"))!)
    await flush()
  }

  it("pide la contraseña actual y el código del autenticador antes de desactivar el segundo factor", async () => {
    vi.mocked(disableTwoFactor).mockResolvedValue({ enabled: false, confirmation_required: false })
    await openDisable()
    expect(disableTwoFactor).not.toHaveBeenCalled()

    await type("#disable-current-password", "clave-actual")
    expect(submitButton().disabled).toBe(true)
    await type("#disable-code", "123456")
    fireEvent.click(submitButton())
    await flush()

    expect(disableTwoFactor).toHaveBeenCalledWith("clave-actual", "123456")
  })

  it("permite desactivar con un código de recuperación", async () => {
    vi.mocked(disableTwoFactor).mockResolvedValue({ enabled: false, confirmation_required: false })
    await openDisable()

    fireEvent.click(buttons().find((button) => button.textContent?.includes("Usar un código de recuperación"))!)
    await flush()
    expect(document.body.textContent).toContain("Código de recuperación")
    await type("#disable-current-password", "clave-actual")
    await type("#disable-code", "ABCD-EFGH")
    fireEvent.click(submitButton())
    await flush()

    expect(disableTwoFactor).toHaveBeenCalledWith("clave-actual", "", "ABCD-EFGH")
  })

  it("si el código no es válido, el diálogo sigue abierto con el mensaje y la protección sigue activa", async () => {
    vi.mocked(disableTwoFactor).mockRejectedValue(
      new ApiError("El código de autenticación no es válido.", 422, { code: ["El código de autenticación no es válido."] }),
    )
    await openDisable()
    await type("#disable-current-password", "clave-actual")
    await type("#disable-code", "000000")
    fireEvent.click(submitButton())
    await flush()

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.dataset.state).toBe("open")
    expect(dialog.textContent).toContain("El código de autenticación no es válido")
    expect(document.body.textContent).toContain("Desactivar 2FA")
  })

  it("al confirmar, el diálogo se desvanece como diálogo de desactivar", async () => {
    simulateExitAnimation()
    vi.mocked(disableTwoFactor).mockResolvedValue({ enabled: false, confirmation_required: false })
    await openDisable()
    await type("#disable-current-password", "clave-actual")
    await type("#disable-code", "123456")

    fireEvent.click(submitButton())
    await flush()

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.dataset.state).toBe("closed")
    expect(dialog.textContent).toContain("Desactivar la verificación en dos pasos")
    expect(dialog.querySelector('button[type="submit"]')!.textContent?.trim()).toBe("Desactivar 2FA")
  })

  it("activar sigue pidiendo solo la contraseña actual", async () => {
    vi.mocked(getTwoFactorStatus).mockResolvedValue({ enabled: false, confirmation_required: false })
    vi.mocked(enableTwoFactor).mockResolvedValue({ enabled: false, confirmation_required: true, qr_code_svg: "<svg></svg>" } as never)
    renderWithProviders(<ManageTwoFactor />)
    await flush()
    fireEvent.click(buttons().find((button) => button.textContent?.includes("Activar 2FA"))!)
    await flush()

    await type("#confirm-current-password", "clave-actual")
    fireEvent.click(submitButton())
    await flush()

    expect(enableTwoFactor).toHaveBeenCalledWith("clave-actual")
  })
})
