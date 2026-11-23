import { fireEvent } from "@testing-library/react"
import { type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ParallelCreationDialog } from "@/components/domain/academic/ParallelCreationDialog"
import { buttonContaining } from "@/components/domain/academic/academicTestUtils"
import { flush, renderWithProviders } from "@/test/render"

const api = vi.hoisted(() => ({
  createParallels: vi.fn(),
  updateParallel: vi.fn(),
  deleteParallel: vi.fn(),
  createCareerRecord: vi.fn(),
  deleteCareerRecord: vi.fn(),
  replaceParallelTeacher: vi.fn(),
}))
vi.mock("@/api/career-academics", () => api)

afterEach(() => {
  vi.clearAllMocks()
})

type DialogProps = ComponentProps<typeof ParallelCreationDialog>

const onChanged = vi.fn()
const onSaved = vi.fn()
const base: DialogProps = {
  open: true,
  onOpenChange: vi.fn(),
  shiftOptions: [
    { value: "matutina", label: "Matutina" },
    { value: "vespertina", label: "Vespertina" },
    { value: "nocturna", label: "Nocturna" },
  ],
  subjectId: "subject-1",
  subjectLabel: "SW-1 · Materia",
  teacherUsers: [{ id: "teacher-1", name: "DOCENTE UNO", email: "docente@example.test" }],
  parallels: [
    { id: "p-a", code: "A", shift: "matutina", editable: true, deletable: false },
    { id: "p-b", code: "B", shift: "vespertina", editable: true, deletable: true },
  ],
  onChanged,
  onSaved,
}
const mountDialog = async (extra: Partial<DialogProps> = {}) => {
  renderWithProviders(<ParallelCreationDialog {...base} {...extra} />)
  await flush()
}
const button = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const type = async (input: HTMLInputElement, value: string) => {
  fireEvent.change(input, { target: { value } })
  await flush()
}

describe("ParallelCreationDialog", () => {
  it("propone la jornada matutina y la envía siempre al crear", async () => {
    api.createParallels.mockResolvedValue({ message: "Creado" })
    await mountDialog()

    expect(document.body.textContent).not.toContain("Sin jornada")
    fireEvent.click(buttonContaining("Agregar paralelo")!)
    await flush()
    await type(document.body.querySelector<HTMLInputElement>("#parallel-code-subject-1")!, "C")
    fireEvent.click(button("Docente del nuevo paralelo")!)
    await flush()
    expect([...document.body.querySelectorAll('[data-slot="command-item"]')].map((option) => option.textContent?.trim())).toEqual(["DOCENTE UNO"])
    fireEvent.click(document.body.querySelector<HTMLElement>('[data-slot="command-item"]')!)
    await flush()
    fireEvent.click(button("Guardar nuevo paralelo")!)
    await flush()

    expect(api.createParallels).toHaveBeenCalledWith({ subject_id: "subject-1", codes: ["C"], shift: "matutina", user_id: "teacher-1" })
    expect(api.createCareerRecord).not.toHaveBeenCalled()
    expect(onSaved.mock.calls).toEqual([["Creado"]])
  })

  it("no crea un paralelo con código y jornada completos si falta el docente", async () => {
    await mountDialog()
    fireEvent.click(buttonContaining("Agregar paralelo")!)
    await flush()
    await type(document.body.querySelector<HTMLInputElement>("#parallel-code-subject-1")!, "C")
    expect(button("Docente del nuevo paralelo")?.textContent).toContain("Elija el docente")
    expect(button("Docente del nuevo paralelo")?.getAttribute("aria-required")).toBe("true")

    expect(button("Guardar nuevo paralelo")!.disabled).toBe(true)
    fireEvent.click(button("Guardar nuevo paralelo")!)
    await flush()

    expect(api.createParallels).not.toHaveBeenCalled()
  })

  it("edita en línea un paralelo registrado y solo ofrece eliminar el que no tiene actividad", async () => {
    api.updateParallel.mockResolvedValue({ message: "Paralelo actualizado." })
    await mountDialog()

    expect(button("Eliminar paralelo A")).toBeNull()
    expect(button("Eliminar paralelo B")).not.toBeNull()

    fireEvent.click(button("Editar paralelo B")!)
    await flush()
    await type(document.body.querySelector<HTMLInputElement>('input[aria-label="Código del paralelo B"]')!, "D")
    fireEvent.click(button("Guardar paralelo B")!)
    await flush()

    expect(api.updateParallel).toHaveBeenCalledWith("p-b", { code: "D", shift: "vespertina" })
    expect(onChanged.mock.calls[0]).toEqual(["Paralelo actualizado."])
  })

  it("no guarda un paralelo sin código", async () => {
    await mountDialog()
    fireEvent.click(button("Editar paralelo A")!)
    await flush()
    await type(document.body.querySelector<HTMLInputElement>('input[aria-label="Código del paralelo A"]')!, " ")
    expect(button("Guardar paralelo A")!.disabled).toBe(true)
    fireEvent.click(button("Guardar paralelo A")!)
    await flush()

    expect(api.updateParallel).not.toHaveBeenCalled()
  })

  it("busca al editar, conserva al docente actual fuera de la lista y guarda solo al confirmar", async () => {
    api.replaceParallelTeacher.mockResolvedValue({ message: "Asignado." })
    await mountDialog({
      teacherUsers: [{ id: "teacher-new", name: "MARÍA PÉREZ", email: "maria@example.test" }],
      assignments: [{ id: "assignment-1", parallel_id: "p-a", user_id: "teacher-current", user_name: "DOCENTE ACTUAL", active: true, editable: true }],
    })
    fireEvent.click(button("Editar paralelo A")!)
    await flush()
    fireEvent.click(button("Docente del paralelo A")!)
    await flush()

    expect(document.body.textContent).toContain("DOCENTE ACTUAL")
    fireEvent.change(document.body.querySelector<HTMLInputElement>('input[aria-label="Buscar docente por nombre"]')!, { target: { value: "maria perez" } })
    await flush()
    const options = [...document.body.querySelectorAll<HTMLElement>('[data-slot="command-item"]')]
    expect(options).toHaveLength(1)
    fireEvent.click(options[0]!)
    await flush()

    expect(button("Docente del paralelo A")?.textContent).toContain("MARÍA PÉREZ")
    expect(api.replaceParallelTeacher).not.toHaveBeenCalled()
    fireEvent.click(button("Guardar paralelo A")!)
    await flush()

    expect(api.replaceParallelTeacher).toHaveBeenCalledWith("p-a", "teacher-new")
    expect(api.deleteCareerRecord).not.toHaveBeenCalled()
    expect(api.createCareerRecord).not.toHaveBeenCalled()
    expect(onChanged.mock.calls[0]).toEqual(["Asignado."])
  })
})
