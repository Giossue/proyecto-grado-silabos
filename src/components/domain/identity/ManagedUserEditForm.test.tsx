import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { removeManagedUserRole, updateManagedUser, type ManagedUser } from "@/api/admin-users"
import { ApiError } from "@/api/client"
import { ManagedUserEditForm } from "@/components/domain/identity/ManagedUserEditForm"
import { flush, renderWithProviders } from "@/test/render"

const CAREER_ID = "0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

vi.mock("@/api/admin-users", () => ({ updateManagedUser: vi.fn(), removeManagedUserRole: vi.fn() }))
const update = vi.mocked(updateManagedUser)
const remove = vi.mocked(removeManagedUserRole)
const style = document.createElement("style")
style.textContent = '[data-state="closed"] { animation-name: exit; }'

const user: ManagedUser = {
  id: "u1",
  nombre: "ANA PÉREZ",
  correo_electronico: "ana@ueb.edu.ec",
  active: true,
  pending_activation: false,
  invitation_expired: false,
  two_factor_enabled: false,
  roles: [{ id: "r1", code: "docente", name: "Docente", career_name: "Software" }],
  careers: ["Software"],
  assignments: [],
}
const roles = [
  { codigo: "docente", nombre: "Docente" },
  { codigo: "coordinador", nombre: "Coordinador" },
]
const button = (label: string): HTMLButtonElement => [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === label) as HTMLButtonElement

describe("ManagedUserEditForm", () => {
  afterEach(() => {
    update.mockReset()
    style.remove()
  })

  it("si la carrera ya tiene coordinador pide confirmar y reenvía con el reemplazo", async () => {
    update.mockImplementationOnce(async () => {
      throw new ApiError("La carrera ya tiene como coordinador a JUAN", 422, { replace_coordinator: ["La carrera ya tiene como coordinador a JUAN"] })
    })
    update.mockImplementationOnce(async () => ({ message: "Cuenta actualizada" }))
    const onSaved = vi.fn()
    const actor = userEvent.setup()
    renderWithProviders(<ManagedUserEditForm user={user} roles={roles} careers={[{ id: CAREER_ID, nombre: "Software" }]} onSaved={onSaved} onCancel={vi.fn()} />)
    await actor.click(screen.getByRole("combobox", { name: "Agregar otro rol (opcional)" }))
    await actor.click(await screen.findByRole("option", { name: "Coordinador" }))
    await actor.click(screen.getByRole("combobox", { name: /Carrera/ }))
    await actor.click(await screen.findByRole("option", { name: "Software" }))

    fireEvent.submit(document.body.querySelector("form")!)
    await flush()
    expect(document.body.textContent).toContain("La carrera ya tiene como coordinador a JUAN")

    fireEvent.click(button("Reemplazar"))
    await flush()

    expect(update).toHaveBeenLastCalledWith("u1", expect.objectContaining({ role_code: "coordinador", career_id: CAREER_ID, replace_coordinator: true }))
    expect(onSaved.mock.calls).toEqual([["Cuenta actualizada"]])
  })

  it("muestra el nombre en Nombres y Apellidos, sin el texto de ayuda, y guarda el nombre completo", async () => {
    update.mockResolvedValue({ message: "Cuenta actualizada" })
    renderWithProviders(<ManagedUserEditForm user={{ ...user, nombre: "ANA MARÍA PÉREZ LÓPEZ" }} roles={roles} careers={[]} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await flush()
    const field = (key: string): HTMLInputElement => document.body.querySelector<HTMLInputElement>(`#managed-edit-${key}-u1`)!

    expect([field("nombres").value, field("apellidos").value]).toEqual(["ANA MARÍA", "PÉREZ LÓPEZ"])
    expect(document.body.textContent).not.toContain("Primer y segundo nombre, primer y segundo apellido")
    expect(document.body.querySelector("#managed-edit-name-u1")).toBeNull()

    fireEvent.change(field("apellidos"), { target: { value: "pérez gómez" } })
    await flush()
    fireEvent.submit(document.body.querySelector("form")!)
    await flush()

    expect(update).toHaveBeenCalledWith("u1", expect.objectContaining({ nombre: "ANA MARÍA PÉREZ GÓMEZ" }))
  })

  it("al quitar un rol, el aviso sigue nombrando ese rol mientras se cierra", async () => {
    document.head.append(style)
    remove.mockResolvedValue({ message: "Rol quitado" })
    const two: ManagedUser = { ...user, roles: [...user.roles, { id: "r2", code: "coordinador", name: "Coordinador", career_name: "Software" }] }
    const onSaved = vi.fn()
    renderWithProviders(<ManagedUserEditForm user={two} roles={roles} careers={[]} onSaved={onSaved} onCancel={vi.fn()} />)
    await flush()

    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Quitar el rol Coordinador de Software"]')!)
    await flush()
    expect(document.body.textContent).toContain("ANA PÉREZ deja de ser Coordinador de Software.")

    fireEvent.click(button("Quitar rol"))
    await flush()

    expect(onSaved.mock.calls).toEqual([["Rol quitado"]])
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("closed")
    expect(document.body.textContent).toContain("ANA PÉREZ deja de ser Coordinador de Software.")
  })
})
