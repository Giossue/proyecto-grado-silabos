import { constants, inflateRawSync } from "node:zlib"
import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom"
import { zipEntries, zipRead, type ZipEntry } from "../files/zip"
import { ascii } from "../signatures/holderMatcher"

export const MAX_ROWS = 500
export const MAX_SCANNED_ROWS = MAX_ROWS + 100
export const MAX_COLUMNS = 64
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
const HEAD_BYTES = 16384

export const UNREADABLE = "No se pudo leer el archivo. Use la plantilla .xlsx."
export const TOO_MANY_SCANNED = `El archivo tiene demasiadas filas, contando las vacías. Use hasta ${MAX_ROWS} filas y borre las filas sobrantes.`
export const TOO_MANY_ROWS = `El archivo supera ${MAX_ROWS} filas.`
export const TOO_MANY_COLUMNS = `El archivo tiene más de ${MAX_COLUMNS} columnas. Use la plantilla .xlsx.`
export const TOO_LARGE = "El archivo es demasiado grande para procesarlo. Use la plantilla .xlsx."
export const NO_ROWS = "El archivo no tiene filas para importar."

export class SpreadsheetRejected extends Error {}

class Unreadable extends Error {}

export type ImportColumns = Record<string, string>
export type ImportRow = { line: number; values: Record<string, string> }

type Cell = { empty: boolean; text: string }

const EMPTY: Cell = { empty: true, text: "" }
const OPAQUE: Cell = { empty: false, text: "" }
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
const BUILTIN_DATE_FORMATS: Record<number, string> = {
  14: "m/d/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yyyy h:mm",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
}
const ESCAPED_CONTROL = /(?<!_x005F)_x(000[0-8BCEF]|001[0-9A-F]|FFF[EF])_/g

export function phpTrim(value: string): string {
  return value.replace(PHP_TRIM, "")
}

function unescape(value: string): string {
  return value.replace(ESCAPED_CONTROL, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/_x005F(_x[\dA-F]{4}_)/g, "$1")
}

function parse(xml: Buffer): Document {
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Unreadable(message)
    },
  }).parseFromString(xml.toString("utf8"), "text/xml")
  if (!document.documentElement) throw new Unreadable("empty")
  return document
}

function elements(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName(name)) as unknown as Element[]
}

function byLocalName(root: Document | Element, name: string): Element[] {
  const found: Element[] = []
  const visit = (node: Node) => {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child.nodeType !== 1) continue
      if ((child as Element).localName === name) found.push(child as Element)
      visit(child)
    }
  }
  visit(root)
  return found
}

function attribute(element: Element, name: string): string | null {
  return element.hasAttribute(name) ? element.getAttribute(name) : null
}

function columnFromReference(reference: string): number {
  if (!/^[A-Z]{1,3}\d+$/.test(reference)) throw new Unreadable("Cannot get column index from an invalid cell index.")
  const letters = reference.replace(/\d/g, "")
  let index = 0
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64)
  return index - 1
}

function phpIntPrefix(value: string): number {
  const match = /^[ \t\n\r\v\f]*[+-]?\d+/.exec(value)
  return match ? Number(match[0]) : 0
}

const NUMERIC_STRING = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/
const FLOAT_PREFIX = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/

function phpFloatCast(value: string): number {
  const match = FLOAT_PREFIX.exec(value)
  return match ? Number(match[0].trim()) : 0
}

function phpIntCast(value: string): number {
  if (FLOAT_PREFIX.exec(value)?.[0].match(/[.eE]/)) return Math.trunc(phpFloatCast(value))
  return phpIntPrefix(value)
}

export function phpFloatString(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "NAN" : value > 0 ? "INF" : "-INF"
  if (value === 0) return Object.is(value, -0) ? "-0" : "0"
  const [mantissa, exponentText] = value.toExponential(13).split("e")
  const exponent = Number(exponentText)
  const negative = mantissa.startsWith("-")
  const digits = mantissa.replace("-", "").replace(".", "").replace(/0+$/, "") || "0"
  const sign = negative ? "-" : ""
  if (exponent < -4 || exponent >= 14) {
    const rest = digits.slice(1) || "0"
    return `${sign}${digits[0]}.${rest}E${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`
  }
  if (exponent < 0) return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`
  const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, "0")
  const fraction = digits.slice(exponent + 1)
  return `${sign}${whole}${fraction === "" ? "" : `.${fraction}`}`
}

function numericText(value: string): string {
  const numeric = NUMERIC_STRING.test(value)
  const inRange = numeric
    ? Number(value.trim()) < 9223372036854775807 && Number(value.trim()) > -9223372036854775808
    : value < "9223372036854775807" && value > "-9223372036854775808"
  const float = phpFloatCast(value)
  if (!inRange) return phpFloatString(float)
  const integer = phpIntCast(value)
  return integer === float ? String(integer) : phpFloatString(float)
}

type Styles = { formats: Map<number, string>; xfs: { numFmtId: number | null; applyNumberFormat: boolean | null }[] }

function readStyles(document: Document | null): Styles | null {
  if (document === null) return null
  const formats = new Map<number, string>()
  const xfs: Styles["xfs"] = []
  for (const group of byLocalName(document, "numFmts")) {
    if (group.getAttribute("count") === "0" && group.hasAttribute("count")) continue
    for (const format of byLocalName(group, "numFmt")) formats.set(phpIntPrefix(format.getAttribute("numFmtId") ?? ""), format.getAttribute("formatCode") ?? "")
  }
  for (const group of byLocalName(document, "cellXfs")) {
    for (const xf of byLocalName(group, "xf")) {
      const numFmtId = attribute(xf, "numFmtId")
      const apply = attribute(xf, "applyNumberFormat")
      xfs.push({ numFmtId: numFmtId === null ? null : phpIntPrefix(numFmtId), applyNumberFormat: apply === null ? null : apply !== "" && apply !== "0" })
    }
  }
  return { formats, xfs }
}

function formatCode(styles: Styles | null, styleId: number): string {
  if (styles === null) return ""
  const xf = styles.xfs[styleId]
  if (xf === undefined || xf.numFmtId === null) return ""
  return BUILTIN_DATE_FORMATS[xf.numFmtId] ?? styles.formats.get(xf.numFmtId) ?? ""
}

function customDateFormat(code: string | undefined): boolean {
  if (code === undefined || code.toLowerCase() === "general") return false
  const cleaned = code
    .replace(/(?<!\\)\[.+?(?<!\\)\]/g, "")
    .replace(/"[^"]+"/g, "")
    .replace(/(?<!\\)[eE][+-]?[0#?]+/g, "")
  return ["e", "yy", "m", "d", "h", "s"].some((character) => new RegExp(`(?<!\\\\)${character}`, "i").test(cleaned))
}

function formatsAsDate(styles: Styles | null, styleId: number): boolean {
  if (styles === null || styleId === 0) return false
  const xf = styles.xfs[styleId]
  if (xf === undefined || xf.applyNumberFormat === false || xf.numFmtId === null) return false
  return xf.numFmtId in BUILTIN_DATE_FORMATS || customDateFormat(styles.formats.get(xf.numFmtId))
}

function isDuration(code: string): boolean {
  return /^(\[hh?](:mm(:ss)?)?|\[mm?](:ss)?|\[ss?])$/.test(code)
}

type CellContext = { strings: string[]; styles: Styles | null }

function textValue(value: string): Cell {
  return value === "" ? EMPTY : { empty: false, text: value }
}

function rawValue(node: Element, type: string, value: string, context: CellContext): Cell {
  if (type === "inlineStr") return textValue(unescape(elements(node, "t").map((text) => text.textContent ?? "").join("")))
  if (type === "s") {
    const text = context.strings[phpIntCast(value)]
    if (text === undefined) throw new Unreadable("shared string not found")
    return textValue(unescape(text))
  }
  if (type === "str") return textValue(unescape(phpTrim(value)))
  if (type === "b") return { empty: false, text: value !== "" && value !== "0" ? "1" : "" }
  if (type === "n") {
    const styleId = phpIntPrefix(node.getAttribute("s") ?? "")
    if (isDuration(formatCode(context.styles, styleId)) || formatsAsDate(context.styles, styleId)) return OPAQUE
    return { empty: false, text: numericText(value) }
  }
  return OPAQUE
}

function cellValue(node: Element, context: CellContext): Cell {
  const type = node.getAttribute("t") || "n"
  const value = elements(node, "v")[0]?.textContent ?? ""
  const formula = elements(node, "f")[0]
  if (formula !== undefined) {
    rawValue(node, type, value, context)
    return { empty: false, text: `=${formula.textContent ?? ""}` }
  }
  if (value === "" && type !== "inlineStr") return EMPTY
  return rawValue(node, type, value, context)
}

function* sheetRows(document: Document, context: CellContext): Generator<{ index: number; cells: Cell[] }> {
  let columns = 0
  let read = 0
  let cells = new Map<number, Cell>()
  let lastColumn = -1
  let highest = -1
  const stack: { node: Node; leaving: boolean }[] = [{ node: document.documentElement as unknown as Node, leaving: false }]
  while (stack.length > 0) {
    const { node, leaving } = stack.pop() as { node: Node; leaving: boolean }
    const element = node as Element
    const name = element.localName
    if (leaving) {
      if (name === "row") {
        if ([...cells.values()].every((cell) => cell.empty)) continue
        read++
        if (columns === 0 && cells.size > 0) {
          const count = Math.max(...cells.keys()) + 1
          let filled = false
          for (let index = 0; index < count; index++) {
            if (!cells.has(index)) {
              cells.set(index, EMPTY)
              filled = true
            }
          }
          if (filled) cells = new Map([...cells.entries()].sort(([left], [right]) => left - right))
        }
        yield { index: read, cells: [...cells.values()] }
      }
      if (name === "worksheet") return
      continue
    }
    if (name === "dimension") {
      const match = /[A-Z]+\d+:([A-Z]+\d+)/.exec(element.getAttribute("ref") ?? "")
      if (match) columns = columnFromReference(match[1]) + 1
    } else if (name === "row") {
      lastColumn = -1
      let width = columns
      const spans = element.getAttribute("spans") ?? ""
      if (columns === 0 && spans !== "") {
        const parts = spans.split(":")
        if (parts.length < 2) throw new Unreadable("spans")
        width = phpIntPrefix(parts[1])
      }
      cells = new Map(Array.from({ length: Math.max(0, width) }, (_, index) => [index, EMPTY]))
      highest = Math.max(0, width) - 1
    } else if (name === "c") {
      const reference = attribute(element, "r")
      const column = reference === null ? lastColumn + 1 : columnFromReference(reference)
      const value = cellValue(element, context)
      if (!cells.has(column)) {
        if (column <= highest) throw new Unreadable("Cell indexes must be in ascending order.")
        highest = column
      }
      cells.set(column, value)
      lastColumn = column
    }
    stack.push({ node, leaving: true })
    const children: Node[] = []
    for (let child = node.firstChild; child !== null; child = child.nextSibling) if (child.nodeType === 1) children.push(child)
    for (let index = children.length - 1; index >= 0; index--) stack.push({ node: children[index], leaving: false })
  }
}

function entryHead(bytes: Buffer, entry: ZipEntry): string {
  const offset = entry.localOffset
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) return ""
  const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28)
  const data = bytes.subarray(start, start + Math.min(entry.compressedSize, HEAD_BYTES))
  try {
    if (entry.method === 0) return data.subarray(0, HEAD_BYTES).toString("latin1")
    if (entry.method !== 8) return ""
    return inflateRawSync(data, { finishFlush: constants.Z_SYNC_FLUSH }).subarray(0, HEAD_BYTES).toString("latin1")
  } catch {
    return ""
  }
}

function declaredColumns(head: string): number {
  const match = /<(?:\w+:)?dimension\b[^>]*\bref="(?:[A-Z]+\d+:)?([A-Z]+)\d+"/i.exec(head)
  if (!match) return 0
  const column = match[1].toUpperCase()
  if (column.length > 3) return Number.MAX_SAFE_INTEGER
  let index = 0
  for (const character of column) index = index * 26 + (character.charCodeAt(0) - 64)
  return index
}

function assertArchive(bytes: Buffer): ZipEntry[] {
  let entries: ZipEntry[]
  try {
    entries = zipEntries(bytes)
  } catch {
    throw new SpreadsheetRejected(UNREADABLE)
  }
  let total = 0
  for (const entry of entries) {
    total += entry.size
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name) && declaredColumns(entryHead(bytes, entry)) > MAX_COLUMNS) throw new SpreadsheetRejected(TOO_MANY_COLUMNS)
  }
  if (total > MAX_UNCOMPRESSED_BYTES) throw new SpreadsheetRejected(TOO_LARGE)
  return entries
}

function relationships(bytes: Buffer, entries: ZipEntry[]): Element[] {
  const file = entries.find((entry) => entry.name === "xl/_rels/workbook.xml.rels")
  return file === undefined ? [] : byLocalName(parse(zipRead(bytes, file)), "Relationship")
}

function partPath(target: string): string {
  const path = target.includes("xl/") ? target : `xl/${target}`
  return path.replace(/^\/+/, "")
}

function relatedPart(links: Element[], type: string): string | null {
  const link = links.find((candidate) => candidate.getAttribute("Type") === `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}`)
  return link ? partPath(link.getAttribute("Target") ?? "") : null
}

function readPart(bytes: Buffer, entries: ZipEntry[], path: string | null): Document | null {
  if (path === null) return null
  const entry = entries.find((candidate) => candidate.name === path)
  return entry === undefined ? null : parse(zipRead(bytes, entry))
}

function sharedStrings(document: Document | null): string[] {
  if (document === null) return []
  return byLocalName(document, "si").map((item) =>
    elements(item, "t")
      .filter((text) => ["si", "r"].includes((text.parentNode as Element | null)?.localName ?? ""))
      .map((text) => (text.getAttribute("xml:space") === "preserve" ? (text.textContent ?? "") : phpTrim(text.textContent ?? "")))
      .join(""),
  )
}

function firstSheet(bytes: Buffer, entries: ZipEntry[], links: Element[]): Document {
  const workbook = entries.find((entry) => entry.name === "xl/workbook.xml")
  const sheets = workbook === undefined ? [] : byLocalName(parse(zipRead(bytes, workbook)), "sheet")
  if (sheets.length === 0) throw new Unreadable("The file must contain at least one sheet.")
  const id = sheets[0].getAttribute("r:id")
  const target = links.find((link) => link.getAttribute("Id") === id)?.getAttribute("Target") ?? ""
  const path = (target.startsWith("/xl/") ? target : `/xl/${target}`).replace(/^\/+/, "")
  const entry = entries.find((candidate) => candidate.name === path)
  if (entry === undefined) throw new Unreadable("sheet")
  return parse(zipRead(bytes, entry))
}

export function normalizeHeader(value: string): string {
  return ascii(value).toLowerCase().replace(/^[\s﻿​‎]+|[\s﻿​‎]+$/gu, "")
}

function headerMap(cells: string[], columns: ImportColumns, optional: string[]): Map<string, number | null> {
  const normalized = cells.map(normalizeHeader)
  const map = new Map<string, number | null>()
  for (const [key, header] of Object.entries(columns)) {
    const position = normalized.indexOf(normalizeHeader(header))
    if (position < 0 && optional.includes(key)) {
      map.set(key, null)
      continue
    }
    if (position < 0) throw new SpreadsheetRejected(`Falta la columna «${header}». Use la plantilla .xlsx.`)
    map.set(key, position)
  }
  return map
}

export function readImportRows(bytes: Buffer, columns: ImportColumns, optional: string[] = []): ImportRow[] {
  const entries = assertArchive(bytes)
  const rows: ImportRow[] = []
  let map: Map<string, number | null> | null = null
  let scanned = 0
  try {
    const links = relationships(bytes, entries)
    const context: CellContext = {
      strings: sharedStrings(readPart(bytes, entries, relatedPart(links, "sharedStrings"))),
      styles: readStyles(readPart(bytes, entries, relatedPart(links, "styles"))),
    }
    for (const row of sheetRows(firstSheet(bytes, entries, links), context)) {
      if (++scanned > MAX_SCANNED_ROWS) throw new SpreadsheetRejected(TOO_MANY_SCANNED)
      const cells = row.cells.slice(0, MAX_COLUMNS).map((cell) => phpTrim(cell.text))
      if (map === null) {
        map = headerMap(cells, columns, optional)
        continue
      }
      const values: Record<string, string> = {}
      for (const [key, position] of map) values[key] = position === null ? "" : (cells[position] ?? "")
      if (Object.values(values).join("") === "") continue
      rows.push({ line: row.index, values })
      if (rows.length > MAX_ROWS) throw new SpreadsheetRejected(TOO_MANY_ROWS)
    }
  } catch (error) {
    if (error instanceof SpreadsheetRejected) throw error
    throw new SpreadsheetRejected(UNREADABLE)
  }
  if (map === null || rows.length === 0) throw new SpreadsheetRejected(NO_ROWS)
  return rows
}
