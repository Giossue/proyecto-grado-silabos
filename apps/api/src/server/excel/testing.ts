import ExcelJS from "exceljs"
import JSZip from "jszip"

export type SheetValue = string | number | boolean | null | { formula: string } | Date

export async function xlsx(rows: SheetValue[][], configure?: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("Datos")
  rows.forEach((row, index) => {
    row.forEach((value, column) => {
      if (value === null || value === "") return
      sheet.getCell(index + 1, column + 1).value = value as ExcelJS.CellValue
    })
  })
  configure?.(sheet)
  return Buffer.from(await book.xlsx.writeBuffer())
}

export async function editPart(bytes: Buffer, name: string, edit: (xml: string) => string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(name)
  if (file === null) throw new Error(`missing ${name}`)
  zip.file(name, edit(await file.async("string")))
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}

export async function parts(bytes: Buffer): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(bytes)
  const result = new Map<string, string>()
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue
    result.set(
      name,
      (await zip.files[name].async("string"))
        .replace(/password="[0-9A-F]+"/g, 'password="X"')
        .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00/g, "DATE"),
    )
  }
  return result
}

export async function readBook(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes as unknown as ArrayBuffer)
  return book
}
