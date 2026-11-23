import { fireEvent } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { TwoFactorSetupModal } from "@/components/TwoFactorSetupModal"
import { flush, renderWithProviders } from "@/test/render"

const style = document.createElement("style")
style.textContent = '[data-state="closed"] { animation-name: exit; }'

describe("TwoFactorSetupModal", () => {
  beforeAll(() => document.head.append(style))
  afterAll(() => style.remove())

  it("se cierra en el paso del código y al abrirse de nuevo vuelve al código QR", async () => {
    const props = { qrCodeSvg: "<svg></svg>", processing: false, error: null, onOpenChange: vi.fn(), onConfirm: vi.fn() }
    const view = renderWithProviders(<TwoFactorSetupModal open {...props} />)
    await flush()
    fireEvent.click([...document.body.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Continuar")!)
    await flush()
    expect(document.body.textContent).toContain("Verificar código de autenticación")

    view.rerender(<TwoFactorSetupModal open={false} {...props} />)
    await flush()
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("closed")
    expect(document.body.textContent).toContain("Verificar código de autenticación")
    expect(document.body.querySelector("#two-factor-verify-form")).not.toBeNull()

    view.rerender(<TwoFactorSetupModal open {...props} />)
    await flush()
    expect(document.body.textContent).toContain("Activar autenticación de dos factores")
    expect(document.body.querySelector("#two-factor-verify-form")).toBeNull()
  })
})
