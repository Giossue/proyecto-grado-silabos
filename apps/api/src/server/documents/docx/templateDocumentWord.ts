import { isRecord, list, record, type PhpRecord } from "../../configuration/phpValues"
import type { CellStyle, FontStyle, ParagraphStyle, WordContainer } from "./wordDocument"

type Merge = { span: number; rows: number; options: CellStyle }

const LISTS: Record<string, string> = { bulletList: "silabo-bullets", orderedList: "silabo-numbers" }
const STYLED_NODES = ["text", "variable", "field", "column"]

function phpRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

function ltrimHash(value: string): string {
  return value.replace(/^#+/, "")
}

function nodes(value: unknown): PhpRecord[] {
  return list(value ?? []).map(record)
}

function attrsOf(node: PhpRecord): PhpRecord {
  return isRecord(node.attrs) ? node.attrs : {}
}

function given(source: PhpRecord, key: string): unknown {
  return source[key] ?? null
}

export class TemplateDocumentWord {
  private listDepth = 0
  private keepWithNext = false

  constructor(
    private readonly paragraphAlignment: string | null = null,
    private readonly tableHeaderBackground: string | null = null,
    private readonly tableHeaderColor: string | null = null,
    private readonly tableBorder = "333333",
  ) {}

  append(target: WordContainer, node: PhpRecord, width = 9406, listStyle: string | null = null, alignmentOverride: string | null = null, insideTable = false): void {
    if (node.type === "table") {
      this.table(target, node, width)
      return
    }
    if (node.type === "paragraph") {
      const own = given(attrsOf(node), "textAlign")
      const alignment = alignmentOverride ?? (typeof own === "string" && own !== "left" ? own : null) ?? this.paragraphAlignment ?? (typeof own === "string" ? own : "left")
      const style: ParagraphStyle = { spaceAfter: insideTable ? 0 : 80, alignment: alignment === "justify" ? "both" : alignment }
      if (insideTable && this.keepWithNext) style.keepNext = true
      if (listStyle !== null) {
        style.numStyle = listStyle
        style.numLevel = Math.max(0, Math.min(2, this.listDepth - 1))
      }
      const run = target.addTextRun(style)
      for (const text of nodes(node.content)) {
        if (text.type === "hardBreak") {
          run.addTextBreak()
          continue
        }
        const font: FontStyle = {}
        for (const mark of nodes(text.marks)) {
          if (mark.type === "bold") font.bold = true
          else if (mark.type === "italic") font.italic = true
          else if (mark.type === "underline") font.underline = "single"
          else if (mark.type === "textStyle") {
            const attrs = attrsOf(mark)
            if (attrs.color !== undefined && attrs.color !== null) font.color = ltrimHash(String(attrs.color))
            if (attrs.fontFamily !== undefined && attrs.fontFamily !== null && !insideTable) font.name = String(attrs.fontFamily)
          }
        }
        const lines = (typeof text.text === "string" ? text.text : "").split("\n")
        lines.forEach((line, index) => {
          if (index > 0) run.addTextBreak()
          run.addText(line, font)
        })
      }
      return
    }
    const type = typeof node.type === "string" ? node.type : ""
    const nextList = LISTS[type] ?? listStyle
    const isList = LISTS[type] !== undefined
    this.listDepth += isList ? 1 : 0
    for (const child of nodes(node.content)) this.append(target, child, width, nextList, alignmentOverride, insideTable)
    this.listDepth -= isList ? 1 : 0
  }

  private table(target: WordContainer, node: PhpRecord, width: number): void {
    const rows = nodes(node.content)
    const first = nodes(rows[0]?.content)
    const count = first.reduce((sum, cell) => sum + Number(given(attrsOf(cell), "colspan") ?? 1), 0)
    const weights = new Map<number, number>(Array.from({ length: count }, (_, index) => [index, 100]))
    const occupied = new Map<number, Set<number>>()
    rows.forEach((row, rowIndex) => {
      let column = 0
      for (const cell of nodes(row.content)) {
        while (occupied.get(rowIndex)?.has(column)) column++
        const attrs = attrsOf(cell)
        const span = Number(given(attrs, "colspan") ?? 1)
        const colwidth = list(given(attrs, "colwidth") ?? [])
        for (let offset = 0; offset < span; offset++) {
          const declared = Number(colwidth[offset] ?? 0)
          if (declared > 0) weights.set(column + offset, declared)
          for (let below = 1; below < Number(given(attrs, "rowspan") ?? 1); below++) {
            if (!occupied.has(rowIndex + below)) occupied.set(rowIndex + below, new Set())
            occupied.get(rowIndex + below)?.add(column + offset)
          }
        }
        column += span
      }
    })
    const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0)
    const widths = [...weights.values()].map((weight) => phpRound((width * weight) / total))
    const sumOf = (from: number, span: number) => widths.slice(from, from + span).reduce((sum, value) => sum + (value ?? 0), 0)
    const outerKeepWithNext = this.keepWithNext
    let leadingHeader = true
    let leadingHeading = true
    const table = target.addTable({ borderSize: 4, borderColor: this.tableBorder, cellMargin: 50, width: 5000, unit: "pct" })
    const merged = new Map<number, Merge>()
    for (const source of rows) {
      const content = nodes(source.content)
      leadingHeader = leadingHeader && content.every((cell) => cell.type === "tableHeader")
      leadingHeading = leadingHeading && content[0]?.type === "tableHeader"
      const row = table.addRow({ ...(leadingHeading ? { cantSplit: true } : {}), ...(leadingHeader ? { tblHeader: true } : {}) })
      const cells = [...content]
      let column = 0
      while (column < count) {
        const merge = merged.get(column)
        if (merge !== undefined) {
          const continued = row.addCell(sumOf(column, merge.span), merge.options)
          if (leadingHeading) continued.addTextRun({ spaceAfter: 0, keepNext: true })
          merge.rows--
          if (merge.rows === 0) merged.delete(column)
          column += merge.span
          continue
        }
        const cell = cells.shift()
        if (cell === undefined) break
        const attrs = attrsOf(cell)
        const span = Number(given(attrs, "colspan") ?? 1)
        const height = Number(given(attrs, "rowspan") ?? 1)
        const cellWidth = sumOf(column, span)
        const isHeader = cell.type === "tableHeader"
        const options: CellStyle = { gridSpan: span, valign: "center", ...this.cellBorderOptions(attrs) }
        if (isHeader && this.tableHeaderBackground !== null) options.bgColor = this.tableHeaderBackground
        if (given(attrs, "backgroundColor") !== null) options.bgColor = ltrimHash(String(attrs.backgroundColor))
        if (height > 1) {
          options.vMerge = "restart"
          merged.set(column, { span, rows: height - 1, options: { ...options, vMerge: "continue" } })
        }
        const destination = row.addCell(cellWidth, options)
        this.keepWithNext = leadingHeading
        const documentHeader = isHeader && given(attrs, "backgroundColor") === null
        const textAttrs = documentHeader && this.tableHeaderBackground !== null && typeof attrs.bold !== "boolean" ? { ...attrs, bold: true } : attrs
        for (const child of nodes(cell.content)) {
          const styled = documentHeader && this.tableHeaderColor !== null ? this.withTextColor(child, this.tableHeaderColor) : child
          this.append(destination, this.withCellTextStyle(styled, textAttrs), cellWidth, null, typeof attrs.textAlign === "string" ? attrs.textAlign : null, true)
        }
        column += span
      }
    }
    this.keepWithNext = outerKeepWithNext
  }

  private cellBorderOptions(attrs: PhpRecord): CellStyle {
    switch (attrs.borderStyle) {
      case "none":
        return { borderSize: 0, borderStyle: "none" }
      case "thick":
        return { borderSize: 12, borderStyle: "single", borderColor: this.tableBorder }
      case "thin":
        return { borderSize: 4, borderStyle: "single", borderColor: this.tableBorder }
      default:
        return {}
    }
  }

  private withCellTextStyle(node: PhpRecord, attrs: PhpRecord): PhpRecord {
    let next: PhpRecord = node
    if (next.type === "paragraph" && typeof attrs.textAlign === "string") next = { ...next, attrs: { ...attrsOf(next), textAlign: attrs.textAlign } }
    if (STYLED_NODES.includes(String(next.type))) {
      let marks = nodes(next.marks)
      for (const markType of ["bold", "italic"]) {
        if (typeof attrs[markType] !== "boolean") continue
        marks = marks.filter((mark) => mark.type !== markType)
        if (attrs[markType]) marks.push({ type: markType })
      }
      next = { ...next, marks }
      if (typeof attrs.textColor === "string") next = this.withTextColor(next, ltrimHash(attrs.textColor))
    }
    if (Array.isArray(next.content)) next = { ...next, content: nodes(next.content).map((child) => this.withCellTextStyle(child, attrs)) }
    return next
  }

  private withTextColor(node: PhpRecord, color: string): PhpRecord {
    let next: PhpRecord = node
    if (next.type === "text") {
      let styled = false
      const marks = nodes(next.marks).map((mark) => {
        if (mark.type !== "textStyle") return mark
        styled = true
        return { ...mark, attrs: { ...attrsOf(mark), color: `#${color}` } }
      })
      if (!styled) marks.push({ type: "textStyle", attrs: { color: `#${color}` } })
      next = { ...next, marks }
    }
    if (Array.isArray(next.content)) next = { ...next, content: nodes(next.content).map((child) => this.withTextColor(child, color)) }
    return next
  }
}
