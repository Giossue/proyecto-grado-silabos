import ExcelJS from "exceljs"

export type CellValue = string | number | boolean | null

const NUMERIC = /^[+-]?(\d+\.?\d*|\d*\.?\d+)([Ee][-+]?[0-2]?\d{1,3})?$/

export function boundValue(value: CellValue): ExcelJS.CellValue {
  if (typeof value !== "string") return value
  if (value.length > 1 && value.startsWith("=")) return { formula: value.slice(1) }
  if (!NUMERIC.test(value)) return value
  const digits = value.replace(/^[+-]+/, "")
  if (digits.length > 1 && digits[0] === "0" && digits[1] !== ".") return value
  return Number(value)
}

export function columnLetter(index: number): string {
  let text = ""
  let value = index
  while (value > 0) {
    const remainder = (value - 1) % 26
    text = String.fromCharCode(65 + remainder) + text
    value = Math.floor((value - 1) / 26)
  }
  return text
}

function looselyNull(value: CellValue): boolean {
  return value === null || value === "" || value === 0 || value === false
}

export function fromArray(sheet: ExcelJS.Worksheet, values: CellValue[], row: number, column = 1, strict = false): void {
  values.forEach((value, index) => {
    if (strict ? value === null || value === "" : looselyNull(value)) return
    sheet.getCell(row, column + index).value = boundValue(value)
  })
}

export function styleTable(sheet: ExcelJS.Worksheet, columns: number, lastRow: number, widths: number[]): void {
  for (let column = 1; column <= columns; column++) {
    const cell = sheet.getCell(1, column)
    cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" }, bgColor: { argb: "FF1E3A5F" } }
  }
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2" }]
  sheet.autoFilter = `A1:${columnLetter(columns)}${lastRow}`
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
}

export function newBook(title: string): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook()
  book.title = title
  book.creator = "Sílabos UEB"
  book.lastModifiedBy = "Sílabos UEB"
  return book
}

export async function xlsxBytes(book: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await book.xlsx.writeBuffer())
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

export function excelSerial(localYmdHms: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(localYmdHms)
  if (!match) return 0
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const days = (Date.UTC(year, month - 1, day) - EXCEL_EPOCH) / 86_400_000
  return days + (hour * 3600 + minute * 60 + second) / 86_400
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function xlsxDownload(bytes: Buffer, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-cache, private",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
      "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
}
