import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { createMalla, updateMalla } from "@/api/career-academics"
import { MallaDialog } from "@/components/domain/academic/curriculum/MallaDialog"
import { flush, renderWithProviders } from "@/test/render"
import type { Malla } from "@/types/academic"

vi.mock("@/api/career-academics", () => ({ createMalla: vi.fn(), updateMalla: vi.fn() }))

const previous: Malla = { id: "malla-8", name: "Malla SW-8", resolution: null, cycle_count: 4, state: "en_transicion", subject_count: 7 }

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })
}

const submit = async (): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: /Crear malla|Guardar malla/ }))
  await flush()
}

describe("MallaDialog", () => {
  beforeEach(() => {
    vi.mocked(createMalla).mockReset().mockResolvedValue({ message: "Malla creada.", id: "malla-new" })
    vi.mocked(updateMalla).mockReset().mockResolvedValue({ message: "Malla actualizada." })
  })

  it("crea una malla con nombre, resolución, ciclos y estado", async () => {
    const onSaved = vi.fn()
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={null} onSaved={onSaved} />)
    type("Nombre", "Malla 2026")
    type("Resolución", " RCU-2026-010 ")
    type("Cantidad de ciclos", "9")
    type("Estado", "vigente")
    await submit()

    expect(createMalla).toHaveBeenCalledWith({ name: "Malla 2026", resolution: "RCU-2026-010", cycle_count: 9, state: "vigente" })
    expect(onSaved).toHaveBeenCalledWith("Malla creada.", "malla-new")
  })

  it("con campos vacíos deja el botón habilitado, marca cada campo y enfoca el primero sin llamar al servidor", async () => {
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={null} onSaved={vi.fn()} />)
    const button = screen.getByRole("button", { name: /Crear malla/ })
    expect(button).toBeEnabled()
    await submit()

    expect(document.body.textContent).toContain("El campo nombre es obligatorio")
    expect(document.body.textContent).toContain("El campo cantidad de ciclos es obligatorio")
    expect(document.activeElement).toBe(screen.getByLabelText("Nombre", { exact: false }))
    expect(createMalla).not.toHaveBeenCalled()
  })

  it("edita nombre, resolución y estado sin pedir los ciclos", async () => {
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={previous} onSaved={vi.fn()} />)
    expect(screen.queryByLabelText("Cantidad de ciclos", { exact: false })).toBeNull()
    expect(screen.getByLabelText("Nombre", { exact: false })).toHaveValue("Malla SW-8")
    type("Estado", "cerrada")
    await submit()

    expect(updateMalla).toHaveBeenCalledWith("malla-8", { name: "Malla SW-8", resolution: null, state: "cerrada" })
  })

  it("muestra el rechazo del servidor junto al campo", async () => {
    const refusal = "No se puede cerrar la malla: sus materias tienen sílabos en un periodo académico abierto."
    vi.mocked(updateMalla).mockRejectedValue(new ApiError(refusal, 422, { state: [refusal] }))
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={previous} onSaved={vi.fn()} />)
    type("Estado", "cerrada")
    await submit()

    expect(document.body.textContent).toContain("No se puede cerrar la malla")
  })
})
