import { columnWidths } from "./tableGrid"
import { controlCharacters, element, escapeDomText, phpPrecision } from "./xml"

export type FontStyle = { name?: string; size?: number; color?: string; bold?: boolean; italic?: boolean; underline?: string }
export type ParagraphStyle = { keepNext?: boolean; alignment?: string; spaceBefore?: number; spaceAfter?: number; numStyle?: string; numLevel?: number }
export type TableStyle = { width?: number; unit?: string; borderSize?: number; borderColor?: string; cellMargin?: number }
export type RowStyle = { tblHeader?: boolean; cantSplit?: boolean }
export type CellStyle = { valign?: string; bgColor?: string; gridSpan?: number; vMerge?: string; borderSize?: number; borderStyle?: string; borderColor?: string }
export type ImageStyle = { height?: number; width?: number; alignment?: string }
export type Media = { relationId: number; target: string; extension: string; mime: string; bytes: Buffer; width: number; height: number }
export type SectionStyle = { paperSize: string; orientation: string; margin: number }
export type DocumentStyle = { fontName: string; fontSize: number; fontColor: string; paragraph: { spaceAfter: number; lineHeight: number; alignment: string } }

export const NUMBERING_IDS: Record<string, number> = { "silabo-bullets": 2, "silabo-numbers": 3 }

const SECTION_RELATIONS = 6
const DEFAULT_HEADER = 720
const PAPERS: Record<string, [number, number]> = {
  Letter: [8.5 * 1440, 11 * 1440],
  A4: [(210 / 10 / 2.54) * 1440, (297 / 10 / 2.54) * 1440],
  Legal: [8.5 * 1440, 14 * 1440],
}

type TextElement = { kind: "text"; text: string; font: FontStyle; paragraph: ParagraphStyle }
type BreakElement = { kind: "break" }
type ImageElement = { kind: "image"; media: Media; style: ImageStyle }

export type WordElement = TextElement | BreakElement | ImageElement | WordTextRun | WordTable

export class WordContainer {
  readonly elements: WordElement[] = []

  constructor(protected readonly document: WordDocument) {}

  addText(text: string, font: FontStyle = {}, paragraph: ParagraphStyle = {}): void {
    this.elements.push({ kind: "text", text, font, paragraph })
  }

  addTextRun(paragraph: ParagraphStyle = {}): WordTextRun {
    const run = new WordTextRun(this.document, paragraph)
    this.elements.push(run)
    return run
  }

  addTable(style: TableStyle): WordTable {
    const table = new WordTable(this.document, style)
    this.elements.push(table)
    return table
  }

  addImage(source: Buffer, key: string, style: ImageStyle): void {
    const media = this.document.media(source, key)
    const sized = { ...style }
    if (!(sized.width && sized.height)) {
      if (!sized.width && !sized.height) {
        sized.width = media.width
        sized.height = media.height
      } else if (sized.width) {
        sized.height = media.height * (sized.width / media.width)
      } else if (sized.height) {
        sized.width = media.width * (sized.height / media.height)
      }
    }
    this.elements.push({ kind: "image", media, style: sized })
  }
}

export class WordTextRun extends WordContainer {
  readonly kind = "run"

  constructor(
    document: WordDocument,
    readonly paragraph: ParagraphStyle,
  ) {
    super(document)
  }

  addTextBreak(): void {
    this.elements.push({ kind: "break" })
  }
}

export class WordCell extends WordContainer {
  constructor(
    document: WordDocument,
    public width: number | null,
    readonly style: CellStyle,
  ) {
    super(document)
  }
}

export class WordRow {
  readonly cells: WordCell[] = []

  constructor(
    private readonly document: WordDocument,
    readonly style: RowStyle,
  ) {}

  addCell(width: number | null, style: CellStyle = {}): WordCell {
    const cell = new WordCell(this.document, width, style)
    this.cells.push(cell)
    return cell
  }
}

export class WordTable {
  readonly kind = "table"
  readonly rows: WordRow[] = []

  constructor(
    private readonly document: WordDocument,
    readonly style: TableStyle,
  ) {}

  addRow(style: RowStyle = {}): WordRow {
    const row = new WordRow(this.document, style)
    this.rows.push(row)
    return row
  }
}

export class WordSection extends WordContainer {
  constructor(
    document: WordDocument,
    readonly style: SectionStyle,
  ) {
    super(document)
  }
}

export class WordDocument {
  readonly sections: WordSection[] = []
  readonly images: Media[] = []
  private readonly mediaKeys = new Map<string, Media>()

  constructor(
    readonly style: DocumentStyle,
    private readonly imageInfo: (bytes: Buffer) => { width: number; height: number; extension: string; mime: string },
  ) {}

  addSection(style: SectionStyle): WordSection {
    const section = new WordSection(this, style)
    this.sections.push(section)
    return section
  }

  media(bytes: Buffer, key: string): Media {
    const known = this.mediaKeys.get(key)
    if (known !== undefined) return known
    const info = this.imageInfo(bytes)
    const media = { ...info, bytes, relationId: this.images.length + 1, target: `section_image${this.images.length + 1}.${info.extension}` }
    this.images.push(media)
    this.mediaKeys.set(key, media)
    return media
  }
}

function onOff(value: boolean): string {
  return value ? "1" : "0"
}

function fontXml(font: FontStyle): string {
  const parts: string[] = []
  if (font.name !== undefined) parts.push(element("w:rFonts", [["w:ascii", font.name], ["w:hAnsi", font.name], ["w:eastAsia", font.name], ["w:cs", font.name]]))
  if (font.color !== undefined) parts.push(element("w:color", [["w:val", font.color]]))
  if (font.size !== undefined) parts.push(element("w:sz", [["w:val", font.size * 2]]), element("w:szCs", [["w:val", font.size * 2]]))
  if (font.bold !== undefined) parts.push(element("w:b", [["w:val", onOff(font.bold)]]), element("w:bCs", [["w:val", onOff(font.bold)]]))
  if (font.italic !== undefined) parts.push(element("w:i", [["w:val", onOff(font.italic)]]), element("w:iCs", [["w:val", onOff(font.italic)]]))
  if (font.underline !== undefined && font.underline !== "none") parts.push(element("w:u", [["w:val", font.underline]]))
  return element("w:rPr", [], parts.join(""))
}

export function paragraphXml(paragraph: ParagraphStyle): string {
  const parts: string[] = []
  if (paragraph.keepNext === true) parts.push(element("w:keepNext", [["w:val", "1"]]))
  if (paragraph.alignment !== undefined && paragraph.alignment !== "") parts.push(element("w:jc", [["w:val", paragraph.alignment]]))
  if (paragraph.spaceBefore !== undefined || paragraph.spaceAfter !== undefined) {
    const spacing: [string, number][] = []
    if (paragraph.spaceBefore !== undefined) spacing.push(["w:before", paragraph.spaceBefore])
    if (paragraph.spaceAfter !== undefined) spacing.push(["w:after", paragraph.spaceAfter])
    parts.push(element("w:spacing", spacing))
  }
  if (paragraph.numStyle !== undefined && NUMBERING_IDS[paragraph.numStyle] !== undefined) {
    const level = paragraph.numLevel ?? 0
    parts.push(element("w:numPr", [], element("w:numId", [["w:val", NUMBERING_IDS[paragraph.numStyle]]]) + element("w:ilvl", [["w:val", level]])))
    parts.push(element("w:outlineLvl", [["w:val", level]]))
  }
  return element("w:pPr", [], parts.join(""))
}

function runXml(text: TextElement): string {
  return `<w:r>${fontXml(text.font)}${element("w:t", [["xml:space", "preserve"]], escapeDomText(controlCharacters(text.text)))}</w:r>`
}

function imageXml(image: ImageElement, withoutP: boolean): string {
  const style = image.style
  const css = [
    ...(style.width !== undefined ? [`width:${phpPrecision(style.width)}pt`] : []),
    ...(style.height !== undefined ? [`height:${phpPrecision(style.height)}pt`] : []),
    "margin-left:0pt",
    "margin-top:0pt",
    "mso-position-horizontal:left",
    "mso-position-vertical:top",
    "mso-position-horizontal-relative:char",
    "mso-position-vertical-relative:line",
  ]
    .map((rule) => `${rule};`)
    .join(" ")
  const shape = element(
    "v:shape",
    [
      ["type", "#_x0000_t75"],
      ["stroked", "f"],
      ["style", css],
    ],
    element("w10:wrap", [["type", "inline"]]) + element("v:imagedata", [["r:id", `rId${image.media.relationId + SECTION_RELATIONS}`], ["o:title", ""]]),
  )
  const run = `<w:r><w:pict>${shape}</w:pict></w:r>`
  if (withoutP) return run
  const alignment = style.alignment !== undefined && style.alignment !== "" ? element("w:jc", [["w:val", style.alignment]]) : ""
  return `<w:p>${element("w:pPr", [], alignment)}${run}</w:p>`
}

function bordersXml(sides: string[], sizes: number[], colors: (string | undefined)[], styles: (string | undefined)[], defaultColor: string | null): string {
  return sides
    .map((side, index) => {
      const color = colors[index] ?? defaultColor ?? undefined
      return element(`w:${side}`, [["w:val", styles[index] ?? "single"], ["w:sz", sizes[index]], ...(color !== undefined && color !== "" ? ([["w:color", color]] as [string, string][]) : [])])
    })
    .join("")
}

function cellXml(cell: WordCell): string {
  const style = cell.style
  const properties: string[] = []
  if (cell.width !== null) properties.push(element("w:tcW", [["w:w", cell.width], ["w:type", "dxa"]]))
  if (style.valign !== undefined) properties.push(element("w:vAlign", [["w:val", style.valign]]))
  if (style.borderSize !== undefined) {
    const sides = ["top", "left", "right", "bottom"]
    properties.push(
      element(
        "w:tcBorders",
        [],
        bordersXml(
          sides,
          sides.map(() => style.borderSize as number),
          sides.map(() => style.borderColor),
          sides.map(() => style.borderStyle),
          "000000",
        ),
      ),
    )
  }
  if (style.bgColor !== undefined) properties.push(element("w:shd", [["w:val", "clear"], ["w:fill", style.bgColor]]))
  if (style.gridSpan !== undefined) properties.push(element("w:gridSpan", [["w:val", style.gridSpan]]))
  if (style.vMerge !== undefined) properties.push(element("w:vMerge", [["w:val", style.vMerge]]))
  properties.push(element("w:noWrap"))
  return `<w:tc>${element("w:tcPr", [], properties.join(""))}${containerXml(cell, false, true)}</w:tc>`
}

function tableXml(table: WordTable): string {
  if (table.rows.length === 0) return ""
  const widths = columnWidths(table.rows.map((row) => (row.cells.length === 0 ? [{ span: 1, width: 0 }] : row.cells.map((cell) => ({ span: cell.style.gridSpan ?? 1, width: cell.width ?? 0 })))))
  for (const row of table.rows) {
    let column = 0
    for (const cell of row.cells) {
      const span = Math.max(1, cell.style.gridSpan ?? 1)
      if (cell.width !== null) cell.width = widths.slice(column, column + span).reduce((sum, width) => sum + width, 0)
      column += span
    }
  }
  const style = table.style
  const properties: string[] = []
  if (style.width !== undefined) properties.push(element("w:tblW", [["w:w", widths.reduce((sum, width) => sum + width, 0)], ["w:type", "dxa"]]))
  properties.push(element("w:tblLayout", [["w:type", "fixed"]]))
  if (style.cellMargin !== undefined) {
    const margin = style.cellMargin
    properties.push(element("w:tblCellMar", [], ["top", "left", "right", "bottom"].map((side) => element(`w:${side}`, [["w:w", margin], ["w:type", "dxa"]])).join("")))
  }
  if (style.borderSize !== undefined) {
    const sides = ["top", "left", "right", "bottom", "insideH", "insideV"]
    properties.push(
      element(
        "w:tblBorders",
        [],
        bordersXml(
          sides,
          sides.map(() => style.borderSize as number),
          sides.map(() => style.borderColor),
          sides.map(() => undefined),
          null,
        ),
      ),
    )
  }
  const grid = element("w:tblGrid", [], widths.map((width) => element("w:gridCol", [["w:w", width], ["w:type", "dxa"]])).join(""))
  const rows = table.rows
    .map((row) => {
      const rowProperties = (row.style.tblHeader === true ? element("w:tblHeader", [["w:val", "1"]]) : "") + (row.style.cantSplit === true ? element("w:cantSplit", [["w:val", "1"]]) : "")
      const cells = row.cells.length === 0 ? `<w:tc>${element("w:tcPr", [], element("w:noWrap"))}<w:p/></w:tc>` : row.cells.map(cellXml).join("")
      return `<w:tr>${element("w:trPr", [], rowProperties)}${cells}</w:tr>`
    })
    .join("")
  return `<w:tbl>${element("w:tblPr", [], properties.join(""))}${grid}${rows}</w:tbl>`
}

function elementXml(item: WordElement, withoutP: boolean): string {
  if (item instanceof WordTable) return tableXml(item)
  if (item instanceof WordTextRun) return `<w:p>${paragraphXml(item.paragraph)}${containerXml(item, true, false)}</w:p>`
  if (item.kind === "break") return withoutP ? "<w:br/>" : "<w:p/>"
  if (item.kind === "image") return imageXml(item, withoutP)
  return withoutP ? runXml(item) : `<w:p>${paragraphXml(item.paragraph)}${runXml(item)}</w:p>`
}

function containerXml(container: WordContainer, withoutP: boolean, isCell: boolean): string {
  const body = container.elements.map((item) => elementXml(item, withoutP)).join("")
  const last = container.elements.at(-1)
  return isCell && (last === undefined || last instanceof WordTable) ? `${body}<w:p/>` : body
}

function sectionProperties(style: SectionStyle): string {
  const [width, height] = PAPERS[style.paperSize] ?? PAPERS.Letter
  const [pageWidth, pageHeight] = style.orientation === "landscape" ? [height, width] : [width, height]
  const margin = style.margin
  return element(
    "w:sectPr",
    [],
    element("w:pgSz", [["w:orient", style.orientation], ["w:w", pageWidth], ["w:h", pageHeight]]) +
      element("w:pgMar", [
        ["w:top", margin],
        ["w:right", margin],
        ["w:bottom", margin],
        ["w:left", margin],
        ["w:header", DEFAULT_HEADER],
        ["w:footer", DEFAULT_HEADER],
        ["w:gutter", 0],
      ]) +
      element("w:cols", [["w:num", 1], ["w:space", DEFAULT_HEADER]]),
  )
}

const DOCUMENT_NAMESPACES =
  'xmlns:ve="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"'

export function documentXml(document: WordDocument): string {
  const body = document.sections
    .map((section, index) => {
      const content = containerXml(section, false, false)
      const properties = sectionProperties(section.style)
      return index === document.sections.length - 1 ? content + properties : `${content}<w:p><w:pPr>${properties}</w:pPr></w:p>`
    })
    .join("")
  return `<w:document ${DOCUMENT_NAMESPACES}><w:body>${body}</w:body></w:document>`
}
