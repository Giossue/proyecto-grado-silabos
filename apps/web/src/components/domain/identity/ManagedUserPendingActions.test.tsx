import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ManagedUserPendingActions } from "@/components/domain/identity/ManagedUserPendingActions"
import { flush, renderWithProviders } from "@/test/render"

const { resendManagedUserInvitation, deleteManagedUser } = vi.hoisted(() => ({
  resendManagedUserInvitation: vi.fn().mockResolvedValue({ message: "Invitación enviada." }),
  deleteManagedUser: vi.fn().mockResolvedValue({ message: "Cuenta eliminada." }),
}))

vi.mock("@/api/admin-users", () => ({ resendManagedUserInvitation, deleteManagedUser }))

const props = { userId: "user-1", userName: "Docente", userEmail: "docente@example.test", onResendOpenChange: vi.fn(), onDeleteOpenChange: vi.fn() }
const button = (label: string): HTMLButtonElement => [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === label) as HTMLButtonElement

describe("ManagedUserPendingActions", () => {
  beforeEach(() => {
    resendManagedUserInvitation.mockClear()
    deleteManagedUser.mockClear()
  })

  it("muestra la confirmación de reenvío solo cuando se pide abrirla y reenvía al confirmar", async () => {
    const onChanged = vi.fn()
    const view = renderWithProviders(<ManagedUserPendingActions {...props} resendOpen={false} onChanged={onChanged} />)
    expect(document.body.textContent).not.toContain("Reenviar invitación de activación")

    view.rerender(<ManagedUserPendingActions {...props} resendOpen onChanged={onChanged} />)
    await flush()
    expect(document.body.textContent).toContain("docente@example.test")

    fireEvent.click(button("Reenviar invitación"))
    await flush()
    expect(resendManagedUserInvitation).toHaveBeenCalledWith("user-1")
    expect(onChanged.mock.calls[0]).toEqual(["Invitación enviada."])
  })

  it("elimina la cuenta pendiente al confirmar", async () => {
    const onChanged = vi.fn()
    renderWithProviders(<ManagedUserPendingActions {...props} deleteOpen onChanged={onChanged} />)
    await flush()

    fireEvent.click(button("Eliminar cuenta"))
    await flush()
    expect(deleteManagedUser).toHaveBeenCalledWith("user-1")
    expect(onChanged.mock.calls[0]).toEqual(["Cuenta eliminada."])
  })
})
