import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FreeTextContent } from "@/components/domain/syllabus/FreeTextContent"

const cell = (text: string, attrs: Record<string, unknown> = {}) => ({
  type: "tableCell",
  attrs: { colspan: 1, rowspan: 1, ...attrs },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})

describe("tablas del documento", () => {
  it("reparte las columnas según los anchos guardados en la primera fila", () => {
    const document = {
      type: "doc",
      content: [{ type: "table", content: [
        { type: "tableRow", content: [cell("Encabezado", { colspan: 3, colwidth: [20, 30, 50] })] },
        { type: "tableRow", content: [cell("A"), cell("B"), cell("C")] },
      ] }],
    }
    const { container } = render(<FreeTextContent value={document} />)
    const columns = [...container.querySelectorAll("col")]

    expect(columns.map((column) => column.getAttribute("style"))).toEqual(["width: 20%;", "width: 30%;", "width: 50%;"])
    expect(container.querySelector("table")!.getAttribute("style")).toContain("table-layout: fixed")
  })

  it("deja las tablas sin anchos como estaban", () => {
    const document = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell("A"), cell("B")] }] }] }
    const { container } = render(<FreeTextContent value={document} />)

    expect(container.querySelector("colgroup")).toBeNull()
  })
})
