import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { paths } from "@/lib/routes"
import { sessionState } from "@/state/session"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))

afterEach(() => sessionState.clear())

const signIn = (code: "administrador" | "coordinador") =>
  sessionState.replace({
    user: { id: "user-1", name: "Usuario", email: "u@ueb.edu.ec", email_verified: true, can_edit_identity: false },
    active_role: { id: "role-1", code, career_id: code === "coordinador" ? "career-1" : null, career_name: code === "coordinador" ? "Software" : null },
    available_roles: [],
  })

describe("ProcessLockAlert", () => {
  it("avisa en una línea corta, sin repetir el período ni la fecha, y envía a Coordinación a Revisión", () => {
    signIn("coordinador")
    const { container } = renderWithProviders(
      <ProcessLockAlert lock={{ scope: "convocation", period: "2026-I", institutional_pause: false, delivery_on: "2026-10-30" }} />,
    )

    expect(container.textContent).toContain("Edición bloqueada")
    expect(container.textContent).not.toContain("2026-I")
    expect(container.textContent).not.toContain("30 de octubre")
    expect(container.textContent).toContain("Pause el proceso de sílabos de su carrera para editar")
    const link = screen.getByRole("link")
    expect(link.textContent).toBe("Ir a Revisión")
    expect(link.getAttribute("href")).toBe(paths.coordination.reviews)
  })

  it("a Administración le habla del proceso y la envía a Procesos de sílabos", () => {
    signIn("administrador")
    const { container } = renderWithProviders(<ProcessLockAlert lock={{ scope: "process", period: "2026-I", institutional_pause: false, delivery_on: null }} />)

    expect(container.textContent).toContain("Pause el proceso para editar")
    expect(screen.getByRole("link").getAttribute("href")).toBe(paths.admin.convocations)
  })

  it("explica el motivo en un detalle y avisa si la pausa institucional no basta", async () => {
    signIn("coordinador")
    const user = userEvent.setup()
    renderWithProviders(<ProcessLockAlert lock={{ scope: "convocation", period: "2026-I", institutional_pause: true, delivery_on: "2026-10-30" }} />)

    await user.click(screen.getByRole("button", { name: "¿Por qué?" }))

    expect(document.body.textContent).toContain("Administración pausó el proceso de sílabos, pero el de su carrera sigue abierto")
    expect(document.body.textContent).toContain("volverán a Borrador")
  })

  it("un aviso propio puede traer su «¿Por qué?»", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ProcessLockAlert banner title="Hay un proceso de sílabos abierto" message="Si cambia algo, vuelven a Borrador" why="Se pedirá confirmación antes de cambiar" hideAction />,
    )

    await user.click(screen.getByRole("button", { name: "¿Por qué?" }))

    expect(document.body.textContent).toContain("Se pedirá confirmación antes de cambiar")
  })

  it("sirve también para avisos propios sin acción ni detalle", () => {
    const { container } = renderWithProviders(<ProcessLockAlert title="Edición no disponible" message="El proceso de sílabos está en pausa" hideAction />)

    expect(container.textContent).toContain("Edición no disponible")
    expect(container.textContent).toContain("El proceso de sílabos está en pausa")
    expect(screen.queryByRole("link")).toBeNull()
    expect(container.textContent).not.toContain("¿Por qué?")
  })

  it("mantiene el mensaje genérico cuando el servidor no envía el detalle", () => {
    signIn("coordinador")
    const { container } = renderWithProviders(<ProcessLockAlert />)

    expect(container.textContent).toContain("Edición bloqueada")
    expect(container.textContent).not.toContain("¿Por qué?")
  })
})
