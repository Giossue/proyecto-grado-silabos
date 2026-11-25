import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"

const filter = { search: "", setSearch: vi.fn(), active: false, clear: vi.fn() }
const sort = { options: [{ value: "default", label: "Orden predeterminado" }], selected: "default", choose: vi.fn() }

describe("ClientFilterBar", () => {
  it("sin filtros ni orden no muestra el panel de filtros", () => {
    render(<ClientFilterBar inputId="probe-search" label="Buscar" placeholder="Buscar" filter={filter} />)

    expect(document.body.querySelector('[data-slot="filter-sheet"]')).toBeNull()
  })

  it("con orden y sin filtros muestra «Ordenar por» dentro del panel de filtros", () => {
    render(<ClientFilterBar inputId="probe-search" label="Buscar" placeholder="Buscar" filter={filter} sort={sort} />)
    const select = screen.getByRole("combobox", { name: "Ordenar por" })

    expect(select.id).toBe("probe-search-sort")
    expect(select.closest('[data-slot="filter-sheet"]')).not.toBeNull()
  })

  it("respeta el id del selector de orden cuando se indica", () => {
    render(<ClientFilterBar inputId="probe-search" sortInputId="probe-sort" label="Buscar" placeholder="Buscar" filter={filter} sort={sort} filters={<span>Filtro</span>} />)

    expect(screen.getByRole("combobox", { name: "Ordenar por" }).id).toBe("probe-sort")
  })
})
