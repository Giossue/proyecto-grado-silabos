import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { DocumentPresentation, SyllabusDetail } from "@/api/syllabi"
import type { TemplateAppearance } from "@/api/template"
import { SyllabusDocumentPreview } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { flush } from "@/test/render"

const paragraph = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
const appearance = { margin_cm: 2.5, title_font_size: 16, section_font_size: 12, body_font_size: 10 } as unknown as TemplateAppearance
const presentation: DocumentPresentation = { appearance, title: "PROGRAMA DE ASIGNATURA (SÍLABO)", logos: { institution: "/ueb.png", faculty: "/facultad.png" } }
const sections = [
  { id: "s1", key: "descripcion", title: "2. Descripción", description: null, orientation: "portrait", fields: [
    { id: "f1", key: "descripcion", label: "Descripción", quien_llena: "docente", value: paragraph("Texto del docente"), required: true, teacher_editable: true },
    { id: "f2", key: "vacio", label: "Pendiente", quien_llena: "docente", value: null, required: true, teacher_editable: true },
  ] },
  { id: "s2", key: "unidades", title: "6. Planificación", description: null, orientation: "landscape", fields: [
    { id: "f3", key: "perfil", label: "", quien_llena: "coordinacion", value: null, document: paragraph("Dato de la carrera"), required: false, teacher_editable: false },
  ] },
] as unknown as SyllabusDetail["sections"]

describe("SyllabusDocumentPreview", () => {
  afterEach(() => { document.body.innerHTML = "" })

  it("muestra el documento en hojas con el título, las secciones y lo escrito, con el diseño de la plantilla", async () => {
    const { container, unmount } = render(<SyllabusDocumentPreview presentation={presentation} sections={sections} />)
    await flush()

    const sheets = [...container.querySelectorAll("[data-sheet]")]
    expect(sheets).toHaveLength(2)
    expect(sheets[1]).toHaveClass("template-sheet--landscape")
    expect(sheets[0]!.getAttribute("style")).toContain("--document-margin: 2.5cm")
    expect(sheets[0]!.getAttribute("style")).toContain("--document-body-size: 10pt")
    expect(container.textContent).toContain("PROGRAMA DE ASIGNATURA (SÍLABO)")
    expect(container.textContent).toContain("2. Descripción")
    expect(container.textContent).toContain("Texto del docente")
    expect(container.textContent).toContain("Sin completar")
    expect(container.textContent).toContain("Dato de la carrera")
    expect(container.querySelectorAll("img")).toHaveLength(2)

    unmount()
  })
})
