import { CFB_STREAM, readCfb } from "./cfb"
import { zipEntries, zipRead } from "./zip"

export const MAX_CELLS = 5000
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024

export const TOO_MANY = "La hoja de cálculo tiene más de 5.000 celdas con datos. Divídala en archivos más pequeños o súbala como PDF."
export const TOO_LARGE = "La hoja de cálculo es demasiado grande para procesarla. Súbala como PDF."
export const UNREADABLE = "No se pudo leer la hoja de cálculo. Revise que el archivo no esté dañado."

class TooLarge extends Error {}

const CELL_TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[A-Za-z_][\w.-]*:)?(v|is)(?=[\s/>])[^>]*?(\/?)>/g

function xlsxCells(bytes: Buffer): number {
  const entries = zipEntries(bytes)
  const total = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (total > MAX_UNCOMPRESSED_BYTES) throw new TooLarge()
  const sheets = entries.filter((entry) => /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name))
  if (sheets.length === 0) throw new Error("El libro no tiene hojas.")
  let cells = 0
  for (const sheet of sheets) {
    const xml = zipRead(bytes, sheet).toString("utf8")
    for (const match of xml.matchAll(CELL_TAG)) {
      if (match[1] === undefined || match[2] === "/") continue
      if (++cells > MAX_CELLS) return cells
    }
  }
  return cells
}

export function columnString(index: number): string {
  let text = ""
  let value = index
  while (value > 0) {
    const remainder = (value - 1) % 26
    text = String.fromCharCode(65 + remainder) + text
    value = Math.floor((value - 1) / 26)
  }
  return text
}

const BOF = 0x0809
const EOF = 0x000a
const BOUNDSHEET = 0x0085
const SINGLE_CELLS = new Set([0x00fd, 0x027e, 0x0203, 0x0006, 0x0205, 0x0204])
const MULRK = 0x00bd

type Sheet = { name: string; offset: number; type: number }

function workbookStream(bytes: Buffer): Buffer {
  const cfb = readCfb(bytes)
  let found = null
  for (const entry of cfb.entries) {
    const upper = entry.name.toUpperCase()
    if (upper === "WORKBOOK" || upper === "BOOK") found = entry
  }
  if (found === null || found.type !== CFB_STREAM) throw new Error("Sin libro.")
  return cfb.read(found)
}

function biffVersion(data: Buffer): number {
  if (data.length < 8 || data.readUInt16LE(0) !== BOF) throw new Error("Sin BOF.")
  return data.readUInt16LE(4)
}

function sheetName(record: Buffer, biff8: boolean): string {
  const length = record[6]
  if (!biff8) return record.subarray(7, 7 + length).toString("latin1")
  const flags = record[7]
  return flags & 0x01 ? record.subarray(8, 8 + length * 2).toString("utf16le") : record.subarray(8, 8 + length).toString("latin1")
}

function sheetsOf(data: Buffer, biff8: boolean): Sheet[] {
  const sheets: Sheet[] = []
  let position = 0
  while (position <= data.length - 4) {
    const code = data.readUInt16LE(position)
    const length = data.readUInt16LE(position + 2)
    const record = data.subarray(position + 4, position + 4 + length)
    position += 4 + length
    if (code === BOUNDSHEET) sheets.push({ offset: record.readUInt32LE(0), type: record[5], name: sheetName(record, biff8) })
    if (code === EOF) break
  }
  return sheets
}

function xlsCells(bytes: Buffer): number {
  const data = workbookStream(bytes)
  const biff8 = biffVersion(data) === 0x0600
  const seen = new Set<string>()
  const see = (sheet: string, column: number, row: number) => {
    seen.add(`${sheet}!${columnString(column + 1)}${row + 1}`)
    if (seen.size > MAX_CELLS) throw new TooLarge()
  }
  try {
    for (const sheet of sheetsOf(data, biff8)) {
      if (sheet.type !== 0) continue
      let position = sheet.offset
      while (position <= data.length - 4) {
        const code = data.readUInt16LE(position)
        const length = data.readUInt16LE(position + 2)
        const record = data.subarray(position + 4, position + 4 + length)
        position += 4 + length
        if (code === EOF) break
        if (SINGLE_CELLS.has(code)) see(sheet.name, record.readUInt16LE(2), record.readUInt16LE(0))
        else if (code === MULRK) {
          const row = record.readUInt16LE(0)
          const last = record.readUInt16LE(length - 2)
          for (let column = record.readUInt16LE(2); column <= last; column++) see(sheet.name, column, row)
        }
      }
    }
  } catch (error) {
    if (error instanceof TooLarge) return MAX_CELLS + 1
    throw error
  }
  return seen.size
}

export function spreadsheetProblem(bytes: Buffer, extension: string): string | null {
  let cells: number
  try {
    const lower = extension.toLowerCase()
    cells = lower === "xlsx" ? xlsxCells(bytes) : lower === "xls" ? xlsCells(bytes) : 0
  } catch (error) {
    return error instanceof TooLarge ? TOO_LARGE : UNREADABLE
  }
  return cells > MAX_CELLS ? TOO_MANY : null
}
