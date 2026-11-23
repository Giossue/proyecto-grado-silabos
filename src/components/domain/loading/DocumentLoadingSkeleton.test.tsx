import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DocumentLoadingSkeleton } from "@/components/domain/loading/DocumentLoadingSkeleton"

const one = (root: ParentNode, selector: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`No existe ${selector}`)
  return element
}

describe("DocumentLoadingSkeleton", () => {
  it.each(["syllabus", "review", "template", "comparison", "documents"] as const)("mantiene las superficies de %s sin controles ni anuncios adicionales", (variant) => {
    const { container } = render(<DocumentLoadingSkeleton variant={variant} />)

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(container.querySelector('button, input, textarea, select, a, [tabindex], [role="status"]')).toBeNull()
  })

  it("imita el editor: pestañas, una tarjeta con campos y el botón Siguiente debajo, sin ícono ni cabecera propia", () => {
    const { container } = render(<DocumentLoadingSkeleton variant="syllabus" />)
    const card = one(container, '[data-skeleton="syllabus-section"]')

    expect(container.querySelector(".max-w-screen-2xl")).not.toBeNull()
    expect(one(container, '[data-skeleton="syllabus-tabs"]').querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1)
    expect(card.querySelectorAll('[data-skeleton="syllabus-field"]').length).toBeGreaterThan(0)
    expect(card.querySelector('[data-skeleton="syllabus-nav"]')).toBeNull()
    expect(one(container, '[data-skeleton="syllabus-nav"]').previousElementSibling).toBe(card)
    expect(container.querySelector('[data-skeleton="unit-assistant"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="academic-context"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="syllabus-presentation"]')).toBeNull()
  })

  it("en biblioteca muestra solo la tarjeta de bibliografía, como la pantalla", () => {
    const { container } = render(<DocumentLoadingSkeleton variant="review" reviewStage="library" />)

    expect(container.querySelector('[data-skeleton="library-bibliography"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-skeleton="review-section"]')).toHaveLength(2)
    expect(container.querySelector('[data-skeleton="review-heading"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="review-approval"]')).toBeNull()
  })

  it("muestra las acciones de coordinación en su expediente", () => {
    const { container } = render(<DocumentLoadingSkeleton variant="review" />)

    expect(container.querySelector('[data-skeleton="review-correction"]')).not.toBeNull()
    expect(container.querySelector('[data-skeleton="review-observations"]')).toBeNull()
    expect(container.querySelector('[data-skeleton="review-heading"]')).not.toBeNull()
  })

  it("representa las hojas vertical y horizontal del constructor vigente", () => {
    const { container } = render(<DocumentLoadingSkeleton variant="template" />)
    const pages = one(container, '[data-skeleton="template-pages"]')
    const paper = one(container, '[data-orientation="portrait"]')
    const landscape = one(container, '[data-orientation="landscape"]')

    expect(pages.classList.contains("flex-col")).toBe(true)
    expect(paper.classList.contains("template-sheet")).toBe(true)
    expect(landscape.classList.contains("template-sheet--landscape")).toBe(true)
    expect(container.querySelectorAll('[data-skeleton="template-page"]')).toHaveLength(2)
    expect(container.querySelector(".sticky")).toBeNull()
    expect(container.querySelector('[data-skeleton="template-toolbar"]')).toBeNull()
  })

  it("compara las revisiones en un resumen y cambios con dos lados", () => {
    const { container } = render(<DocumentLoadingSkeleton variant="comparison" rows={2} />)

    expect(container.querySelectorAll('[data-skeleton="comparison-summary"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-skeleton="comparison-change"]')).toHaveLength(2)
  })

  it("el PDF del sílabo carga como la única línea de estado de la pantalla", () => {
    const { container } = render(<DocumentLoadingSkeleton variant="documents" rows={2} />)

    expect(container.querySelector('[data-skeleton="document-status"]')).not.toBeNull()
    expect(container.querySelector('[data-skeleton="table-row"]')).toBeNull()
  })
})
