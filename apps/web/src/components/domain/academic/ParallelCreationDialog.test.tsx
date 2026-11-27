import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
const ADD_CODE = "Código del nuevo paralelo"
const codeBox = (label: string): HTMLElement => screen.getByRole("combobox", { name: label })
const offeredCodes = async (label: string): Promise<string[]> => {
  const actor = userEvent.setup()
  await actor.click(codeBox(label))
  const names = within(await screen.findByRole("listbox"))
    .queryAllByRole("option")
    .map((option) => option.textContent ?? "")
  await actor.keyboard("{Escape}")
  await flush()

  return names
}
const chooseCode = async (label: string, code: string): Promise<void> => {
  const actor = userEvent.setup()
  await actor.click(codeBox(label))
  await actor.click(await screen.findByRole("option", { name: code }))
  await flush()
}
const chooseNewTeacher = async (): Promise<void> => {
  fireEvent.click(button("Docente del nuevo paralelo")!)
  await flush()
  fireEvent.click(document.body.querySelector<HTMLElement>('[data-slot="command-item"]')!)
  await flush()
}
const openAddRow = async (): Promise<void> => {
  fireEvent.click(buttonContaining("Agregar paralelo")!)
  await flush()
}
const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
const lettersBut = (...taken: string[]): string[] => ALPHABET.filter((letter) => !taken.includes(letter))
const withCodes = (...codes: string[]) => codes.map((code, index) => ({ id: `p-${index}`, code, shift: "matutina", editable: true, deletable: true }))

describe("ParallelCreationDialog", () => {
  it("propone la jornada matutina y la envía siempre al crear", async () => {
    api.createParallels.mockResolvedValue({ message: "Creado" })
    await mountDialog()

    expect(document.body.textContent).not.toContain("Sin jornada")
    fireEvent.click(buttonContaining("Agregar paralelo")!)
    await flush()
    await chooseCode(ADD_CODE, "C")
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

  it("no crea un paralelo con código y jornada completos si falta el docente: lo marca y lleva el foco allí", async () => {
    await mountDialog()
    await openAddRow()
    await chooseCode(ADD_CODE, "C")
    expect(button("Docente del nuevo paralelo")?.textContent).toContain("Elija el docente")
    expect(button("Docente del nuevo paralelo")?.getAttribute("aria-required")).toBe("true")

    expect(button("Guardar nuevo paralelo")!.disabled).toBe(false)
    fireEvent.click(button("Guardar nuevo paralelo")!)
    await flush()

    expect(api.createParallels).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Elija el paralelo, la jornada y el docente del paralelo")
    expect(button("Docente del nuevo paralelo")?.getAttribute("aria-invalid")).toBe("true")
    expect(codeBox(ADD_CODE).getAttribute("aria-invalid")).toBeNull()
    expect(document.activeElement).toBe(button("Docente del nuevo paralelo"))
  })

  it("sin paralelo elegido, guardar lo marca primero y lleva el foco a la lista", async () => {
    await mountDialog()
    await openAddRow()
    fireEvent.click(button("Guardar nuevo paralelo")!)
    await flush()

    expect(api.createParallels).not.toHaveBeenCalled()
    expect(codeBox(ADD_CODE).getAttribute("aria-invalid")).toBe("true")
    expect(button("Docente del nuevo paralelo")?.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(codeBox(ADD_CODE))
  })

  it("mientras se guarda el paralelo nuevo no se puede volver a enviar", async () => {
    api.createParallels.mockReturnValue(new Promise(() => undefined))
    await mountDialog()
    await openAddRow()
    await chooseCode(ADD_CODE, "C")
    await chooseNewTeacher()
    fireEvent.click(button("Guardar nuevo paralelo")!)
    await flush()
    expect(button("Guardar nuevo paralelo")!.disabled).toBe(true)
    fireEvent.click(button("Guardar nuevo paralelo")!)
    await flush()

    expect(api.createParallels).toHaveBeenCalledTimes(1)
  })

  it("el paralelo se elige de una lista, sin casilla de texto, con las letras de la A a la Z que la materia no usa", async () => {
    await mountDialog()
    await openAddRow()

    expect(screen.queryByRole("textbox", { name: ADD_CODE })).toBeNull()
    expect(codeBox(ADD_CODE).textContent).toBe("Elija el paralelo")
    expect(await offeredCodes(ADD_CODE)).toEqual(lettersBut("A", "B"))
  })

  it("una letra usada en minúscula o con espacios tampoco se ofrece, y un código largo no quita ninguna", async () => {
    await mountDialog({ parallels: withCodes("a", " C ", "B1", "Nocturno") })
    await openAddRow()

    expect(await offeredCodes(ADD_CODE)).toEqual(lettersBut("A", "C"))
  })

  it("sin letras libres la lista lo dice y no se envía nada", async () => {
    await mountDialog({ parallels: withCodes(...ALPHABET) })
    await openAddRow()
    const actor = userEvent.setup()
    await actor.click(codeBox(ADD_CODE))
    const list = await screen.findByRole("listbox")

    expect(within(list).queryAllByRole("option")).toHaveLength(0)
    expect(list.textContent).toContain("No quedan letras libres")
    await actor.keyboard("{Escape}")
  })

  it("la letra de un paralelo eliminado vuelve a ofrecerse", async () => {
    const view = renderWithProviders(<ParallelCreationDialog {...base} />)
    await flush()
    await openAddRow()
    view.rerender(<ParallelCreationDialog {...base} parallels={[base.parallels[0]!]} />)
    await flush()

    expect(await offeredCodes(ADD_CODE)).toEqual(lettersBut("A"))
  })

  it("al editar, la lista ofrece la letra actual y las libres, sin las de los otros paralelos", async () => {
    await mountDialog()
    fireEvent.click(button("Editar paralelo B")!)
    await flush()

    expect(codeBox("Código del paralelo B").textContent).toBe("B")
    expect(await offeredCodes("Código del paralelo B")).toEqual(lettersBut("A"))
  })

  it.each([["B1"], ["a"], ["Paralelo nocturno"]])("un paralelo guardado como «%s» conserva su código al cambiar solo la jornada", async (code) => {
    api.updateParallel.mockResolvedValue({ message: "Paralelo actualizado." })
    await mountDialog({ parallels: withCodes(code, "C") })
    fireEvent.click(button(`Editar paralelo ${code}`)!)
    await flush()
    expect(codeBox(`Código del paralelo ${code}`).textContent).toBe(code)

    const actor = userEvent.setup()
    await actor.click(screen.getByRole("combobox", { name: `Jornada del paralelo ${code}` }))
    await actor.click(await screen.findByRole("option", { name: "Nocturna" }))
    await flush()
    fireEvent.click(button(`Guardar paralelo ${code}`)!)
    await flush()

    expect(api.updateParallel.mock.calls).toEqual([["p-0", { code, shift: "nocturna" }]])
  })

  it("un código que no es una letra encabeza la lista y no se pierde aunque se abra y se guarde sin cambios", async () => {
    await mountDialog({ parallels: withCodes("B1", "C") })
    fireEvent.click(button("Editar paralelo B1")!)
    await flush()

    expect(await offeredCodes("Código del paralelo B1")).toEqual(["B1", ...lettersBut("C")])
    expect(codeBox("Código del paralelo B1").textContent).toBe("B1")
    fireEvent.click(button("Guardar paralelo B1")!)
    await flush()

    expect(api.updateParallel).not.toHaveBeenCalled()
    expect(onChanged.mock.calls).toEqual([["Sin cambios"]])
  })

  it("edita en línea un paralelo registrado y solo ofrece eliminar el que no tiene actividad", async () => {
    api.updateParallel.mockResolvedValue({ message: "Paralelo actualizado." })
    await mountDialog()

    expect(button("Eliminar paralelo A")).toBeNull()
    expect(button("Eliminar paralelo B")).not.toBeNull()

    fireEvent.click(button("Editar paralelo B")!)
    await flush()
    await chooseCode("Código del paralelo B", "D")
    fireEvent.click(button("Guardar paralelo B")!)
    await flush()

    expect(api.updateParallel).toHaveBeenCalledWith("p-b", { code: "D", shift: "vespertina" })
    expect(onChanged.mock.calls[0]).toEqual(["Paralelo actualizado."])
  })

  it("mientras se guarda la edición no se puede volver a enviar", async () => {
    api.updateParallel.mockReturnValue(new Promise(() => undefined))
    await mountDialog()
    fireEvent.click(button("Editar paralelo B")!)
    await flush()
    await chooseCode("Código del paralelo B", "D")
    expect(button("Guardar paralelo B")!.disabled).toBe(false)
    fireEvent.click(button("Guardar paralelo B")!)
    await flush()

    expect(button("Guardar paralelo B")!.disabled).toBe(true)
    expect(api.updateParallel).toHaveBeenCalledTimes(1)
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
