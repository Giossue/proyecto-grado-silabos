import { isList, isPhpArray, isRecord, phpTrim, mbStrlen, type PhpRecord } from "./phpValues"
import { phpIsNumeric } from "../http/validation"
import { TemplateValidationError } from "./templateRuntime"

const PAPERS = ["letter", "a4", "legal"]
const FONTS = ["Arial", "Calibri", "Times New Roman", "Verdana", "Georgia"]
const ALIGNMENTS = ["left", "center", "right", "justify"]
const LOGOS = ["institution", "faculty"]
const KNOWN = [
  "paper",
  "orientation",
  "margin_cm",
  "font_family",
  "line_height",
  "paragraph_spacing_pt",
  "sizes",
  "colors",
  "title",
  "section_title",
  "body",
  "header",
  "footer",
  "metadata",
  "empty_text",
  "choices",
]

export function definitionError(message: string): never {
  throw new TemplateValidationError({ definition: [message] })
}

function isPhpList(value: unknown): boolean {
  return isList(value) || (isRecord(value) && Object.keys(value).every((key, index) => key === String(index)))
}

function object(raw: unknown, where: string, allowed: string[]): PhpRecord {
  if (!isPhpArray(raw) || (isList(raw) && raw.length > 0) || (isRecord(raw) && Object.keys(raw).length > 0 && isPhpList(raw))) {
    definitionError(`«${where}» debe ser un objeto.`)
  }
  const record = isRecord(raw) ? raw : {}
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) definitionError(`Clave desconocida en «${where}»: «${unknown.join("», «")}».`)
  return record
}

function given(record: PhpRecord, key: string, fallback: unknown): unknown {
  const value = record[key]
  return value === undefined || value === null ? fallback : value
}

function among(value: unknown, allowed: string[], where: string): string {
  if (typeof value !== "string" || !allowed.includes(value)) definitionError(`«${where}»: use ${allowed.join(", ")}.`)
  return value
}

function number(value: unknown, where: string, min: number, max: number): number {
  if (typeof value !== "number" || value < min || value > max) definitionError(`«${where}»: debe ser un número entre ${min} y ${max}.`)
  return value
}

function size(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 5 || value > 72) definitionError(`«${where}»: debe ser un tamaño entero entre 5 y 72.`)
  return value
}

function color(value: unknown, where: string, nullable = false): string | null {
  if (value === null && nullable) return null
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) definitionError(`«${where}»: debe ser un color #RRGGBB.`)
  return value.toUpperCase()
}

function boolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") definitionError(`«${where}»: debe ser true o false.`)
  return value
}

function text(value: unknown, where: string, max: number, trim = false): string {
  const raw = value ?? ""
  if (typeof raw !== "string" || mbStrlen(raw) > max) definitionError(`«${where}»: debe ser un texto de hasta ${max} caracteres.`)
  return trim ? phpTrim(raw) : raw
}

function list<T>(raw: unknown, where: string, item: (value: unknown, at: string) => T): T[] {
  if (!isPhpArray(raw) || !isPhpList(raw)) definitionError(`«${where}» debe ser una lista.`)
  const values = isList(raw) ? raw : Object.values(raw as PhpRecord)
  return values.map((value, index) => item(value, `${where}.${index}`))
}

function header(raw: unknown): PhpRecord {
  const values = object(raw ?? [], "document.header", ["logos", "left_share"])
  const logos: PhpRecord[] = []
  const rawLogos = values.logos
  const entries = isPhpArray(rawLogos) && isPhpList(rawLogos) ? (isList(rawLogos) ? rawLogos : Object.values(rawLogos)) : []
  entries.forEach((logo, index) => {
    const at = `document.header.logos.${index}`
    const source = isRecord(logo) ? logo.source : undefined
    if (!isRecord(logo) || typeof source !== "string" || !LOGOS.includes(source)) definitionError(`${at}.source: use «institution» o «faculty».`)
    logos.push({ source, height_pt: size(given(logo, "height_pt", 28), `${at}.height_pt`) })
  })
  if (logos.length > 2) definitionError("«document.header.logos» admite hasta dos logos: izquierda y derecha.")
  return { logos, left_share: number(given(values, "left_share", 0.5), "document.header.left_share", 0.1, 0.9) }
}

export function defineDocumentStyle(raw: unknown): PhpRecord {
  if (!isPhpArray(raw) || (isPhpList(raw) && Object.keys(raw).length > 0)) definitionError("«document» debe ser un objeto.")
  const values = isRecord(raw) ? raw : {}
  const unknown = Object.keys(values).filter((key) => !KNOWN.includes(key))
  if (unknown.length > 0) definitionError(`Clave desconocida en «document»: «${unknown.join("», «")}».`)
  const sizes = object(given(values, "sizes", []), "document.sizes", ["title", "section", "body"])
  const colors = object(given(values, "colors", []), "document.colors", ["text", "title", "table_header_background", "table_header_text", "table_border", "empty_text"])
  const title = object(given(values, "title", []), "document.title", ["text", "bold", "italic", "alignment"])
  const section = object(given(values, "section_title", []), "document.section_title", ["bold", "italic", "alignment"])
  const body = object(given(values, "body", []), "document.body", ["alignment"])
  const choices = object(given(values, "choices", []), "document.choices", ["margin_cm", "title", "section", "body"])
  return {
    paper: among(given(values, "paper", "letter"), PAPERS, "document.paper"),
    orientation: among(given(values, "orientation", "portrait"), ["portrait", "landscape"], "document.orientation"),
    margin_cm: number(given(values, "margin_cm", 2), "document.margin_cm", 0.5, 5),
    font_family: among(given(values, "font_family", "Arial"), FONTS, "document.font_family"),
    line_height: number(given(values, "line_height", 1.15), "document.line_height", 1, 3),
    paragraph_spacing_pt: number(given(values, "paragraph_spacing_pt", 6), "document.paragraph_spacing_pt", 0, 36),
    sizes: {
      title: size(given(sizes, "title", 14), "document.sizes.title"),
      section: size(given(sizes, "section", 11), "document.sizes.section"),
      body: size(given(sizes, "body", 11), "document.sizes.body"),
    },
    colors: {
      text: color(given(colors, "text", "#000000"), "document.colors.text"),
      title: color(given(colors, "title", "#000000"), "document.colors.title"),
      table_header_background: color(given(colors, "table_header_background", null), "document.colors.table_header_background", true),
      table_header_text: color(given(colors, "table_header_text", null), "document.colors.table_header_text", true),
      table_border: color(given(colors, "table_border", "#000000"), "document.colors.table_border"),
      empty_text: color(given(colors, "empty_text", "#595959"), "document.colors.empty_text"),
    },
    title: {
      text: text(given(title, "text", ""), "document.title.text", 180, true),
      bold: boolean(given(title, "bold", true), "document.title.bold"),
      italic: boolean(given(title, "italic", false), "document.title.italic"),
      alignment: among(given(title, "alignment", "center"), ALIGNMENTS, "document.title.alignment"),
    },
    section_title: {
      bold: boolean(given(section, "bold", true), "document.section_title.bold"),
      italic: boolean(given(section, "italic", false), "document.section_title.italic"),
      alignment: among(given(section, "alignment", "left"), ALIGNMENTS, "document.section_title.alignment"),
    },
    body: { alignment: among(given(body, "alignment", "left"), ALIGNMENTS, "document.body.alignment") },
    header: header(given(values, "header", null)),
    empty_text: text(given(values, "empty_text", ""), "document.empty_text", 120, true),
    choices: {
      margin_cm: list(given(choices, "margin_cm", []), "document.choices.margin_cm", (value, at) => number(value, at, 0.5, 5)),
      title: list(given(choices, "title", []), "document.choices.title", (value, at) => size(value, at)),
      section: list(given(choices, "section", []), "document.choices.section", (value, at) => size(value, at)),
      body: list(given(choices, "body", []), "document.choices.body", (value, at) => size(value, at)),
    },
  }
}

const LAYOUT_CHOICES: Record<string, string> = {
  margin_cm: "margin_cm",
  title_font_size: "title",
  section_font_size: "section",
  body_font_size: "body",
}

function phpFloat(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "string") {
    const match = /^[ \t\n\r\v\f]*([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?)/.exec(value)
    return match ? Number(match[1]) : 0
  }
  return 0
}

export function documentWithLayout(document: PhpRecord, layout: PhpRecord): PhpRecord {
  const choices = isRecord(document.choices) ? document.choices : {}
  const sizes = isRecord(document.sizes) ? document.sizes : {}
  const pick = (key: string, current: unknown): unknown => {
    if (!Object.prototype.hasOwnProperty.call(layout, key)) return current
    const value = layout[key]
    const allowedRaw = choices[LAYOUT_CHOICES[key]]
    const allowed = isPhpArray(allowedRaw) ? Object.values(allowedRaw).map(phpFloat) : []
    if (!phpIsNumeric(value as string | number) || (allowed.length > 0 && !allowed.includes(phpFloat(value)))) {
      definitionError(`layout.${key}: elija uno de los valores ofrecidos.`)
    }
    return key === "margin_cm" ? phpFloat(value) : Math.trunc(phpFloat(value))
  }
  return defineDocumentStyle({
    ...document,
    margin_cm: pick("margin_cm", document.margin_cm),
    sizes: {
      title: pick("title_font_size", sizes.title),
      section: pick("section_font_size", sizes.section),
      body: pick("body_font_size", sizes.body),
    },
  })
}

function legacyNumber(value: unknown, fallback: unknown, integer: boolean): unknown {
  if (!phpIsNumeric(value as never)) return fallback
  const parsed = Number(String(value).trim())
  return integer ? Math.trunc(parsed) : parsed
}

export function documentFromLegacyMapping(base: PhpRecord, mapping: PhpRecord | null): PhpRecord {
  const layout = isRecord(mapping?.layout) ? mapping.layout : {}
  const titleBlock = mapping?.title_block
  const title = isRecord(titleBlock) ? titleBlock.text : null
  const sizes = isRecord(base.sizes) ? base.sizes : {}
  const baseTitle = isRecord(base.title) ? base.title : {}
  const document: PhpRecord = {
    ...base,
    margin_cm: legacyNumber(layout.margin_cm, base.margin_cm, false),
    sizes: {
      title: legacyNumber(layout.title_font_size, sizes.title, true),
      section: legacyNumber(layout.section_font_size, sizes.section, true),
      body: legacyNumber(layout.body_font_size, sizes.body, true),
    },
    title: { ...baseTitle, text: typeof title === "string" && phpTrim(title) !== "" ? phpTrim(title) : baseTitle.text },
  }
  if (!isPhpArray(mapping?.appearance)) {
    document.colors = { ...(isRecord(base.colors) ? base.colors : {}), table_header_background: null, table_header_text: null }
    document.body = { alignment: "left" }
  }
  return defineDocumentStyle(document)
}
