import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"

const variants = [
  "table",
  "table-body",
  "table-detail",
  "detail",
  "form",
  "document",
  "dashboard",
  "academic",
  "catalog",
  "cards",
  "syllabus-cards",
  "accordion",
  "academic-structure",
  "notifications",
  "workspace",
  "syllabus",
  "review",
  "documents",
  "source",
  "template",
  "comparison",
  "settings",
] as const

const all = (root: ParentNode, selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector))
const one = (root: ParentNode, selector: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`No existe ${selector}`)
  return element
}

describe("LoadingSkeleton", () => {
  it.each(variants)("renderiza una superficie accesible para %s", (variant) => {
    const { container } = render(<LoadingSkeleton variant={variant} rows={2} columns={3} mode="schedule" />)

    const status = one(container, '[aria-busy="true"]')

    expect(container.querySelector('[role="status"], [aria-live]')).toBeNull()
    expect(status.textContent).toContain("Cargando contenido")
    expect(all(container, '[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(all(container, "button")).toHaveLength(0)
    expect(all(container, "input")).toHaveLength(0)
  })

  it("respeta el modo de curriculum sin introducir controles enfocables", () => {
    const { container } = render(<LoadingSkeleton variant="academic-structure" mode="curriculum" />)

    expect(one(container, '[data-skeleton="curriculum-canvas"]').classList.contains("h-(--curriculum-canvas-height)")).toBe(true)
    expect(container.querySelector(".bg-muted.inline-flex")).toBeNull()
    expect(all(container, '[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(all(container, "button")).toHaveLength(0)
  })

  it("no duplica la búsqueda ni los filtros que ya están visibles fuera de la tabla", () => {
    const { container, rerender } = render(<LoadingSkeleton variant="table-body" />)

    expect(container.querySelector('[data-skeleton="table-toolbar"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="table-pagination"]')).not.toBeNull()

    rerender(<LoadingSkeleton variant="table-body" search filters={1} />)

    expect(container.querySelector('[data-skeleton="table-toolbar"]')).not.toBeNull()
    expect(all(container, '[aria-busy="true"]')).toHaveLength(1)
    expect(container.querySelector("button, input, select, [tabindex]")).toBeNull()
  })

  it("anticipa el Panel de Administración: tres indicadores y seis pasos de puesta en marcha", () => {
    const { container } = render(<LoadingSkeleton variant="dashboard" />)

    expect(all(one(container, '[data-skeleton="metrics"]'), '[data-slot="card"]')).toHaveLength(3)
    expect(all(one(container, '[data-skeleton="setup"]'), ".rounded-md.p-2")).toHaveLength(6)
  })

  it("anticipa la puesta en marcha de la carrera con sus cinco pasos y sin indicadores", () => {
    const { container } = render(<LoadingSkeleton variant="setup" />)

    expect(container.querySelector('[data-skeleton="metrics"]')).toBeNull()
    expect(all(one(container, '[data-skeleton="setup"]'), ".rounded-md.p-2")).toHaveLength(5)
  })

  it("dibuja la barra de herramientas sin tarjeta y sin acciones cuando la tabla no las tiene", () => {
    const { container } = render(<LoadingSkeleton variant="table" columns={4} filters={2} actions={false} rows={2} />)

    expect(one(container, '[data-skeleton="table-toolbar"]').getAttribute("data-slot")).toBeNull()
    expect(all(container, '[data-skeleton="table-filters"] [data-slot="skeleton"]')).toHaveLength(2)
    expect(one(container, '[data-skeleton="table-row"]').children).toHaveLength(4)
  })

  it("anticipa los indicadores y el chip de período sobre la tabla solo cuando la pantalla los tiene", () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={2} metrics chip />)

    expect(all(one(container, '[data-skeleton="metrics"]'), '[data-slot="card"]')).toHaveLength(3)
    expect(container.querySelector('[data-skeleton="table-chip"]')).not.toBeNull()
    expect(all(container, '[data-skeleton="table-row"]')).toHaveLength(2)

    const plain = render(<LoadingSkeleton variant="table" />).container

    expect(plain.querySelector('[data-skeleton="metrics"]')).toBeNull()
    expect(plain.querySelector('[data-skeleton="table-chip"]')).toBeNull()
  })

  it("dibuja la barra de pestañas, el título de grupo y la paginación solo cuando se piden", () => {
    const { container, rerender } = render(<LoadingSkeleton variant="table" tabs={2} heading pagination={false} />)

    expect(one(container, '[data-skeleton="table-tabs"]').children).toHaveLength(2)
    expect(container.querySelector('[data-skeleton="table-heading"]')).not.toBeNull()
    expect(container.querySelector('[data-skeleton="table-pagination"]')).toBeNull()

    rerender(<LoadingSkeleton variant="table" tabs={0} heading={false} pagination />)

    expect(container.querySelector('[data-skeleton="table-tabs"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="table-heading"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="table-pagination"]')).not.toBeNull()
  })

  it("respeta los anchos de columna indicados", () => {
    const widths = ["minmax(0, 1fr)", "minmax(0, 2fr)", "5rem"]
    const { container } = render(<LoadingSkeleton variant="catalog" columns={3} actions={false} widths={widths} />)

    expect(one(container, '[data-skeleton="table-row"]').style.gridTemplateColumns).toContain("5rem")
  })

  it("muestra las tarjetas de sílabo sin indicadores", () => {
    const { container } = render(<LoadingSkeleton variant="syllabus-cards" rows={2} />)

    expect(all(container, '[data-skeleton="syllabus-card"]')).toHaveLength(2)
    expect(container.querySelector('[data-skeleton="metrics"]')).toBeNull()
  })

  it("anticipa la barra lateral de secciones del formulario cuando se pide", () => {
    expect(render(<LoadingSkeleton variant="form" rows={2} />).container.querySelector('[data-skeleton="form-sections"]')).toBeNull()
    const { container } = render(<LoadingSkeleton variant="form" rows={2} sidebar />)
    // The select goes above the sections, and each field is an editor inside the card.
    expect(container.querySelector('[data-skeleton="form-sections"]')!.firstElementChild!.getAttribute("data-skeleton")).toBe("form-subject-select")
    expect(container.querySelectorAll('[data-skeleton="form-card"] [data-skeleton="form-editor"]')).toHaveLength(2)
  })

  it("dibuja las columnas de estado como un badge centrado", () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={2} columns={4} actions={false} badges={[4]} />)
    const badges = all(container, '[data-skeleton="table-badge"]')

    expect(badges).toHaveLength(2)
    expect([...badges[0]!.classList]).toEqual(expect.arrayContaining(["mx-auto", "rounded-full"]))
    expect(render(<LoadingSkeleton variant="table" rows={2} columns={4} actions={false} />).container.querySelector('[data-skeleton="table-badge"]')).toBeNull()
  })

  it("separa los datos de la tarjeta móvil igual que la tabla real", () => {
    const card = one(render(<LoadingSkeleton variant="table" rows={1} columns={4} actions={false} />).container, '[data-skeleton="table-card"]')

    expect([...card.classList]).toEqual(expect.arrayContaining(["grid", "grid-cols-2", "gap-y-3", "p-4"]))
  })

  it("muestra los ajustes del sistema como un acordeón con la primera sección abierta", () => {
    const { container } = render(<LoadingSkeleton variant="settings" settingsSection="system" />)

    expect(all(container, '[data-skeleton="settings-accordion-item"]')).toHaveLength(3)
    expect(all(container, '[data-skeleton="settings-accordion-content"]')).toHaveLength(1)
    expect(container.querySelector('[data-skeleton="settings-field"]')).toBeNull()
  })

  it("la lista por ciclos anticipa la casilla de cada ciclo, sin buscador ni casilla para todas", () => {
    const selectable = render(<LoadingSkeleton variant="accordion" rows={3} selectable />).container
    expect(selectable.querySelector('[data-skeleton="table-toolbar"], [data-skeleton="accordion-select-all"]')).toBeNull()
    expect(all(selectable, '[data-skeleton="accordion-row"] [data-skeleton="accordion-checkbox"]')).toHaveLength(3)

    const plain = render(<LoadingSkeleton variant="accordion" rows={3} />).container
    expect(plain.querySelector('[data-skeleton="accordion-checkbox"]')).toBeNull()
  })

  it("las tarjetas de sílabo llevan la paginación de la pantalla", () => {
    expect(render(<LoadingSkeleton variant="syllabus-cards" rows={2} />).container.querySelector('[data-skeleton="table-pagination"]')).not.toBeNull()
  })

  it("usa el ancho de filtro que se le indica", () => {
    const { container } = render(<LoadingSkeleton variant="table" filters={1} filterWidth="lg:w-44" />)

    expect(one(container, '[data-skeleton="table-filters"] > div').classList.contains("lg:w-44")).toBe(true)
    expect(one(render(<LoadingSkeleton variant="table" filters={1} />).container, '[data-skeleton="table-filters"] > div').classList.contains("lg:w-48")).toBe(true)
  })

  it("los avisos por correo cargan con una fila por aviso del rol", () => {
    const { container } = render(<LoadingSkeleton variant="settings" settingsSection="email" rows={2} />)

    expect(all(container, '[data-skeleton="settings-email-option"]')).toHaveLength(2)
  })

})
