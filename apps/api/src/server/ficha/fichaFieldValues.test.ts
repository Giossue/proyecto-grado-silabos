// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { PhpRecord } from "../configuration/phpValues"
import { plainText, TemplateValidationError, trustedDefinition, type TemplateDefinition } from "../configuration/templateRuntime"
import { fichaClean, fichaCoverage, fichaDocument, fichaSchema } from "./fichaFieldValues"

const cell = (type: string, text: string, attrs: PhpRecord = {}): PhpRecord => ({
  type,
  attrs,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})
const blankCell = (): PhpRecord => ({ type: "tableCell", content: [{ type: "paragraph" }] })

function definitionWith(policy: string | null): TemplateDefinition {
  return trustedDefinition({ document: {}, variables: {}, blocks: {}, ...(policy === null ? {} : { response_policy: policy }) })
}

const merged: PhpRecord = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        { type: "tableRow", content: [cell("tableHeader", "Resultado", { rowspan: 2 }), cell("tableHeader", "Nivel", { colspan: 2 })] },
        { type: "tableRow", content: [cell("tableHeader", "Alto"), cell("tableHeader", "Medio")] },
        { type: "tableRow", content: [blankCell(), blankCell(), blankCell()] },
      ],
    },
  ],
}

describe("fichaFieldValues (FichaFieldValues of Laravel)", () => {
  it("merged table headers define the columns and rows are saved as a table", () => {
    for (const definition of [definitionWith(null), definitionWith("protected")]) {
      const columns = fichaSchema({ key: "relacion", label: "Relación de resultados", content: merged }, "", definition).columns
      expect(columns).toEqual(["Resultado", "Nivel / Alto", "Nivel / Medio"])
      const clean = fichaClean({ columns: ["Inventada"], rows: [["Resuelve sistemas", "X", ""]] }, columns)
      const document = fichaDocument(clean, merged, definition)
      const text = plainText(document, definition)
      expect((document.content as PhpRecord[])[0].type).toBe("table")
      expect(text).toContain("Alto | Medio")
      expect(text).toContain("Resuelve sistemas")
      expect(text).not.toContain("Inventada")
      const rows = ((document.content as PhpRecord[])[0].content as PhpRecord[])
      expect(((rows[0].content as PhpRecord[])[1].attrs as PhpRecord).colspan).toBe(2)
      expect(rows).toHaveLength(3)
    }
  })

  it("rejects malformed tables and keeps missing cells empty", () => {
    expect(fichaClean({ rows: [["Resultado"]] }, ["Resultado", "Nivel"])).toBeNull()
    expect(fichaClean({ rows: [["Resultado", { Nivel: "Alto" }]] }, ["Resultado", "Nivel"])).toBeNull()
    expect(fichaClean("Relación sin estructura", ["Resultado", "Nivel"])).toBeNull()
    expect(fichaClean({ rows: [["Resultado", ""]] }, ["Resultado", "Nivel"])).toEqual({ columns: ["Resultado", "Nivel"], rows: [["Resultado", ""]] })
    expect(fichaClean({ rows: [] }, ["Resultado", "Nivel"])).toBeNull()
    expect(fichaClean(["Analizar", "Aplicar"], [])).toEqual(["Analizar", "Aplicar"])
  })

  it("trims and limits text, lists and table cells like Str::limit", () => {
    expect(fichaClean(`  ${"a".repeat(12_001)}  `, [])).toBe("a".repeat(12_000))
    expect(fichaClean(["  uno ", "", " ", "dos"], [])).toEqual(["uno", "dos"])
    expect(fichaClean(Array.from({ length: 61 }, (_, index) => `item ${index}`), [])).toHaveLength(60)
    expect(fichaClean({ rows: [["x".repeat(1501), ""]] }, ["A", "B"])).toEqual({ columns: ["A", "B"], rows: [["x".repeat(1500), ""]] })
    expect(fichaClean("   ", [])).toBeNull()
  })

  it("writes text into the first blank paragraph of a protected template, one hard break per line", () => {
    const template: PhpRecord = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fijo" }] }, { type: "paragraph" }] }
    const document = fichaDocument("Uno\r\nDos", template, definitionWith("protected"))
    expect(document).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Fijo" }] },
        { type: "paragraph", content: [{ type: "text", text: "Uno" }, { type: "hardBreak" }, { type: "text", text: "Dos" }] },
      ],
    })
    expect(fichaDocument(["a", "b"], template, definitionWith("protected")).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Fijo" }] },
      { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] },
    ])
  })

  it("asks for the career project when a protected template has no table nor text space", () => {
    const template: PhpRecord = { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "unidades", props: [], value: [] } }] }
    expect(() => fichaDocument("Texto", template, definitionWith("protected"))).toThrow(TemplateValidationError)
    try {
      fichaDocument("Texto", template, definitionWith("protected"))
    } catch (error) {
      expect((error as TemplateValidationError).errors).toEqual({
        file: ["Este campo debe completarse desde el proyecto de carrera porque su contenido no es una tabla o un espacio de texto."],
      })
    }
  })

  it("builds paragraphs and bullet lists when the template is blank or responses are not protected", () => {
    const blank: PhpRecord = { type: "doc", content: [{ type: "paragraph" }] }
    expect(fichaDocument("Uno\n\nDos", blank, definitionWith("protected"))).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Uno" }] }, { type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "Dos" }] }],
    })
    expect(fichaDocument(["a", "b"], blank, definitionWith(null))).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
          ],
        },
      ],
    })
  })

  it("keeps fixed rows and their labels in protected tables", () => {
    const fixed: PhpRecord = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("tableHeader", "Competencia"), cell("tableHeader", "Aporte")] },
            { type: "tableRow", content: [cell("tableCell", "Resuelve"), blankCell()] },
          ],
        },
      ],
    }
    const definition = definitionWith("protected")
    const filled = fichaDocument({ columns: ["Competencia", "Aporte"], rows: [["Resuelve", "Alta"]] }, fixed, definition)
    expect(plainText(filled, definition)).toBe("Competencia | Aporte\nResuelve | Alta")
    const expectError = (value: unknown, message: string) => {
      try {
        fichaDocument(value, fixed, definition)
        throw new Error("expected a rejection")
      } catch (error) {
        expect((error as TemplateValidationError).errors).toEqual({ file: [message] })
      }
    }
    expectError({ columns: ["Competencia", "Aporte"], rows: [["Otra", "Alta"]] }, "No cambie el texto fijo de la plantilla.")
    expectError({ columns: ["Competencia", "Aporte"], rows: [["Resuelve", "Alta"], ["Más", "Baja"]] }, "Conserve todas las filas de la tabla fija.")
  })

  it("counts the fields found in the workbook", () => {
    const fields = [
      { key: "descripcion", label: "Descripción", columns: [] },
      { key: "objetivos", label: "Objetivos", columns: [] },
    ]
    expect(fichaCoverage({ values: { descripcion: "x", ajeno: "y" } }, fields)).toEqual({
      coverage: { found: 1, total: 2 },
      missing: [{ key: "objetivos", label: "Objetivos", reason: "no_encontrado" }],
    })
  })
})

describe("S4: una tabla de una sola columna", () => {
  const cell = (type: string, text: string): PhpRecord => ({ type, content: [text === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text }] }] })
  const oneColumn = (...rows: string[]): PhpRecord => ({ type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", "Objetivo")] }, ...rows.map((text) => ({ type: "tableRow", content: [cell("tableCell", text)] }))] }] })

  it("importa todas las filas del Excel", () => {
    for (const policy of [null, "protected"] as const) {
      const document = fichaDocument({ columns: ["Objetivo"], rows: [["Primero"], ["Segundo"], [""], ["Tercero"]] }, oneColumn(""), definitionWith(policy))
      const table = (document.content as PhpRecord[])[0]
      expect((table.content as PhpRecord[]).map((row) => plainText(row, definitionWith(policy)))).toEqual(["Objetivo", "Primero", "Segundo", "Tercero"])
    }
  })

  it("conserva las filas de una tabla fija", () => {
    const fixed: PhpRecord = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", "Objetivo")] }, { type: "tableRow", content: [cell("tableCell", "")] }, { type: "tableRow", content: [cell("tableCell", "")] }] }] }
    const document = fichaDocument({ columns: ["Objetivo"], rows: [["Uno"], ["Dos"]] }, fixed, definitionWith("protected"))
    expect(plainText(document, definitionWith("protected"))).toContain("Dos")
    expect(plainText(document, definitionWith("protected"))).toContain("Uno")
  })
})
