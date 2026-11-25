import { columnLetter } from "./workbook"
import { SharedStrings, SHEET_FORMAT, WORKSHEET_CLOSE, WORKSHEET_OPEN, XML_HEADER } from "./phpSpreadsheetXlsx"

export type Fill = { type: "none" | "solid"; start: string; end: string }

export type Locked = "inherit" | "protected" | "unprotected"

export type CellStyle = {
  bold: boolean
  fill: Fill
  format: string
  wrap: boolean
  vertical: string | null
  locked: Locked
  quotePrefix: boolean
}

export const TEXT_FORMAT = "@"

const BUILT_IN_FORMATS: Record<string, number> = { General: 0, [TEXT_FORMAT]: 49 }
const MAX_STRING_LENGTH = 32767

const DEFAULT_STYLE: CellStyle = {
  bold: false,
  fill: { type: "none", start: "FFFFFFFF", end: "FF000000" },
  format: "General",
  wrap: false,
  vertical: null,
  locked: "inherit",
  quotePrefix: false,
}

function styleKey(style: CellStyle): string {
  return JSON.stringify([style.bold, style.fill.type, style.fill.start, style.fill.end, style.format, style.wrap, style.vertical, style.locked, style.quotePrefix])
}

function fillKey(fill: Fill): string {
  return `${fill.type}:${fill.start}:${fill.end}`
}

export class StyleBook {
  readonly xfs: CellStyle[] = [DEFAULT_STYLE]

  index(style: CellStyle): number {
    const key = styleKey(style)
    const found = this.xfs.findIndex((candidate) => styleKey(candidate) === key)
    if (found >= 0) return found
    this.xfs.push(style)
    return this.xfs.length - 1
  }

  styleAt(index: number): CellStyle {
    return this.xfs[index]
  }
}

type Cell = { text: string | null; xf: number }

type Column = { width: number | null; visible: boolean }

function indexesOf(reference: string): [number, number] {
  const match = /^([A-Z]+)(\d+)$/.exec(reference)
  if (!match) throw new Error(`Invalid cell reference ${reference}`)
  let column = 0
  for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64)
  return [column, Number(match[2])]
}

export function checkString(text: string): string {
  const characters = [...text]
  const limited = characters.length > MAX_STRING_LENGTH ? characters.slice(0, MAX_STRING_LENGTH).join("") : text
  return limited.replace(/\r\n|\r/g, "\n")
}

function formatNumber(value: number): string {
  return String(value)
}

export class StyledSheet {
  private readonly rows = new Map<number, Map<number, Cell>>()
  private readonly heights = new Map<number, number>()
  private readonly columns = new Map<number, Column>()
  private readonly merges: string[] = []
  private highestRow = 1
  private highestColumn = 1
  private selection = "A1"
  private frozen = false
  password: string | null = null

  constructor(
    private readonly book: StyleBook,
    readonly title: string,
    readonly state?: "veryHidden",
  ) {}

  private cell(column: number, row: number): Cell {
    let cells = this.rows.get(row)
    if (cells === undefined) {
      cells = new Map()
      this.rows.set(row, cells)
    }
    let cell = cells.get(column)
    if (cell === undefined) {
      cell = { text: null, xf: 0 }
      cells.set(column, cell)
      this.highestRow = Math.max(this.highestRow, row)
      this.highestColumn = Math.max(this.highestColumn, column)
    }
    return cell
  }

  text(reference: string, value: string): void {
    const [column, row] = indexesOf(reference)
    const cell = this.cell(column, row)
    const quotePrefix = new TextEncoder().encode(value).length > 1 && value.startsWith("=")
    cell.text = checkString(value)
    if (this.book.styleAt(cell.xf).quotePrefix !== quotePrefix) {
      const selection = this.selection
      this.style(reference, (style) => ({ ...style, quotePrefix }))
      this.selection = selection
    }
  }

  style(range: string, change: (style: CellStyle) => CellStyle): void {
    const [from, to = from] = range.split(":")
    const [firstColumn, firstRow] = indexesOf(from)
    const [lastColumn, lastRow] = indexesOf(to)
    const previous: number[] = []
    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const xf = this.cell(column, row).xf
        if (!previous.includes(xf)) previous.push(xf)
      }
    }
    const mapping = new Map<number, number>()
    for (const xf of previous) mapping.set(xf, this.book.index(change(this.book.styleAt(xf))))
    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const cell = this.cell(column, row)
        cell.xf = mapping.get(cell.xf) ?? cell.xf
      }
    }
    this.selection = range
  }

  merge(range: string): void {
    this.merges.push(range)
    const [from] = range.split(":")
    const [column, row] = indexesOf(from)
    this.cell(column, row)
  }

  rowHeight(row: number, height: number): void {
    this.heights.set(row, height)
    this.highestRow = Math.max(this.highestRow, row)
  }

  private column(index: number): Column {
    let column = this.columns.get(index)
    if (column === undefined) {
      column = { width: null, visible: true }
      this.columns.set(index, column)
      this.highestColumn = Math.max(this.highestColumn, index)
    }
    return column
  }

  columnWidth(index: number, width: number): void {
    this.column(index).width = width
  }

  hideColumn(index: number): void {
    this.column(index).visible = false
  }

  freezeAtD4(): void {
    this.frozen = true
  }

  usedStyles(): number[] {
    const used: number[] = []
    for (const cells of this.rows.values()) for (const cell of cells.values()) used.push(cell.xf)
    return used
  }

  write(strings: SharedStrings, selected: boolean, styleIndex: (xf: number) => number): string {
    const lastColumn = columnLetter(this.highestColumn)
    const active = this.selection.split(":")[0]
    const view =
      `<sheetViews><sheetView tabSelected="${selected ? 1 : 0}" workbookViewId="0" showGridLines="true" showRowColHeaders="1">` +
      (this.frozen
        ? `<pane xSplit="3" ySplit="3" activePane="bottomRight" state="frozen" topLeftCell="D4"/><selection pane="bottomRight" activeCell="${active}" sqref="${this.selection}"/>`
        : `<selection activeCell="${active}" sqref="${this.selection}"/>`) +
      "</sheetView></sheetViews>"
    const columns = [...this.columns.entries()].sort(([left], [right]) => left - right)
    const cols =
      columns.length === 0
        ? ""
        : "<cols>" +
          columns
            .map(
              ([index, column]) =>
                `<col min="${index}" max="${index}" width="${column.width === null ? "9.10" : formatNumber(column.width)}"` +
                (column.visible ? "" : ' hidden="true"') +
                (column.width === null ? "" : ' customWidth="true"') +
                ' style="0"/>',
            )
            .join("") +
          "</cols>"
    let rows = ""
    for (let row = 1; row <= this.highestRow; row++) {
      const cells = this.rows.get(row)
      const height = this.heights.get(row)
      if (cells === undefined && height === undefined) continue
      const attributes = `r="${row}" spans="1:${this.highestColumn}"` + (height === undefined ? "" : ` customHeight="1" ht="${formatNumber(height)}"`)
      const ordered = [...(cells ?? new Map<number, Cell>()).entries()].sort(([left], [right]) => left - right)
      const body = ordered
        .map(([column, cell]) => {
          const reference = `${columnLetter(column)}${row}`
          const xf = styleIndex(cell.xf)
          const style = xf === 0 ? "" : ` s="${xf}"`
          return cell.text === null || cell.text === "" ? `<c r="${reference}"${style}/>` : `<c r="${reference}"${style} t="s"><v>${strings.index(cell.text)}</v></c>`
        })
        .join("")
      rows += body === "" ? `<row ${attributes}/>` : `<row ${attributes}>${body}</row>`
    }
    return (
      WORKSHEET_OPEN +
      `<dimension ref="A1:${lastColumn}${this.highestRow}"/>` +
      view +
      SHEET_FORMAT +
      cols +
      (rows === "" ? "<sheetData/>" : `<sheetData>${rows}</sheetData>`) +
      (this.password === null ? "" : `<sheetProtection password="${this.password}" sheet="1"/>`) +
      (this.merges.length === 0 ? "" : `<mergeCells>${this.merges.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>`) +
      WORKSHEET_CLOSE
    )
  }
}

const FONT = (bold: boolean) =>
  `<font><b val="${bold ? 1 : 0}"/><i val="0"/><strike val="0"/><u val="none"/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>`

function fillXml(fill: Fill): string {
  if (fill.type === "none") return '<fill><patternFill patternType="none"/></fill>'
  return `<fill><patternFill patternType="solid"><fgColor rgb="${fill.start}"/><bgColor rgb="${fill.end}"/></patternFill></fill>`
}

export function collectStyles(book: StyleBook, sheets: StyledSheet[]): { styles: string; index: (xf: number) => number } {
  const used = new Set<number>([0])
  for (const sheet of sheets) for (const xf of sheet.usedStyles()) used.add(xf)
  const kept = book.xfs.map((_, index) => index).filter((index) => used.has(index))
  const mapping = new Map(kept.map((xf, index) => [xf, index]))
  const styles = kept.map((xf) => book.styleAt(xf))
  const fonts: boolean[] = []
  for (const style of styles) if (!fonts.includes(style.bold)) fonts.push(style.bold)
  const fills: Fill[] = [DEFAULT_STYLE.fill, { type: "solid", start: "gray125", end: "" }]
  for (const style of styles) {
    if (style.fill.type !== "none" && !fills.some((fill) => fillKey(fill) === fillKey(style.fill))) fills.push(style.fill)
  }
  const fillIndex = (fill: Fill) => (fill.type === "none" ? 0 : fills.findIndex((candidate) => fillKey(candidate) === fillKey(fill)))
  const xfs = styles
    .map((style) => {
      const aligned = style.wrap || style.vertical !== null
      const protectedCell = style.locked !== "inherit"
      return (
        `<xf xfId="0" fontId="${fonts.indexOf(style.bold)}"` +
        (style.quotePrefix ? ' quotePrefix="1"' : "") +
        ` numFmtId="${BUILT_IN_FORMATS[style.format] ?? 0}" fillId="${fillIndex(style.fill)}" borderId="0"` +
        ` applyFont="${style.bold ? 1 : 0}" applyNumberFormat="${style.format === "General" ? 0 : 1}" applyFill="${style.fill.type === "none" ? 0 : 1}" applyBorder="0" applyAlignment="${aligned ? 1 : 0}"` +
        (protectedCell ? ' applyProtection="true"' : "") +
        (aligned || protectedCell
          ? ">" +
            (aligned
              ? "<alignment" + (style.vertical === null ? "" : ` vertical="${style.vertical}"`) + ` textRotation="0" wrapText="${style.wrap ? "true" : "false"}" shrinkToFit="false"/>`
              : "") +
            (protectedCell ? `<protection locked="${style.locked === "protected" ? "true" : "false"}"/>` : "") +
            "</xf>"
          : "/>")
      )
    })
    .join("")
  const fillsXml = fills.map((fill, index) => (index === 1 ? '<fill><patternFill patternType="gray125"/></fill>' : fillXml(fill))).join("")
  return {
    index: (xf) => mapping.get(xf) ?? 0,
    styles:
      XML_HEADER +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/>' +
      `<fonts count="${fonts.length}">${fonts.map(FONT).join("")}</fonts>` +
      `<fills count="${fills.length}">${fillsXml}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${styles.length}">${xfs}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotTableStyle1"/></styleSheet>',
  }
}
