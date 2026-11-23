import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog"
import { flush, renderWithProviders } from "@/test/render"

describe("PasswordConfirmDialog", () => {
  it("al confirmar deja la contraseña escrita mientras sigue a la vista, y la limpia al abrirse de nuevo", async () => {
    const onConfirm = vi.fn()
    const props = { title: "Desactivar", description: "Confirme su contraseña", confirmLabel: "Desactivar", onOpenChange: vi.fn(), onConfirm }
    const view = renderWithProviders(<PasswordConfirmDialog open {...props} />)
    await flush()
    const input = (): HTMLInputElement => document.body.querySelector<HTMLInputElement>("#confirm-current-password")!
    fireEvent.change(input(), { target: { value: "Demo-2026!" } })

    fireEvent.submit(document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!)
    await flush()
    expect(onConfirm.mock.calls).toEqual([["Demo-2026!"]])
    expect(input().value).toBe("Demo-2026!")

    view.rerender(<PasswordConfirmDialog open={false} {...props} />)
    await flush()
    view.rerender(<PasswordConfirmDialog open {...props} />)
    await flush()
    expect(input().value).toBe("")
  })
})
