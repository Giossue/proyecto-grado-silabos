import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { TemplateField } from "@/api/template"
import { TemplateFieldContent } from "./TemplateFieldContent"

const field: TemplateField = {
  id: "f1", key: "carrera", label: "Carrera", quien_llena: "institucional",
  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Carrera de " }, { type: "variable", attrs: { id: "nombre_carrera" } }] }] },
}
const variables = [{ key: "nombre_carrera", label: "Nombre de la carrera", sample: "Software" }]
const body = (container: HTMLElement): string => container.querySelector("[data-field-body]")!.textContent ?? ""

describe("TemplateFieldContent", () => {
  it("en la vista deja vacíos los datos del sistema, sin valores de muestra", () => {
    const { container } = render(<TemplateFieldContent field={field} variables={variables} preview />)

    expect(body(container).trim()).toBe("Carrera de")
    expect(container.textContent).not.toContain("Software")
  })

  it("al editar nombra cada dato del sistema", () => {
    const { container } = render(<TemplateFieldContent field={field} variables={variables} />)

    expect(body(container)).toContain("Carrera de Nombre de la carrera")
  })
})
