import { fireEvent } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { removeManagedUserRole, updateManagedUser, type ManagedUser } from "@/api/admin-users"
import { ManagedUserDetailDialog } from "@/components/domain/identity/ManagedUserDetailDialog"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/admin-users", () => ({ updateManagedUser: vi.fn(), removeManagedUserRole: vi.fn() }))

const style = document.createElement("style")
style.textContent = '[data-state="closed"] { animation-name: exit; }'
const button = (label: string): HTMLButtonElement => [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === label) as HTMLButtonElement

const user = {
  id: "u1",
  nombre: "Ana Pérez",
  correo_electronico: "ana@ueb.edu.ec",
  active: true,
  pending_activation: false,
  roles: [{ id: "r1", code: "docente", name: "Docente", career_name: "Software" }],
  careers: ["Software"],
  assignments: [{ id: "r1", role_name: "Docente", career_name: "Software", active: true }],
} as unknown as ManagedUser
const props = { user, roles: [{ codigo: "docente", nombre: "Docente" }], careers: [{ id: "c1", nombre: "Software" }], open: true, onOpenChange: vi.fn() }

describe("ManagedUserDetailDialog", () => {
  beforeAll(() => document.head.append(style))
  afterAll(() => style.remove())

  it("muestra la ficha y pasa a editar dentro de la misma hoja", async () => {
    renderWithProviders(<ManagedUserDetailDialog {...props} canEdit />)
    await flush()

    expect(document.body.textContent).toContain("Datos de la cuenta")
    expect(document.body.textContent).toContain("ana@ueb.edu.ec")
    fireEvent.click([...document.body.querySelectorAll("button")].find((item) => item.textContent?.includes("Editar")) as HTMLButtonElement)
    await flush()

    expect(document.body.textContent).toContain("Editar usuario")
    expect(document.body.querySelector("#managed-edit-nombres-u1")).not.toBeNull()

    fireEvent.click(button("Cancelar"))
    await flush()
    expect(document.body.textContent).toContain("Datos de la cuenta")
    expect(document.body.querySelector("#managed-edit-nombres-u1")).toBeNull()
  })

  it("no ofrece editar cuando no corresponde, como en la propia cuenta", async () => {
    renderWithProviders(<ManagedUserDetailDialog {...props} canEdit={false} />)
    await flush()

    expect([...document.body.querySelectorAll("button")].some((item) => item.textContent?.includes("Editar"))).toBe(false)
  })

  it("las acciones de la cuenta solo aparecen al editar, en el pie, como botones con texto y sin menú", async () => {
    const action = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    const startEditing = async () => {
      fireEvent.click(button("Editar"))
      await flush()
    }
    const onAction = vi.fn()
    const first = renderWithProviders(<ManagedUserDetailDialog {...props} canEdit onAction={onAction} />)
    await flush()
    expect(action("Deshabilitar acceso")).toBeNull()

    await startEditing()
    expect(action("Deshabilitar acceso")).not.toBeNull()
    expect(document.body.querySelector('button[aria-label^="Acciones para"]')).toBeNull()

    fireEvent.click(button("Cancelar"))
    await flush()
    expect(action("Deshabilitar acceso")).toBeNull()

    await startEditing()
    fireEvent.click(action("Deshabilitar acceso")!)
    await flush()
    // The action buttons live inside the edit form but must not save it
    expect(onAction.mock.calls).toEqual([["access"]])
    expect(updateManagedUser).not.toHaveBeenCalled()
    first.unmount()

    const fresh = renderWithProviders(
      <ManagedUserDetailDialog {...props} user={{ ...user, pending_activation: true, invitation_expired: false } as ManagedUser} canEdit />,
    )
    await flush()
    expect(action("Eliminar cuenta pendiente")).toBeNull()
    await startEditing()
    expect(action("Eliminar cuenta pendiente")).not.toBeNull()
    expect(document.body.textContent).not.toContain("Reenviar invitación")
    fresh.unmount()

    renderWithProviders(<ManagedUserDetailDialog {...props} user={{ ...user, pending_activation: true, invitation_expired: true } as ManagedUser} canEdit />)
    await flush()
    expect(document.body.textContent).toContain("Invitación vencida")
    expect(action("Reenviar invitación")).toBeNull()
    await startEditing()
    expect(document.body.querySelector('button[aria-label^="Acciones para"]')).toBeNull()
    expect(action("Reenviar invitación")?.textContent).toContain("Reenviar invitación")
    expect(action("Eliminar cuenta pendiente")?.textContent).toContain("Eliminar cuenta pendiente")
  })

  it("no ofrece acciones en la propia cuenta", async () => {
    renderWithProviders(<ManagedUserDetailDialog {...props} canEdit={false} />)
    await flush()

    expect(document.body.querySelector('button[aria-label="Deshabilitar acceso"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label^="Acciones para"]')).toBeNull()
  })

  it("al guardar se cierra con el formulario y su aviso a la vista, y al abrir de nuevo muestra la ficha", async () => {
    vi.mocked(removeManagedUserRole).mockResolvedValue({ message: "Rol quitado" })
    const two = { ...user, roles: [...user.roles, { id: "r2", code: "coordinador", name: "Coordinador", career_name: "Software" }] } as unknown as ManagedUser
    const onSaved = vi.fn()
    const view = renderWithProviders(<ManagedUserDetailDialog {...props} user={two} canEdit onSaved={onSaved} />)
    await flush()
    fireEvent.click(button("Editar"))
    await flush()
    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Quitar el rol Coordinador de Software"]')!)
    await flush()

    fireEvent.click(button("Quitar rol"))
    await flush()

    expect(onSaved.mock.calls).toEqual([["Rol quitado"]])
    expect(document.body.textContent).toContain("Editar usuario")
    expect(document.body.querySelector("#managed-edit-nombres-u1")).not.toBeNull()
    expect(document.body.textContent).toContain("Ana Pérez deja de ser Coordinador de Software.")

    view.rerender(<ManagedUserDetailDialog {...props} user={two} canEdit onSaved={onSaved} open={false} />)
    await flush()
    view.rerender(<ManagedUserDetailDialog {...props} user={two} canEdit onSaved={onSaved} open />)
    await flush()
    expect(document.body.textContent).toContain("Datos de la cuenta")
    expect(document.body.querySelector("#managed-edit-nombres-u1")).toBeNull()
  })
})
