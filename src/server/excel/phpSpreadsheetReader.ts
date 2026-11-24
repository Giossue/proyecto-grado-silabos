import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom"
import { zipEntries, zipRead, type ZipEntry } from "../files/zip"
import { phpFloatString } from "./spreadsheetReader"

export class WorkbookUnreadable extends Error {}

const RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships"
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const PURL_MAIN = "http://purl.oclc.org/ooxml/spreadsheetml/main"
const OFFICE_DOCUMENT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const PURL_OFFICE_DOCUMENT = "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"
const THUMBNAIL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"
const WORKSHEET = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
const PURL_WORKSHEET = "http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet"
const PROPERTY_RELATIONS = [
  "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties",
]
const PROTECTION_SETTERS = new Set(
  [
    "sheet", "objects", "scenarios", "formatCells", "formatColumns", "formatRows", "insertColumns", "insertRows", "insertHyperlinks", "deleteColumns",
    "deleteRows", "selectLockedCells", "sort", "autoFilter", "pivotTables", "selectUnlockedCells", "password", "hashValue", "algorithm", "algorithmName",
    "salt", "saltValue", "spinCount",
  ].map((name) => name.toLowerCase()),
)
const ERROR_CODES = ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#CALC!"]
const MAX_ROW = 1048576
const MAX_STRING_LENGTH = 32767
const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/
const COORDINATE = /^(\$?[A-Z]{1,3})(\$?\d{1,7})$/i

export type WorksheetInfo = { worksheetName: string; totalRows: number; totalColumns: number }

export type BookCell = { formula: boolean; value: string | null }

export class BookSheet {
  readonly cells = new Map<string, BookCell>()
  private highestRow = 1
  private highestColumn = 1

  constructor(readonly title: string) {}

  touch(reference: string): BookCell {
    const known = this.cells.get(reference)
    if (known !== undefined) return known
    const [column, row] = indexes(reference)
    const cell: BookCell = { formula: false, value: null }
    this.cells.set(reference, cell)
    this.highestRow = Math.max(this.highestRow, row)
    this.highestColumn = Math.max(this.highestColumn, column)
    return cell
  }

  set(reference: string, cell: BookCell): void {
    const target = this.touch(reference)
    target.formula = cell.formula
    target.value = cell.value
  }

  highestDataRow(): number {
    return this.highestRow
  }

  highestDataColumn(): number {
    return this.highestColumn
  }
}

export type Book = { sheets: BookSheet[] }

function fail(message: string): never {
  throw new WorkbookUnreadable(message)
}

export function columnIndex(letters: string): number {
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index
}

export function columnName(index: number): string {
  let text = ""
  let value = index
  while (value > 0) {
    const remainder = (value - 1) % 26
    text = String.fromCharCode(65 + remainder) + text
    value = Math.floor((value - 1) / 26)
  }
  return text
}

function coordinate(reference: string): [string, string] {
  const match = COORDINATE.exec(reference)
  if (match && Number(match[2].replace("$", "")) <= MAX_ROW) return [match[1], match[2]]
  if (reference.includes(":") || reference.includes(",")) fail("Cell coordinate string can not be a range of cells")
  if (reference === "") fail("Cell coordinate can not be zero-length string")
  return fail(`Invalid cell coordinate ${reference}`)
}

function indexes(reference: string): [number, number] {
  const [column, row] = coordinate(reference)
  return [columnIndex(column.replace("$", "")), Number(row.replace("$", ""))]
}

function normalizedReference(reference: string): string {
  const [column, row] = coordinate(reference)
  return `${column.replace("$", "").toUpperCase()}${Number(row.replace("$", ""))}`
}

function phpIntCast(value: string): number {
  const match = /^[ \t\n\r\v\f]*([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?)/.exec(value)
  return match ? Math.trunc(Number(match[1])) : 0
}

function dirname(path: string): string {
  if (!path.includes("/")) return "."
  const trimmed = path.replace(/\/+$/, "")
  const index = trimmed.lastIndexOf("/")
  if (index < 0) return "."
  if (index === 0) return "/"
  return trimmed.slice(0, index)
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "")
  return trimmed.slice(trimmed.lastIndexOf("/") + 1)
}

function realpath(path: string): string {
  const parts = path.split("/")
  while (parts.includes("..") && parts[0] !== "..") {
    for (let index = 1; index < parts.length; index++) {
      if (parts[index] === "..") {
        parts.splice(index - 1, 2)
        break
      }
    }
  }
  return parts.join("/")
}

class Package {
  private readonly entries: ZipEntry[]

  constructor(private readonly bytes: Buffer) {
    try {
      this.entries = zipEntries(bytes)
    } catch {
      fail("Could not open zip")
    }
  }

  private find(name: string): ZipEntry | undefined {
    const lower = name.toLowerCase()
    return this.entries.find((entry) => entry.name.toLowerCase() === lower)
  }

  private content(entry: ZipEntry | undefined): string | null {
    if (entry === undefined) return null
    try {
      return zipRead(this.bytes, entry).toString("latin1")
    } catch {
      return null
    }
  }

  has(name: string): boolean {
    return this.entries.some((entry) => entry.name === name)
  }

  read(name: string): string {
    let path = name.includes("//") ? name.slice(name.indexOf("//") + 1) : name
    path = realpath(path.replace(/^\.\//, ""))
    return this.content(this.find(path)) ?? this.content(this.find(path.slice(1))) ?? this.content(this.find(path.replaceAll("/", "\\"))) ?? ""
  }

  assertMember(name: string): void {
    if (!this.has(name) && !this.has(name.replaceAll("/", "\\"))) fail(`Could not find zip member ${name}`)
  }
}

function forbidden(raw: string): boolean {
  return /\0*<\0*!\0*D\0*O\0*C\0*T\0*Y\0*P\0*E\0*/.test(raw)
}

function decode(raw: string): string {
  if (forbidden(raw)) fail("Detected use of ENTITY in XML, spreadsheet file load() aborted to prevent XXE/XEE attacks")
  const bytes = Buffer.from(raw, "latin1")
  let charset = "UTF-8"
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) charset = "UTF-8"
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) charset = bytes[2] === 0 && bytes[3] === 0 ? "UTF-32LE" : "UTF-16LE"
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) charset = "UTF-16BE"
  else if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) charset = "UTF-32BE"
  else {
    const declared = /encoding\s*=\s*(["'])([\s\S]+?)\1/.exec(raw.replaceAll("\0", ""))
    if (declared) charset = declared[2].toUpperCase()
  }
  if (charset === "UTF-7" || /encoding\s*=\s*(["'])UTF-7\1/i.test(raw)) fail("UTF-7 encoding not permitted")
  let text: string
  if (charset === "UTF-8") text = bytes.toString("utf8").replace(/^\uFEFF/, "")
  else {
    try {
      text = new TextDecoder(charset.toLowerCase()).decode(bytes).replace(/^\uFEFF/, "")
    } catch {
      return fail(`Unsupported encoding ${charset}`)
    }
  }
  if (forbidden(text)) fail("Detected use of ENTITY in XML, spreadsheet file load() aborted to prevent XXE/XEE attacks")
  return text
}

function parseStrict(raw: string): Document {
  const text = decode(raw)
  let document: Document
  try {
    document = new DOMParser({
      onError: (_level, message) => {
        throw new WorkbookUnreadable(message)
      },
    }).parseFromString(text, "text/xml")
  } catch (error) {
    if (error instanceof WorkbookUnreadable) throw error
    return fail("XML parser error")
  }
  if (!document.documentElement) fail("Document is empty")
  return document
}

function parseLenient(raw: string): Element | null {
  const text = decode(raw)
  try {
    const document = new DOMParser({
      onError: (_level, message) => {
        throw new WorkbookUnreadable(message)
      },
    }).parseFromString(text, "text/xml")
    return document.documentElement ?? null
  } catch {
    return null
  }
}

function children(parent: Element | null, namespace: string | null, name: string): Element[] {
  if (parent === null) return []
  const found: Element[] = []
  for (let child: Node | null = parent.firstChild; child !== null; child = child.nextSibling) {
    if (child.nodeType !== 1) continue
    const element = child as Element
    if (element.localName === name && (namespace === null || element.namespaceURI === namespace)) found.push(element)
  }
  return found
}

function child(parent: Element | null, namespace: string | null, name: string): Element | null {
  return children(parent, namespace, name)[0] ?? null
}

function attribute(element: Element | null, name: string, namespace: string | null = null): string | null {
  if (element === null) return null
  if (namespace === null) {
    for (const item of Array.from(element.attributes)) {
      if (item.namespaceURI === null && (item.localName ?? item.name) === name) return item.value
    }
    return null
  }
  return element.hasAttributeNS(namespace, name) ? element.getAttributeNS(namespace, name) : null
}

function plainAttributes(element: Element): { name: string; value: string }[] {
  return Array.from(element.attributes)
    .filter((item) => item.namespaceURI === null && !(item.name === "xmlns" || item.name.startsWith("xmlns:")))
    .map((item) => ({ name: item.localName ?? item.name, value: item.value }))
}

function text(element: Element | null): string {
  if (element === null) return ""
  let value = ""
  for (let node: Node | null = element.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === 3 || node.nodeType === 4) value += node.nodeValue ?? ""
  }
  return value
}

function relationships(root: Element | null, namespace: string | null): Element[] {
  return children(root, namespace, "Relationship")
}

export function ooxmlToText(value: string): string {
  return value.replace(/_x[0-9A-F]{4}_(_xD[CDEF][0-9A-F]{2}_)?/g, (match) => {
    const high = Number.parseInt(match.slice(2, 6), 16)
    if (match.length === 7) return match[2] === "D" && "89ABCDEF".includes(match[3]) ? "\uFFFD" : String.fromCodePoint(high)
    if (match[2] === "D" && "CDF".includes(match[3])) return "\uFFFD"
    if (match[2] !== "D" || !"89AB".includes(match[3])) return (match[2] === "D" && "CDEF".includes(match[3]) ? "" : String.fromCodePoint(high)) + "\uFFFD"
    const low = Number.parseInt(match.slice(9, 13), 16)
    return String.fromCodePoint(0x10000 + (high - 0xd800) * 0x400 + (low - 0xdc00))
  })
}

function checkString(value: string): string {
  const characters = [...value]
  const limited = characters.length > MAX_STRING_LENGTH ? characters.slice(0, MAX_STRING_LENGTH).join("") : value
  return limited.replace(/\r\n|\r/g, "\n")
}

type Shared = { text: string; rich: boolean }

function richText(element: Element | null, main: string): string {
  if (element === null) return ""
  const plain = child(element, main, "t")
  if (plain !== null) return ooxmlToText(text(plain))
  return children(element, main, "r")
    .map((run) => ooxmlToText(text(child(run, main, "t"))))
    .join("")
}

function numericString(value: string): string {
  const trimmed = value.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, "")
  if (/^[+-]?\d+$/.test(trimmed)) {
    const big = BigInt(trimmed)
    if (big <= BigInt("9223372036854775807") && big >= BigInt("-9223372036854775808")) return big.toString()
  }
  return phpFloatString(Number(trimmed))
}

function looselyEquals(value: string, number: string): boolean {
  return NUMERIC.test(value) ? Number(value.trim()) === Number(number) : value === number
}

function booleanValue(v: Element): boolean {
  return !looselyEquals(text(v), "0")
}

function errorCode(value: string | null): string {
  return value !== null && ERROR_CODES.includes(value) ? value : "#NULL!"
}

function isoDate(value: string | null): string {
  const match = value === null ? null : /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*$/.exec(value)
  if (match === null) return fail(`Invalid string ${value} supplied for datatype Date`)
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match
  const days = (Date.UTC(Number(year), Number(month) - 1, Number(day)) - Date.UTC(1899, 11, 30)) / 86_400_000
  const serial = days + (Number(hour) * 3600 + Number(minute) * 60 + Number(second)) / 86_400
  return Number.isInteger(serial) ? String(serial) : phpFloatString(serial)
}

function bound(value: string | null): BookCell {
  if (value === null) return { formula: false, value: null }
  if (value.length > 1 && value.startsWith("=")) return { formula: true, value }
  return { formula: false, value: ERROR_CODES.includes(value) ? value : checkString(value) }
}

function cellValue(c: Element, shared: Shared[], main: string): BookCell | "skip" {
  const type = attribute(c, "t") ?? ""
  const v = child(c, main, "v")
  const f = child(c, main, "f")
  const formula = f !== null && (text(f) !== "" || (attribute(f, "t") ?? "").toLowerCase() === "shared")
  const raw = v === null ? null : text(v)
  switch (type) {
    case "s": {
      if (raw === null || raw === "") return { formula: false, value: checkString("") }
      const index = phpIntCast(raw)
      const entry = index >= 0 ? shared[index] : undefined
      if (entry === undefined) return fail(`Undefined array key ${index}`)
      return { formula: false, value: entry.rich ? entry.text : checkString(entry.text) }
    }
    case "b":
      if (formula) return { formula: true, value: null }
      if (v === null) return "skip"
      return { formula: false, value: booleanValue(v) ? "TRUE" : "FALSE" }
    case "str":
      if (formula) return { formula: true, value: null }
      return { formula: false, value: checkString(raw ?? "") }
    case "inlineStr":
      if (formula) return { formula: true, value: null }
      return { formula: false, value: richText(child(c, main, "is"), main) }
    case "e":
      if (formula) return { formula: true, value: null }
      return { formula: false, value: errorCode(raw) }
    default: {
      if (formula) return { formula: true, value: null }
      if (raw !== null && NUMERIC.test(raw)) return { formula: false, value: numericString(raw) }
      if (type === "") return bound(raw)
      if ((type === "n" && (raw === null || raw === "")) || type === "null") return "skip"
      if (type === "n") return fail("Invalid numeric value for datatype Numeric")
      if (type === "d") return { formula: false, value: isoDate(raw) }
      return fail(`Invalid datatype: ${type}`)
    }
  }
}

function loadSheetData(root: Element | null, sheet: BookSheet, shared: Shared[], main: string): void {
  const data = child(root, main, "sheetData")
  let rowNumber = 1
  for (const row of children(data, main, "row")) {
    let position = 1
    for (const c of children(row, main, "c")) {
      let reference = attribute(c, "r") ?? ""
      if (reference === "") reference = `${columnName(position)}${rowNumber}`
      coordinate(reference)
      const value = cellValue(c, shared, main)
      const target = sheet.touch(normalizedReference(reference))
      if (value !== "skip") {
        target.formula = value.formula
        target.value = value.value
      }
      position++
    }
    rowNumber++
  }
}

function rangeCells(range: string): [number, number, number, number] | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
  if (match === null) return null
  return [columnIndex(match[1]), Number(match[2]), columnIndex(match[3]), Number(match[4])]
}

function applyMerges(root: Element | null, sheet: BookSheet, main: string): void {
  const merges = child(root, main, "mergeCells")
  for (const merge of children(merges, main, "mergeCell")) {
    const reference = attribute(merge, "ref") ?? ""
    if (!reference.includes(":")) continue
    const range = reference.toUpperCase().replaceAll("$", "")
    const bounds = rangeCells(range)
    if (bounds === null) fail("Merge must be on a valid range of cells.")
    const [firstColumn, firstRow, lastColumn, lastRow] = bounds
    if (lastRow - firstRow === 1 && lastColumn - firstColumn === 1) continue
    sheet.touch(`${columnName(firstColumn)}${firstRow}`)
  }
}

function applyValidations(root: Element, sheet: BookSheet): void {
  const validations = child(root, null, "dataValidations")
  for (const validation of children(validations, null, "dataValidation")) {
    for (const range of (attribute(validation, "sqref") ?? "").toUpperCase().split(" ")) {
      const match = /^[A-Z]{1,3}\d{1,7}/.exec(range)
      if (match) sheet.touch(normalizedReference(match[0]))
    }
  }
}

function applyHyperlinks(root: Element | null, sheet: BookSheet, main: string): void {
  const links = child(root, main, "hyperlinks")
  for (const link of children(links, main, "hyperlink")) {
    for (const part of (attribute(link, "ref") ?? "").split(/[ ,]+/)) {
      const [from, to = from] = part.split(":")
      const [firstColumn, firstRow] = indexes(from)
      const [lastColumn, lastRow] = indexes(to)
      for (let column = Math.min(firstColumn, lastColumn); column <= Math.max(firstColumn, lastColumn); column++) {
        for (let row = Math.min(firstRow, lastRow); row <= Math.max(firstRow, lastRow); row++) sheet.touch(`${columnName(column)}${row}`)
      }
    }
  }
}

function applyProtection(root: Element | null, main: string): void {
  const protection = child(root, main, "sheetProtection")
  if (protection === null) return
  for (const item of plainAttributes(protection)) {
    if (!PROTECTION_SETTERS.has(item.name.toLowerCase())) fail(`Call to undefined method set${item.name}`)
  }
}

function mainNamespace(type: string): string {
  if (type === PURL_OFFICE_DOCUMENT) return PURL_MAIN
  if (type === THUMBNAIL) return ""
  return MAIN
}

export function workbookArchiveSize(bytes: Buffer): number {
  return zipEntries(bytes).reduce((sum, entry) => sum + entry.size, 0)
}

export function listWorksheetInfo(bytes: Buffer): WorksheetInfo[] {
  const zip = new Package(bytes)
  zip.assertMember("_rels/.rels")
  const info: WorksheetInfo[] = []
  for (const rel of relationships(parseLenient(zip.read("_rels/.rels")), RELATIONSHIPS)) {
    const type = attribute(rel, "Type") ?? ""
    const main = mainNamespace(type)
    if (main === "") continue
    const target = attribute(rel, "Target") ?? ""
    const dir = dirname(target)
    const namespace = dirname(type)
    const sheets = new Map<string, string>()
    for (const link of relationships(parseLenient(zip.read(`${dir}/_rels/${basename(target)}.rels`)), RELATIONSHIPS)) {
      const linkType = attribute(link, "Type") ?? ""
      if (linkType === `${namespace}/worksheet` || linkType === `${namespace}/chartsheet`) sheets.set(attribute(link, "Id") ?? "", attribute(link, "Target") ?? "")
    }
    const list = child(parseLenient(zip.read(target)), main, "sheets")
    for (const sheet of children(list, main, "sheet")) {
      const id = attribute(sheet, "id", namespace) ?? ""
      const file = sheets.get(id)
      if (file === undefined) fail(`Undefined array key "${id}"`)
      const path = file.startsWith("/") ? file.slice(1) : `${dirname(target)}/${file}`
      const content = zip.read(path)
      if (content === "") fail("XMLReader::xml(): Argument #1 ($source) cannot be empty")
      const document = parseStrict(content)
      let rows = 0
      let columns = 0
      let current = 0
      const visit = (node: Node) => {
        for (let next: Node | null = node.firstChild; next !== null; next = next.nextSibling) {
          if (next.nodeType !== 1) continue
          const element = next as Element
          if (element.localName === "row" && element.namespaceURI === main) {
            rows = phpIntCast(attribute(element, "r") ?? "")
            columns = Math.max(columns, current)
            current = 0
          } else if (element.localName === "c" && element.namespaceURI === main) {
            const reference = attribute(element, "r")
            current = reference !== null && reference !== "" && reference !== "0" ? Math.max(current, indexes(reference)[0]) : current + 1
          }
          visit(element)
        }
      }
      visit(document)
      columns = Math.max(columns, current)
      info.push({ worksheetName: attribute(sheet, "name") ?? "", totalRows: rows, totalColumns: columns })
    }
  }
  return info
}

function workbookBase(zip: Package): { basename: string; namespace: string } {
  let name = ""
  let namespace = ""
  for (const rel of relationships(parseLenient(zip.read("_rels/.rels")), RELATIONSHIPS)) {
    const type = attribute(rel, "Type") ?? ""
    if (type === OFFICE_DOCUMENT || type === PURL_OFFICE_DOCUMENT) {
      const base = basename(attribute(rel, "Target") ?? "")
      namespace = dirname(type)
      if (/workbook.*\.xml/.test(base)) name = base
    }
  }
  return { basename: name, namespace }
}

function sharedStrings(root: Element | null, main: string): Shared[] {
  if (root === null) return []
  return children(root, main, "si").map((item) => {
    const plain = child(item, main, "t")
    if (plain !== null) return { text: ooxmlToText(text(plain)), rich: false }
    if (child(item, main, "r") !== null) return { text: richText(item, main), rich: true }
    return { text: "", rich: false }
  })
}

export function loadWorkbook(bytes: Buffer): Book {
  const zip = new Package(bytes)
  zip.assertMember("_rels/.rels")
  const base = workbookBase(zip)
  const sheets: BookSheet[] = []
  for (const rel of relationships(parseLenient(zip.read("_rels/.rels")), RELATIONSHIPS)) {
    let target = attribute(rel, "Target") ?? ""
    if (target === "") fail("Uninitialized string offset 0")
    if (target.startsWith("/")) target = target.slice(1)
    const type = attribute(rel, "Type") ?? ""
    const main = mainNamespace(type)
    if (PROPERTY_RELATIONS.includes(type)) {
      parseStrict(zip.read(target))
      continue
    }
    if (type !== `${base.namespace}/officeDocument`) continue
    const dir = dirname(target)
    const links = relationships(parseLenient(zip.read(`${dir}/_rels/${basename(target)}.rels`)), RELATIONSHIPS)
    const worksheets = new Map<string, string>()
    for (const link of links) {
      const linkType = attribute(link, "Type")
      if (linkType === WORKSHEET || linkType === PURL_WORKSHEET) worksheets.set(attribute(link, "Id") ?? "", attribute(link, "Target") ?? "")
    }
    const stringsLink = links.find((link) => attribute(link, "Type") === `${base.namespace}/sharedStrings`)
    let shared: Shared[] = []
    if (stringsLink !== undefined) {
      const stringsTarget = attribute(stringsLink, "Target") ?? ""
      const root = parseLenient(zip.read(stringsTarget.startsWith("/") ? stringsTarget.slice(1) : `${dir}/${stringsTarget}`))
      shared = sharedStrings(root, main)
    }
    parseStrict(zip.read(target))
    const list = child(parseLenient(zip.read(target)), main, "sheets")
    for (const entry of children(list, main, "sheet")) {
      const id = attribute(entry, "id", base.namespace) ?? ""
      let file = worksheets.get(id)
      if (file === undefined) continue
      const sheet = new BookSheet(attribute(entry, "name") ?? "")
      sheets.push(sheet)
      if (file === "") fail("Uninitialized string offset 0")
      if (file.startsWith("/") && dir !== ".") file = file.slice(dir.length + 2)
      const path = `${dir}/${file}`
      const content = zip.read(path)
      const strict = parseStrict(content).documentElement as Element
      const root = parseLenient(content)
      loadSheetData(root, sheet, shared, main)
      applyProtection(root, main)
      applyMerges(root, sheet, main)
      applyValidations(strict, sheet)
      const links = `${dirname(path)}/_rels/${basename(file)}.rels`
      if (zip.has(links)) parseLenient(zip.read(links))
      applyHyperlinks(root, sheet, main)
    }
  }
  return { sheets }
}
