import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TablePagination } from "@/components/domain/TablePagination"
import { renderWithProviders } from "@/test/render"

const meta = (current_page: number, last_page: number) => ({
  current_page,
  last_page,
  per_page: 10,
  from: (current_page - 1) * 10 + 1,
  to: Math.min(current_page * 10, last_page * 10),
  total: last_page * 10,
})
const pages = (): string[] => screen.queryAllByRole("button", { name: /^Ir a la página/ }).map((button) => button.textContent ?? "")

describe("TablePagination", () => {
  it("muestra el rango y las páginas vecinas con los extremos, como la SPA", () => {
    renderWithProviders(<TablePagination meta={meta(5, 10)} onPageChange={vi.fn()} />)

    expect(screen.getByText("41–50 de 100")).toBeInTheDocument()
    expect(pages()).toEqual(["1", "4", "5", "6", "10"])
    expect(screen.getByRole("button", { name: "Ir a la página 5" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("navigation", { name: "Paginación de la tabla" })).toBeInTheDocument()
  })

  it("cambia de página y no ofrece ir antes de la primera", async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<TablePagination meta={meta(1, 3)} label="Paginación de notificaciones" onPageChange={onPageChange} />)

    expect(pages()).toEqual(["1", "2", "3"])
    expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole("button", { name: "Página siguiente" }))
    await user.click(screen.getByRole("button", { name: "Ir a la página 1" }))
    await user.click(screen.getByRole("button", { name: "Ir a la página 3" }))

    expect(onPageChange.mock.calls).toEqual([[2], [3]])
  })

  it("con la tabla vacía sigue a la vista", () => {
    renderWithProviders(<TablePagination meta={{ current_page: 1, last_page: 1, per_page: 10, from: null, to: null, total: 0 }} onPageChange={vi.fn()} />)

    expect(screen.getByText("0–0 de 0")).toBeInTheDocument()
    expect((screen.getByRole("button", { name: "Página siguiente" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
