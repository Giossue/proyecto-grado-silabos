// @vitest-environment node
import { describe, expect, it } from "vitest"
import { phpFloatString, readImportRows } from "./spreadsheetReader"
import { editPart, xlsx } from "./testing"

const CAREERS = { facultad: "Facultad", modalidad: "Modalidad", codigo: "Código de carrera", nombre: "Nombre de la carrera", ciclos: "Número de ciclos" }
const HEADER = Object.values(CAREERS)

function read(bytes: Buffer, optional: string[] = []): unknown {
  try {
    return readImportRows(bytes, CAREERS, optional)
  } catch (error) {
    return (error as Error).message
  }
}

describe("readImportRows (OpenSpout, as SpreadsheetReader reads it)", () => {
  it("maps the template columns by header and numbers the rows among the non-empty ones", async () => {
    const bytes = await xlsx([
      ["  NÚMERO DE CICLOS ", "facultad", "codigo de carrera", "Nombre de la carrera", "Modalidad", "Otra"],
      ["10", " Ciencias ", "NC-1", "Carrera Uno", "Presencial", "x"],
      [],
      [" ", "", "", "", "", ""],
      [7, "Fac", "NC-2", "Dos", "Virtual"],
    ])
    expect(read(bytes)).toEqual([
      { line: 2, values: { facultad: "Ciencias", modalidad: "Presencial", codigo: "NC-1", nombre: "Carrera Uno", ciclos: "10" } },
      { line: 4, values: { facultad: "Fac", modalidad: "Virtual", codigo: "NC-2", nombre: "Dos", ciclos: "7" } },
    ])
  })

  it("turns cells into the strings PHP gets from them", async () => {
    const bytes = await xlsx(
      [
        HEADER,
        [12, 3.5, 0.1 + 0.2, 1e20, true],
        [false, { formula: "1+1" }, new Date(Date.UTC(2026, 0, 2)), -7.25, 0.000012],
      ],
      (sheet) => {
        sheet.getCell("C3").numFmt = "yyyy-mm-dd"
      },
    )
    expect(read(bytes)).toEqual([
      { line: 2, values: { facultad: "12", modalidad: "3.5", codigo: "0.3", nombre: "1.0E+20", ciclos: "1" } },
      { line: 3, values: { facultad: "", modalidad: "=1+1", codigo: "", nombre: "-7.25", ciclos: "1.2E-5" } },
    ])
  })

  it("formats floats like a PHP string cast", () => {
    expect([123456789.123456789, 0.1, 1e15 + 0.5, -0.000025, 1e-5].map(phpFloatString)).toEqual(["123456789.12346", "0.1", "1.0E+15", "-2.5E-5", "1.0E-5"])
  })

  it("asks for the template when a required column is missing and leaves an optional one empty", async () => {
    const bytes = await xlsx([["Facultad", "Modalidad", "Código", "Nombre de la carrera", "Número de ciclos"], ["a", "b", "c", "d", "e"]])
    expect(read(bytes)).toBe("Falta la columna «Código de carrera». Use la plantilla .xlsx.")
    expect(read(bytes, ["codigo"])).toEqual([{ line: 2, values: { facultad: "a", modalidad: "b", codigo: "", nombre: "d", ciclos: "e" } }])
  })

  it("counts empty rows toward the scanned row limit", async () => {
    const bytes = await xlsx([HEADER, ...Array.from({ length: 650 }, () => [" ", "", "", "", ""])])
    expect(read(bytes)).toBe("El archivo tiene demasiadas filas, contando las vacías. Use hasta 500 filas y borre las filas sobrantes.")
  })

  it("rejects more than 500 rows", async () => {
    const bytes = await xlsx([HEADER, ...Array.from({ length: 501 }, (_, index) => ["F", "M", `C${index}`, "N", "1"])])
    expect(read(bytes)).toBe("El archivo supera 500 filas.")
  })

  it("rejects a sheet declaring thousands of columns before reading rows", async () => {
    const bytes = await editPart(await xlsx([HEADER, ["a", "b", "c", "d", "e"]]), "xl/worksheets/sheet1.xml", (xml) =>
      xml.replace(/<dimension\b[^>]*\/>/, "").replace(/(<worksheet\b[^>]*>)/, '$1<dimension ref="A1:XFD3"/>'),
    )
    expect(read(bytes)).toBe("El archivo tiene más de 64 columnas. Use la plantilla .xlsx.")
  })

  it("cannot read files that are not workbooks and needs at least one data row", async () => {
    expect(read(Buffer.from("esto no es un zip"))).toBe("No se pudo leer el archivo. Use la plantilla .xlsx.")
    expect(read(await xlsx([HEADER]))).toBe("El archivo no tiene filas para importar.")
  })

  it("refuses cells written out of order, as OpenSpout does", async () => {
    const swapped = (dimension: string) =>
      editPart(sample, "xl/worksheets/sheet1.xml", (xml) => {
        const cell = /<c r="E2"[^>]*?(?:\/>|>.*?<\/c>)/.exec(xml)?.[0] ?? ""
        return xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="${dimension}"/>`).replace(cell, "").replace('<c r="D2"', `${cell}<c r="D2"`)
      })
    const sample = await xlsx([HEADER, ["a", "b", "c", "d", "e"]])
    expect(read(await swapped("A1:E2"))).toEqual([{ line: 2, values: { facultad: "a", modalidad: "b", codigo: "c", nombre: "d", ciclos: "e" } }])
    expect(read(await swapped("A1:C2"))).toBe("No se pudo leer el archivo. Use la plantilla .xlsx.")
  })

  it("decodes escaped control characters in shared strings", async () => {
    const bytes = await editPart(await xlsx([HEADER, ["ctl_x0001_x_x005F_x0002_y", "b", "c", "d", "e"]]), "xl/sharedStrings.xml", (xml) => xml)
    expect(read(bytes)).toEqual([{ line: 2, values: { facultad: "ctl\u0001x_x0002_y", modalidad: "b", codigo: "c", nombre: "d", ciclos: "e" } }])
  })
})
