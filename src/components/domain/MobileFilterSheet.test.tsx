import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MobileFilterSheet } from "@/components/domain/MobileFilterSheet"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { renderWithProviders } from "@/test/render"

const panel = (): HTMLElement => screen.getByRole("group", { name: "Filtros de la tabla" })
const openButton = (): HTMLElement => document.body.querySelector<HTMLElement>("button[aria-expanded]")!

describe("MobileFilterSheet", () => {
  afterEach(() => vi.useRealTimers())

  it("en el celular sale como los modales: se desvanece y recién después se oculta", async () => {
    vi.useFakeTimers()
    renderWithProviders(
      <MobileFilterSheet>
        <select defaultValue="all" aria-label="Estado">
          <option value="all">Todos</option>
        </select>
      </MobileFilterSheet>,
    )
    expect(panel().classList.contains("max-sm:hidden")).toBe(true)

    fireEvent.click(openButton())
    expect(panel().dataset.state).toBe("open")
    expect(panel().classList.contains("max-sm:hidden")).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Ver resultados" }))
    expect(panel().dataset.state).toBe("closed")
    expect(panel().classList.contains("max-sm:hidden")).toBe(false)
    expect(document.body.style.overflow).toBe("")

    await act(() => vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS))
    expect(panel().classList.contains("max-sm:hidden")).toBe(true)
  })

  it("si se vuelve a abrir mientras se desvanece, queda abierto", async () => {
    vi.useFakeTimers()
    renderWithProviders(<MobileFilterSheet />)
    fireEvent.click(openButton())
    fireEvent.click(screen.getByRole("button", { name: "Cerrar filtros" }))
    fireEvent.click(openButton())

    await act(() => vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS))
    expect(panel().dataset.state).toBe("open")
    expect(panel().classList.contains("max-sm:hidden")).toBe(false)
  })

  it("cuenta los filtros elegidos en el botón del celular", () => {
    render(
      <MobileFilterSheet>
        <select defaultValue="docente" aria-label="Rol">
          <option value="all">Todos</option>
          <option value="docente">Docente</option>
        </select>
      </MobileFilterSheet>,
    )

    fireEvent.click(openButton())

    expect(openButton().textContent).toContain("1")
  })
})
