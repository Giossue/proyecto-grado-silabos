import { fireEvent, waitFor } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { TeacherSelect } from "@/components/domain/academic/TeacherSelect"
import { flush, renderWithProviders } from "@/test/render"

const teachers = [
  { id: "teacher-1", name: "MARÍA PÉREZ" },
  { id: "teacher-2", name: "EDUARDO NARVÁEZ" },
]
const trigger = () => document.body.querySelector<HTMLButtonElement>('button[role="combobox"]')!
const search = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Buscar docente por nombre"]')
const options = () => [...document.body.querySelectorAll<HTMLElement>('[data-slot="command-item"]')]
const filter = async (query: string) => {
  fireEvent.change(search()!, { target: { value: query } })
  await flush()
}
const open = async () => {
  fireEvent.click(trigger())
  await flush()
}

function Harness({ initial = "", onChange, required, invalid }: { initial?: string; onChange: (value: string) => void; required?: boolean; invalid?: boolean }) {
  const [value, setValue] = useState(initial)

  return (
    <TeacherSelect
      teachers={teachers}
      label="Docente del nuevo paralelo"
      value={value}
      required={required}
      invalid={invalid}
      onValueChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe("TeacherSelect", () => {
  it("filtra nombres sin distinguir mayúsculas ni tildes y selecciona por identificador", async () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    await open()

    expect(options().map((option) => option.textContent?.trim())).toEqual(["MARÍA PÉREZ", "EDUARDO NARVÁEZ"])
    await filter("maria perez")
    expect(options().map((option) => option.textContent?.trim())).toEqual(["MARÍA PÉREZ"])
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(options()[0]!)
    await flush()

    expect(onChange.mock.calls).toEqual([["teacher-1"]])
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(search()).toBeNull()
    expect(trigger().textContent).toContain("MARÍA PÉREZ")
  })

  it("informa cuando no hay resultados y permite limpiar la búsqueda sin cambiar el docente", async () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness initial="teacher-2" onChange={onChange} />)
    expect(trigger().textContent).toContain("EDUARDO NARVÁEZ")
    await open()
    await filter("inexistente")

    expect(options()).toHaveLength(0)
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain("No se encontraron docentes")
    await filter("")
    expect(options()).toHaveLength(2)
    expect(document.body.querySelector('[role="status"]')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("marca la elección obligatoria y no ofrece Sin docente entre las opciones", async () => {
    renderWithProviders(<Harness onChange={vi.fn()} required invalid />)
    expect(trigger().textContent).toContain("Elija el docente")
    expect(trigger().getAttribute("aria-required")).toBe("true")
    expect(trigger().getAttribute("aria-invalid")).toBe("true")
    await open()

    expect(options().map((option) => option.textContent?.trim())).not.toContain("Sin docente")
  })

  it("permite buscar y confirmar un docente con el teclado", async () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    await open()
    await waitFor(() => expect(document.activeElement).toBe(search()))
    await filter("eduardo")
    fireEvent.keyDown(search()!, { key: "ArrowDown" })
    await flush()
    fireEvent.keyDown(search()!, { key: "Enter" })
    await flush()

    expect(onChange.mock.calls).toEqual([["teacher-2"]])
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it("cierra con Escape sin cambiar la selección y limpia el buscador al reabrir", async () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness initial="teacher-2" onChange={onChange} />)
    await open()
    await filter("maria")
    fireEvent.keyDown(search()!, { key: "Escape" })
    await flush()

    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(onChange).not.toHaveBeenCalled()
    await open()
    expect(search()!.value).toBe("")
    expect(options()).toHaveLength(2)
  })

  it("explica que solo aparecen los docentes que ya activaron su cuenta", async () => {
    renderWithProviders(<Harness onChange={vi.fn()} />)
    await open()

    expect(document.body.textContent).toContain("Solo aparecen los docentes que ya activaron su cuenta")
  })
})
