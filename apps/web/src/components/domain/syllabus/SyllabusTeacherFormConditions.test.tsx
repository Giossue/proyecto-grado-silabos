import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { SyllabusDetail } from "@/api/syllabi"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { flush } from "@/test/render"

type Section = SyllabusDetail["sections"][number]
const yesNo = [{ const: "o1", title: "Sí" }, { const: "o2", title: "No" }]
const ifYes = { response: "usa_lab", options: ["o1"] }
const methods = (choice: string | null): DocumentNode => ({ type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "¿Usa laboratorio? " }, { type: "response", attrs: { kind: "una", options: yesNo, value: choice as never, id: "usa_lab" } }] },
  { type: "paragraph", content: [{ type: "text", text: "Cuál: " }, { type: "response", attrs: { kind: "texto", options: [], value: "", showIf: ifYes } }] },
] })
const empty: DocumentNode = { type: "doc", content: [{ type: "paragraph" }] }
const sections = (choice: string | null): Section[] => [{
  id: "s1", key: "metodologia", title: "Metodología", description: null, orientation: "portrait",
  fields: [
    { id: "f1", key: "metodologia", label: "Métodos", quien_llena: "carrera", teacher_editable: true, required: true, template: methods(null), value: methods(choice) },
    { id: "f2", key: "tecnicas", label: "Técnicas", quien_llena: "carrera", teacher_editable: true, required: true, template: empty, value: empty, show_if: ifYes },
  ],
}]

describe("El docente responde con «Mostrar solo si»", () => {
  it("lo condicionado aparece en vivo al elegir la opción y se vuelve a ocultar al cambiarla", async () => {
    const { container, rerender } = render(<SyllabusTeacherForm sections={sections(null)} />)
    await flush()
    const field = (key: string): Element | null => container.querySelector(`[data-field-key="${key}"]`)
    expect(field("metodologia")).not.toBeNull()
    expect(field("tecnicas")).toBeNull()
    expect(container.textContent).not.toContain("Técnicas")
    expect(field("metodologia")!.querySelectorAll("textarea")).toHaveLength(0)
    expect(field("metodologia")!.textContent).not.toContain("Cuál")

    rerender(<SyllabusTeacherForm sections={sections("o1")} />)
    await flush()
    expect(field("tecnicas")).not.toBeNull()
    expect(field("metodologia")!.querySelectorAll("textarea")).toHaveLength(1)
    expect(field("metodologia")!.textContent).toContain("Cuál")

    rerender(<SyllabusTeacherForm sections={sections("o2")} />)
    await flush()
    expect(field("tecnicas")).toBeNull()
    expect(field("metodologia")!.querySelectorAll("textarea")).toHaveLength(0)
    expect(field("metodologia")!.textContent).not.toContain("Cuál")
  })

  it("en una tabla se vacía la celda de la respuesta oculta, y una línea con otra respuesta visible se queda", async () => {
    const table = (choice: string | null): DocumentNode => ({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "¿Usa laboratorio? " }, { type: "response", attrs: { kind: "una", options: yesNo, value: choice as never, id: "usa_lab" } }] },
      { type: "paragraph", content: [{ type: "text", text: "Horario: " }, { type: "response", attrs: { kind: "texto", options: [], value: "" } }, { type: "text", text: " Sala: " }, { type: "response", attrs: { kind: "texto", options: [], value: "", showIf: ifYes } }] },
      { type: "table", content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Equipo" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Detalle" }] }] }] },
        { type: "tableRow", content: [
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Microscopio" }] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Marca:" }] }, { type: "paragraph", content: [{ type: "response", attrs: { kind: "texto", options: [], value: "", showIf: ifYes } }] }] },
        ] },
      ] },
    ] })
    const form = (choice: string | null): Section[] => [{
      id: "s1", key: "metodologia", title: "Metodología", description: null, orientation: "portrait",
      fields: [{ id: "f1", key: "metodologia", label: "Métodos", quien_llena: "carrera", teacher_editable: true, required: true, template: table(null), value: table(choice) }],
    }]
    const { container, rerender } = render(<SyllabusTeacherForm sections={form("o2")} />)
    await flush()

    const field = (): Element => container.querySelector('[data-field-key="metodologia"]')!
    expect(field().textContent).toContain("Horario")
    expect(field().textContent).toContain("Sala")
    expect(field().querySelectorAll("textarea")).toHaveLength(1)
    expect(field().querySelectorAll("tbody td")).toHaveLength(2)
    expect(field().textContent).toContain("Microscopio")
    expect(field().textContent).not.toContain("Marca")

    rerender(<SyllabusTeacherForm sections={form("o1")} />)
    await flush()
    expect(field().textContent).toContain("Sala")
    expect(field().textContent).toContain("Marca")
    expect(field().querySelectorAll("textarea")).toHaveLength(3)
  })
})
