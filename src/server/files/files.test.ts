// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/files-golden.json"
import { fitSheetsToPageWidth, fitSheetXml, highestDataColumn } from "./fitPageWidth"
import { detectMimeType } from "./mimeType"
import { spreadsheetProblem } from "./spreadsheetCells"
import { clientBasename, clientExtension, phpIniBytes, postTooLarge } from "./uploads"

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", "files", name))
const cases = Object.entries(golden as Record<string, { mime: string; cells: string | null }>)

describe("detectMimeType (PHP finfo, libmagic 5.46)", () => {
  it.each(cases)("%s answers the same MIME type as PHP", (name, expected) => {
    expect(detectMimeType(fixture(name))).toBe(expected.mime)
  })
})

describe("spreadsheetProblem (SupportDocumentSpreadsheetCells)", () => {
  it.each(cases)("%s answers the same problem as Laravel", (name, expected) => {
    expect(spreadsheetProblem(fixture(name), clientExtension(name))).toBe(expected.cells)
  })
})

describe("uploads", () => {
  it("reads PHP size shorthands like post_max_size", () => {
    expect([phpIniBytes("32M"), phpIniBytes("8m"), phpIniBytes("1G"), phpIniBytes("512K"), phpIniBytes("1000")]).toEqual([33554432, 8388608, 1073741824, 524288, 1000])
  })

  it("answers 413 in Spanish above the limit and nothing at the limit", async () => {
    const request = (length: string) => new Request("http://localhost/x", { method: "POST", headers: { "content-length": length } })
    const response = postTooLarge(request("33554433"), 33554432) as Response
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('{"message":"El archivo es demasiado grande."}')
    expect(postTooLarge(request("33554432"), 33554432)).toBeNull()
  })

  it("keeps the client name without its directories, as Symfony does", () => {
    expect(clientBasename("C:\\Users\\docs\\Plan.PDF")).toBe("Plan.PDF")
    expect(clientExtension("Plan.final.PDF")).toBe("PDF")
    expect(clientExtension(".pdf")).toBe("pdf")
    expect(clientExtension("sin-extension")).toBe("")
  })
})

describe("fitSheetsToPageWidth (SheetsFitPageWidth)", () => {
  it("fits every sheet to one page wide and turns sheets wider than 8 columns to landscape", async () => {
    const fitted = await JSZip.loadAsync(await fitSheetsToPageWidth(fixture("workbook.xlsx")))
    const sheets = Object.keys(fitted.files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).sort()
    expect(sheets).toHaveLength(2)
    const [first, second] = await Promise.all(sheets.map((name) => (fitted.file(name) as JSZip.JSZipObject).async("string")))
    for (const xml of [first, second]) {
      expect(xml).toMatch(/<sheetPr[^>]*>[\s\S]*<pageSetUpPr fitToPage="1"\/>[\s\S]*<\/sheetPr>/)
      expect(xml).toMatch(/<pageSetup[^>]*fitToWidth="1"/)
      expect(xml).toMatch(/<pageSetup[^>]*fitToHeight="0"/)
    }
    expect(first).not.toMatch(/orientation="landscape"/)
    expect(second).toMatch(/<pageSetup[^>]*orientation="landscape"/)
  })

  it("adds the page setup in schema order when the sheet has none", () => {
    const xml = fitSheetXml('<worksheet xmlns="x"><sheetData><row r="1"><c r="I1"><v>1</v></c></row></sheetData><pageMargins left="1"/><headerFooter/></worksheet>')
    expect(xml).toBe(
      '<worksheet xmlns="x"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetData><row r="1"><c r="I1"><v>1</v></c></row></sheetData><pageMargins left="1"/><pageSetup fitToWidth="1" fitToHeight="0" orientation="landscape"/><headerFooter/></worksheet>',
    )
    expect(highestDataColumn("<sheetData><row><c/><c/><c/></row></sheetData>")).toBe(3)
  })
})
