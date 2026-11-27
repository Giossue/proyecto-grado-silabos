import { isPhpArray, isRecord, list, record, type PhpRecord } from "../../configuration/phpValues"
import { documentAppearance } from "../../configuration/templatePresentation"
import { fieldDocumentIsEmpty, resolveDocument, type TemplateDefinition } from "../../configuration/templateRuntime"
import { historicalDocument, snapshotDefinition } from "../../syllabus/snapshotDocuments"
import { wordDisplay } from "../historicalFieldDocument"
import { imageInfo } from "./imageInfo"
import { TemplateDocumentWord } from "./templateDocumentWord"
import { WordDocument, type WordContainer, type WordSection } from "./wordDocument"

export type DocumentRenderInput = {
  subject: string
  subjectCode: string
  academicPeriod: string
  revisionNumber: number
  revisionFingerprint: string
  generatedAt: string
  locale: string
  snapshot: PhpRecord
}

export type LogoSource = (source: "institution" | "faculty", facultyId: string | null) => Promise<{ bytes: Buffer; key: string } | null>

const PAPERS: Record<string, [number, number]> = { letter: [12240, 15840], a4: [11906, 16838], legal: [12240, 20160] }
const PAPER_NAMES: Record<string, string> = { a4: "A4", legal: "Legal" }
const COMPACT_FONT_SIZE = 9
const COMPACT_MARGIN_CM = 1.5
const BOX_BORDER = "0070C0"
const TABLE_BORDER = "333333"
const IDENTIFICATION_INPUT_KEYS = ["discapacidad_tiene", "discapacidad_tipo", "discapacidad_adaptacion", "formacion_experiencia"]
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

function phpTrim(value: string): string {
  return value.replace(PHP_TRIM, "")
}

function phpRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

function cmToTwip(centimeters: number): number {
  return phpRound((centimeters / 2.54) * 1440)
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && phpTrim(value) !== "" ? phpTrim(value) : fallback
}

function arrayList(value: unknown): PhpRecord[] {
  return isPhpArray(value) ? list(value).filter(isPhpArray).map(record) : []
}

function ltrimHash(value: unknown): string {
  return String(value ?? "").replace(/^#+/, "")
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined
}

function alignment(value: unknown): string {
  if (value === "center") return "center"
  if (value === "right") return "end"
  if (value === "justify") return "both"
  return "start"
}

class RenderContext {
  contentWidth = 9406

  constructor(
    readonly appearance: PhpRecord,
    readonly hasAppearance: boolean,
    readonly templateVariables: Record<string, string>,
    readonly emptyText: string,
    readonly emptyColor: string,
    readonly definition: TemplateDefinition,
  ) {}

  compact(pageWidth: number): RenderContext {
    const copy = new RenderContext(
      { ...this.appearance, body_font_size: COMPACT_FONT_SIZE, field_font_size: COMPACT_FONT_SIZE, margin_cm: COMPACT_MARGIN_CM },
      this.hasAppearance,
      this.templateVariables,
      this.emptyText,
      this.emptyColor,
      this.definition,
    )
    copy.contentWidth = pageWidth - 2 * cmToTwip(COMPACT_MARGIN_CM)
    return copy
  }

  color(key: string): string {
    return ltrimHash(this.appearance[key])
  }

  documentWriter(): TemplateDocumentWord {
    return new TemplateDocumentWord(
      this.hasAppearance ? String(this.appearance.body_alignment) : null,
      this.hasAppearance ? this.color("table_header_background") : null,
      this.hasAppearance ? this.color("table_header_color") : null,
      ltrimHash(this.appearance.table_border ?? TABLE_BORDER),
    )
  }

  writeDocument(target: WordContainer, document: PhpRecord | null): void {
    if (document === null) {
      if (this.emptyText !== "") target.addText(this.emptyText, { italic: true, color: this.emptyColor })
      return
    }
    this.documentWriter().append(target, document, this.contentWidth)
  }

  writeBoxed(target: WordContainer, document: PhpRecord | null): void {
    const table = target.addTable({ borderSize: 6, borderColor: BOX_BORDER, cellMargin: 100, width: this.contentWidth, unit: "dxa" })
    this.writeDocument(table.addRow().addCell(this.contentWidth), document)
  }
}

function hasTitle(container: PhpRecord): boolean {
  return phpTrim(stringOr(container.title, "")) !== ""
}

function writeValueText(context: RenderContext, section: WordSection, value: unknown): void {
  const shown = wordDisplay(value)
  if (shown === "") {
    if (context.emptyText !== "") section.addText(context.emptyText, { italic: true, color: context.emptyColor })
    return
  }
  for (const line of shown.split(/\r\n|\n|\r|\v|\f|\u0085|\u2028|\u2029/u)) {
    const trimmed = phpTrim(line)
    if (trimmed === "") continue
    const bullet = /^[-*•]\s+(.*)$/u.exec(trimmed)
    if (bullet !== null) {
      section.addText(bullet[1], {}, { numStyle: "silabo-bullets", numLevel: 0, spaceAfter: 60 })
      continue
    }
    section.addText(trimmed)
  }
}

function holdsSignature(node: unknown, definition: TemplateDefinition): boolean {
  if (!isRecord(node)) return false
  if (node.type === "variable") return String(definition.variables[String(record(node.attrs).id ?? "")]?.source ?? "").startsWith("signature.")
  return isPhpArray(node.content) && list(node.content).some((child) => holdsSignature(child, definition))
}

function keepSignatureTables(node: PhpRecord, definition: TemplateDefinition): PhpRecord {
  if (node.type === "table" && holdsSignature(node, definition)) return { ...node, keepTogether: true }
  if (!isPhpArray(node.content)) return node
  return { ...node, content: list(node.content).map((child) => (isRecord(child) ? keepSignatureTables(child, definition) : child)) }
}

function renderContainer(context: RenderContext, section: WordSection, container: PhpRecord, titled: boolean): void {
  const fields = arrayList(container.fields)
  const field = fields[0] ?? {}
  const label = stringOr(field.label, stringOr(container.title, "Campo"))
  if (titled && hasTitle(container)) {
    section.addText(label, { bold: true, size: numeric(context.appearance.field_font_size), color: context.color("text_color") }, { spaceBefore: 160, spaceAfter: 80, keepNext: true })
  }
  if (isPhpArray(container.document)) {
    context.documentWriter().append(section, resolveDocument(keepSignatureTables(record(container.document), context.definition), context.templateVariables, context.definition, fields), context.contentWidth)
    return
  }
  if (field.hidden === true) return
  writeValueText(context, section, field.value ?? null)
}

function renderDocuments(context: RenderContext, section: WordSection, snapshotSection: PhpRecord): void {
  const fields = arrayList(snapshotSection.fields)
  const historicalCard = fields.some((field) => field.type === "automatico" && record(field.config).source === "identification_card")
  for (const field of fields) {
    const config = record(field.config)
    if (historicalCard && field.type === "texto" && (config.inside === "identification_card" || IDENTIFICATION_INPUT_KEYS.includes(String(field.key ?? "")))) continue
    const label = stringOr(field.label, "")
    if (label !== "" && phpTrim(label).toLowerCase() !== phpTrim(stringOr(snapshotSection.title, "")).toLowerCase()) {
      section.addText(label, { bold: true, size: numeric(context.appearance.field_font_size), color: context.color("text_color") }, { spaceBefore: 160, spaceAfter: 80, keepNext: true })
    }
    const resolved = resolveDocument(keepSignatureTables(historicalDocument(field), context.definition), context.templateVariables, context.definition)
    const document = fieldDocumentIsEmpty(resolved, context.definition) ? null : resolved
    if (field.type === "texto" || field.type === "ficha") context.writeBoxed(section, document)
    else context.writeDocument(section, document)
  }
}

export function variablesOf(snapshot: PhpRecord): Record<string, string> {
  const variables = isRecord(snapshot.template_variables) ? snapshot.template_variables : {}
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]))
}

function sectionOrientation(snapshotSection: PhpRecord, fallback: string): string {
  if (snapshotSection.orientation === "portrait" || snapshotSection.orientation === "landscape") return snapshotSection.orientation
  for (const block of arrayList(snapshotSection.blocks)) {
    if (block.page_orientation === "portrait" || block.page_orientation === "landscape") return block.page_orientation
  }
  return fallback
}

function sectionCompact(snapshotSection: PhpRecord): boolean {
  return arrayList(snapshotSection.blocks).some((block) => block.compact === true)
}

function rendersDocuments(snapshotSection: PhpRecord): boolean {
  return isPhpArray(snapshotSection.fields) && list(snapshotSection.fields).length > 0 && !arrayList(snapshotSection.fields).some((field) => field.legacy === true)
}

function decodedLogo(embedded: unknown): Buffer | null {
  if (typeof embedded !== "string" || embedded === "" || !/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(embedded)) return null
  return Buffer.from(embedded, "base64")
}

export async function buildSyllabusWord(input: DocumentRenderInput, logoSource: LogoSource): Promise<WordDocument> {
  const snapshot = input.snapshot
  const definition = snapshotDefinition(snapshot)
  const document = definition.document
  const colors = record(document.colors)
  const appearance = documentAppearance(document)
  const context = new RenderContext(appearance, colors.table_header_background !== null && colors.table_header_background !== undefined, variablesOf(snapshot), String(document.empty_text ?? ""), ltrimHash(colors.empty_text), definition)
  const paper = String(document.paper)
  const pageWidth = (orientation: string) => {
    const [width, height] = PAPERS[paper] ?? PAPERS.letter
    return orientation === "landscape" ? height : width
  }
  const margin = cmToTwip(Number(appearance.margin_cm))
  context.contentWidth = pageWidth(String(appearance.orientation)) - 2 * margin
  const word = new WordDocument(
    {
      fontName: String(appearance.font_family),
      fontSize: Math.trunc(Number(appearance.body_font_size)),
      fontColor: context.color("text_color"),
      paragraph: { spaceAfter: phpRound(Number(document.paragraph_spacing_pt) * 20), lineHeight: Number(document.line_height), alignment: alignment(appearance.body_alignment) },
    },
    imageInfo,
  )
  const addSection = (orientation: string, sectionMargin: number) => {
    context.contentWidth = pageWidth(orientation) - 2 * sectionMargin
    return word.addSection({ paperSize: PAPER_NAMES[paper] ?? "Letter", orientation, margin: sectionMargin })
  }
  let currentOrientation = String(appearance.orientation)
  let section = addSection(currentOrientation, margin)
  let currentCompact = false
  let activeContext = context
  await addLogos(section, context, snapshot, record(document.header), logoSource)
  section.addText(
    String(record(document.title).text ?? ""),
    { bold: bool(appearance.title_bold), italic: bool(appearance.title_italic), size: numeric(appearance.title_font_size), color: context.color("accent_color") },
    { alignment: alignment(appearance.title_alignment), spaceBefore: 240, spaceAfter: 240 },
  )
  for (const block of arrayList(snapshot.sections)) {
    const desiredOrientation = sectionOrientation(block, String(appearance.orientation))
    const desiredCompact = sectionCompact(block)
    if (desiredOrientation !== currentOrientation || desiredCompact !== currentCompact) {
      const sectionMargin = desiredCompact ? cmToTwip(COMPACT_MARGIN_CM) : margin
      section = addSection(desiredOrientation, sectionMargin)
      currentOrientation = desiredOrientation
      currentCompact = desiredCompact
      activeContext = desiredCompact ? context.compact(pageWidth(desiredOrientation)) : context
    }
    section.addText(
      stringOr(block.title, "Bloque"),
      { bold: bool(appearance.section_bold), italic: bool(appearance.section_italic), size: numeric(appearance.section_font_size), color: context.color("text_color") },
      { alignment: alignment(appearance.section_alignment), spaceBefore: 240, spaceAfter: 120, keepNext: true },
    )
    if (rendersDocuments(block)) {
      renderDocuments(activeContext, section, block)
      continue
    }
    const containers = arrayList(block.blocks)
    for (const container of containers) renderContainer(activeContext, section, container, containers.length > 1 && hasTitle(container))
  }
  return word
}

async function addLogos(section: WordSection, context: RenderContext, snapshot: PhpRecord, header: PhpRecord, logoSource: LogoSource): Promise<void> {
  const facultyId = record(record(snapshot.academic_context).career).faculty_id
  const embedded = isRecord(snapshot.logos) ? snapshot.logos : null
  const images: { image: { bytes: Buffer; key: string } | null; height: number }[] = []
  for (const logo of arrayList(header.logos)) {
    const source = logo.source === "faculty" ? "faculty" : "institution"
    const bytes = decodedLogo(embedded?.[source] ?? null)
    const image = bytes !== null ? { bytes, key: bytes.toString("latin1") } : await logoSource(source, typeof facultyId === "string" ? facultyId : null)
    images.push({ image, height: Number(logo.height_pt) })
  }
  if (images.every((logo) => logo.image === null)) return
  const table = section.addTable({ width: 5000, unit: "pct" })
  const row = table.addRow()
  const leftWidth = phpRound(context.contentWidth * Number(header.left_share))
  const left = row.addCell(leftWidth, { valign: "center" })
  if (images[0]?.image) left.addImage(images[0].image.bytes, images[0].image.key, { height: images[0].height })
  const right = row.addCell(context.contentWidth - leftWidth, { valign: "center" })
  if (images[1]?.image) right.addImage(images[1].image.bytes, images[1].image.key, { height: images[1].height, alignment: "end" })
}
