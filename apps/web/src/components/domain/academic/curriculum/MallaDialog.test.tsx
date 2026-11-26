import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { createMalla, updateCurriculumConfiguration, updateMalla } from "@/api/career-academics"
import { MallaDialog } from "@/components/domain/academic/curriculum/MallaDialog"
import { flush, renderWithProviders } from "@/test/render"
import type { Malla } from "@/types/academic"

vi.mock("@/api/career-academics", () => ({ createMalla: vi.fn(), updateCurriculumConfiguration: vi.fn(), updateMalla: vi.fn() }))

const previous: Malla = { id: "malla-8", code: "SW-8", cycle_count: 4, state: "cerrada", subject_count: 7 }
const current: Malla = { id: "malla-9", code: "SW-9", cycle_count: 3, state: "vigente", subject_count: 6 }

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })
}

const chooseState = async (label: string): Promise<void> => {
  const actor = userEvent.setup()
  await actor.click(screen.getByRole("combobox", { name: /Estado/ }))
  await actor.click(await screen.findByRole("option", { name: label }))
}

const submit = async (): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: /Crear malla|Guardar malla/ }))
  await flush()
}

describe("MallaDialog", () => {
  beforeEach(() => {
    vi.mocked(createMalla).mockReset().mockResolvedValue({ message: "Malla creada.", id: "malla-new" })
    vi.mocked(updateMalla).mockReset().mockResolvedValue({ message: "Malla actualizada." })
    vi.mocked(updateCurriculumConfiguration).mockReset().mockResolvedValue({ message: "Configuración de la malla actualizada." })
  })

  it("crea una malla con código y ciclos, sin pedir nombre ni estado", async () => {
    const onSaved = vi.fn()
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={null} onSaved={onSaved} />)
    expect(screen.queryByLabelText("Nombre", { exact: false })).toBeNull()
    expect(screen.queryByRole("combobox", { name: /Estado/ })).toBeNull()
    expect(document.body.textContent).toContain("Indique el código y la cantidad de ciclos")
    const code = screen.getByLabelText("Código de malla", { exact: false })
    expect(code).toHaveAttribute("id", "malla-code")
    expect(code).toHaveAttribute("maxLength", "80")
    type("Código", "  SW-10  ")
    type("Cantidad de ciclos", "9")
    await submit()

    expect(createMalla).toHaveBeenCalledWith({ code: "SW-10", cycle_count: 9 })
    expect(onSaved).toHaveBeenCalledWith("Malla creada.", "malla-new")
  })

  it("muestra junto al código el rechazo del servidor por código repetido", async () => {
    const duplicate = "Ya existe una malla con ese código en esta carrera."
    vi.mocked(createMalla).mockRejectedValue(new ApiError(duplicate, 422, { code: [duplicate] }))
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={null} onSaved={vi.fn()} />)
    type("Código", "SW-8")
    type("Cantidad de ciclos", "4")
    await submit()

    expect(screen.getByLabelText("Código", { exact: false })).toHaveAttribute("aria-invalid", "true")
    expect(document.body.textContent).toContain("Ya existe una malla con ese código en esta carrera")
  })

  it("con campos vacíos deja el botón habilitado, marca cada campo y enfoca el primero sin llamar al servidor", async () => {
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={null} onSaved={vi.fn()} />)
    const button = screen.getByRole("button", { name: /Crear malla/ })
    expect(button).toBeEnabled()
    await submit()

    expect(document.body.textContent).toContain("El campo código es obligatorio")
    expect(document.body.textContent).toContain("El campo cantidad de ciclos es obligatorio")
    expect(document.activeElement).toBe(screen.getByLabelText("Código", { exact: false }))
    expect(createMalla).not.toHaveBeenCalled()
  })

  it("al editar ofrece solo los estados Vigente y Cerrada en el selector de shadcn, sin campo de resolución", async () => {
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={current} onSaved={vi.fn()} />)
    const state = screen.getByRole("combobox", { name: /Estado/ })
    expect(state.tagName).toBe("BUTTON")
    await userEvent.setup().click(state)
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent)
    expect(options).toEqual(["Vigente", "Cerrada"])
    expect(screen.queryByLabelText("Resolución", { exact: false })).toBeNull()
    expect(document.body.textContent).toContain("Las mallas vigentes generan sílabos; una malla cerrada deja de generarlos")
    expect(document.body.textContent).not.toContain("pasa a cerrada")
    expect(document.body.textContent).not.toContain("solo una está vigente")
    expect(document.body.textContent).not.toContain("transición")
  })

  it("reabre una malla cerrada como vigente", async () => {
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={previous} onSaved={vi.fn()} />)
    await chooseState("Vigente")
    await submit()

    expect(updateMalla).toHaveBeenCalledWith("malla-8", { code: "SW-8", state: "vigente" })
  })

  it("edita código, ciclos y estado en el mismo diálogo", async () => {
    const onSaved = vi.fn()
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={current} onSaved={onSaved} />)
    expect(document.body.textContent).toContain("Cambie el código, los ciclos o el estado")
    expect(screen.getByLabelText("Código", { exact: false })).toHaveValue("SW-9")
    expect(screen.getByLabelText("Cantidad de ciclos", { exact: false })).toHaveValue(3)
    expect(screen.getByRole("combobox", { name: /Estado/ }).textContent).toContain("Vigente")
    type("Código", "SW-9A")
    type("Cantidad de ciclos", "5")
    await chooseState("Cerrada")
    await submit()

    expect(updateCurriculumConfiguration).toHaveBeenCalledWith("malla-9", { cycle_count: 5 })
    expect(updateMalla).toHaveBeenCalledWith("malla-9", { code: "SW-9A", state: "cerrada" })
    expect(onSaved.mock.calls).toEqual([["Malla actualizada.", "malla-9"]])
  })

  it("sin cambiar los ciclos no vuelve a configurarlos", async () => {
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={current} onSaved={vi.fn()} />)
    type("Código", "SW-9A")
    await submit()

    expect(updateCurriculumConfiguration).not.toHaveBeenCalled()
    expect(updateMalla).toHaveBeenCalledWith("malla-9", { code: "SW-9A", state: "vigente" })
  })

  it("si el servidor rechaza los ciclos lo muestra junto al campo y no guarda nada más", async () => {
    const refusal = "Existen materias en el ciclo 3. Muévalas antes de reducir la malla."
    vi.mocked(updateCurriculumConfiguration).mockRejectedValue(new ApiError(refusal, 422, { cycle_count: [refusal] }))
    const onSaved = vi.fn()
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={current} onSaved={onSaved} />)
    type("Cantidad de ciclos", "2")
    await submit()

    expect(screen.getByLabelText("Cantidad de ciclos", { exact: false })).toHaveAttribute("aria-invalid", "true")
    expect(document.body.textContent).toContain("Existen materias en el ciclo 3")
    expect(updateMalla).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("muestra el bloqueo del periodo académico al configurar los ciclos", async () => {
    const lock = "Pause el periodo académico para editar la malla."
    vi.mocked(updateCurriculumConfiguration).mockRejectedValue(new ApiError(lock, 422, { process: [lock] }))
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={current} onSaved={vi.fn()} />)
    type("Cantidad de ciclos", "5")
    await submit()

    expect(screen.getByRole("alert").textContent).toContain("Pause el periodo académico para editar la malla")
  })

  it("si los ciclos se guardan y el resto se rechaza, avisa lo guardado y deja el diálogo abierto con el error", async () => {
    const duplicate = "Ya existe una malla con ese código en esta carrera."
    vi.mocked(updateMalla).mockRejectedValue(new ApiError(duplicate, 422, { code: [duplicate] }))
    const onSaved = vi.fn()
    const onOpenChange = vi.fn()
    renderWithProviders(<MallaDialog open onOpenChange={onOpenChange} malla={current} onSaved={onSaved} />)
    type("Código", "SW-8")
    type("Cantidad de ciclos", "5")
    await submit()

    expect(onSaved.mock.calls).toEqual([["Configuración de la malla actualizada.", "malla-9"]])
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Código", { exact: false })).toHaveAttribute("aria-invalid", "true")
    expect(document.body.textContent).toContain("Ya existe una malla con ese código en esta carrera")
  })

  it("muestra el rechazo del servidor junto al campo", async () => {
    const refusal = "No se puede cerrar la malla: sus materias tienen sílabos en un periodo académico abierto."
    vi.mocked(updateMalla).mockRejectedValue(new ApiError(refusal, 422, { state: [refusal] }))
    renderWithProviders(<MallaDialog open onOpenChange={vi.fn()} malla={current} onSaved={vi.fn()} />)
    await chooseState("Cerrada")
    await submit()

    expect(document.body.textContent).toContain("No se puede cerrar la malla")
  })
})
