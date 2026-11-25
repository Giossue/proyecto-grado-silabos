import { unitFromText } from "../academic/structureImports"
import { isPhpArray, isScalar, list, phpString, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { isDocument } from "../configuration/templateRuntime"
import { phpIsNumeric } from "@silabos/shared/schemas/php"

const EMPTY_DOCUMENT: PhpRecord = { type: "doc", content: [{ type: "paragraph" }] }
const CARD_WIDTHS = [23.0, 10.5, 6.0, 4.5, 8.0, 4.0, 17.5, 13.5, 13.0]

type Cell = { text: string; span: number; rows: number; style: string; bold: boolean; small: boolean; center: boolean }

export function phpFloatString(value: number): string {
  if (Number.isNaN(value)) return "NAN"
  if (!Number.isFinite(value)) return value > 0 ? "INF" : "-INF"
  if (value === 0) return Object.is(value, -0) ? "-0" : "0"
  const rounded = Number(value.toPrecision(14))
  const exponent = Math.floor(Math.log10(Math.abs(rounded)))
  if (exponent < -4 || exponent >= 14) {
    const [mantissa, power] = rounded.toExponential(13).split("e")
    const trimmed = mantissa.replace(/\.?0+$/, "")
    return `${trimmed.includes(".") ? trimmed : `${trimmed}.0`}E${Number(power) < 0 ? "-" : "+"}${Math.abs(Number(power))}`
  }
  return String(rounded)
}

export function phpScalarString(value: string | number | boolean): string {
  if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : phpFloatString(value)
  return phpString(value)
}

function paragraph(text: string): PhpRecord {
  return text === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text }] }
}

export function documentFromText(text: string): PhpRecord {
  const lines = phpTrim(text) === "" ? [""] : phpTrim(text).split(/\r\n|\n|\r|\v|\f|\u0085|\u2028|\u2029/u)
  const paragraphs = lines.map((line) => (phpTrim(line) === "" ? { type: "paragraph" } : paragraph(line)))
  return { type: "doc", content: paragraphs.length === 0 ? [{ type: "paragraph" }] : paragraphs }
}

function scalarCell(value: unknown): string {
  return isScalar(value) ? phpTrim(phpScalarString(value)) : ""
}

export function fixedTableDocument(columns: unknown, rows: unknown, values: PhpRecord): PhpRecord {
  const cell = (text: string, type: string): PhpRecord => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(text)] })
  const columnList = list(columns).map(record)
  const header = { type: "tableRow", content: [cell("", "tableHeader"), ...columnList.map((column) => cell(phpString(column.label), "tableHeader"))] }
  const body = list(rows)
    .map(record)
    .map((row) => {
      const found = values[phpString(row.key)]
      const cells = isPhpArray(found) ? record(found) : {}
      return { type: "tableRow", content: [cell(phpString(row.label), "tableHeader"), ...columnList.map((column) => cell(scalarCell(cells[phpString(column.key)]), "tableCell"))] }
    })
  return { type: "doc", content: [{ type: "table", content: [header, ...body] }] }
}

export function wordDisplay(value: unknown): string {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (isScalar(value)) return phpTrim(phpScalarString(value))
  if (!isPhpArray(value)) return ""
  const parts = Object.values(record(value)).map((item) =>
    isScalar(item) || item === null || item === undefined ? (item === null || item === undefined ? "" : phpScalarString(item)) : JSON.stringify(item).replace(/\//g, "\\/"),
  )
  return parts.filter((part) => part !== "").join(", ")
}

function cardNumber(value: string): string {
  const trimmed = phpTrim(value)
  if (!phpIsNumeric(trimmed) || !trimmed.includes(".")) return trimmed
  return trimmed.replace(/0+$/, "").replace(/\.$/, "")
}

function cardCell(text: string, span: number, rows: number, style: string, bold: boolean, small: boolean, center: boolean): Cell {
  return { text, span, rows, style, bold, small, center }
}

function cardGrid(data: PhpRecord): Cell[][] {
  const v = (key: string): string => (isScalar(data[key]) ? phpScalarString(data[key] as string | number | boolean) : "")
  const unit = unitFromText(v("organization_unit"))
  const mark = (candidate: string): string => (unit === candidate ? "X" : "")
  const disability = v("disability")
  const label = (text: string, span = 1, rows = 1, shade = false) => cardCell(text, span, rows, shade ? "shade" : "plain", true, false, false)
  const value = (text: string, span = 1, rows = 1, shade = false) => cardCell(text, span, rows, shade ? "shade" : "plain", false, false, false)
  const small = (text: string, span = 1, rows = 1, shade = false) => cardCell(text, span, rows, shade ? "shade" : "plain", true, true, true)
  const number = (text: string, span = 1, shade = false) => cardCell(text, span, 1, shade ? "shade" : "plain", true, false, true)
  const note = (title: string, text: string, span: number) => cardCell(phpTrim(`${title} ${text}`), span, 1, "plain", false, true, false)
  return [
    [cardCell(`FACULTAD: ${v("faculty")}`, 9, 1, "blue", true, false, false)],
    [label("CARRERA:", 1, 1, true), value(v("career"), 4, 1, true), label("MODALIDAD DE ESTUDIO O APRENDIZAJE", 2, 1, true), value(v("modality"), 2, 1, true)],
    [label("CAMPUS UNIVERSITARIO:", 2), value(v("campus"), 7)],
    [label("ASIGNATURA", 2, 1, true), label("PERIODO ACADÉMICO", 4, 1, true), label("CICLO", 1, 1, true), label("PARALELO", 1, 1, true), label("JORNADA", 1, 1, true)],
    [value(v("subject"), 2), value(v("period"), 4), value(v("cycle")), value(v("parallel")), value(v("shift"))],
    [label("CÓDIGO:", 1, 1, true), value(v("code"), 1, 1, true), label("PRERREQUISITOS:", 3, 1, true), value(v("prerequisites"), 2, 1, true), label("CORREQUISITOS:", 1, 1, true), value(v("corequisites"), 1, 1, true)],
    [label("UNIDAD DE ORGANIZACIÓN CURRICULAR", 2, 3), value("Unidad Básica", 6), number(mark("basica"))],
    [value("Unidad Profesional", 6, 1, true), number(mark("profesional"), 1, true)],
    [value("Unidad de Titulación", 6), number(mark("integracion_curricular"))],
    [label("ESTUDIANTES CON DISCAPACIDAD", 2, 3), value("Sí", 1, 2), cardCell(disability === "si" ? "X" : "", 1, 2, "plain", true, false, true), note("Tipo de discapacidad:", v("disability_type"), 5)],
    [note("Breve descripción:", v("disability_description"), 5)],
    [value("No"), number(disability === "no" ? "X" : ""), value("", 5)],
    [label("COMPONENTES DE APRENDIZAJE EN EL PERÍODO ACADÉMICO", 2, 4), small("HORAS DEL PROFESOR", 3), small("HORAS DEL ESTUDIANTE", 3), small("TOTAL DE HORAS POR PERÍODO", 1, 2)],
    [small("HORAS DE DOCENCIA (ACD)", 3, 1, true), small("HORAS DE PRÁCTICAS DE APLICACIÓN O EXPERIMENTACIÓN (APE)", 2, 1, true), small("HORAS DE APRENDIZAJE AUTÓNOMAS (AA)", 1, 1, true)],
    [number(cardNumber(v("hours_ac")), 3), number(cardNumber(v("hours_pae")), 2), number(cardNumber(v("hours_aa"))), number(cardNumber(v("total_hours")))],
    [small("TOTAL, CRÉDITOS", 6, 1, true), number(cardNumber(v("credits")), 1, true)],
    [label("NOMBRE DEL DOCENTE", 2), value(v("teacher"), 5), small("CORREO INSTITUCIONAL"), value(v("email"))],
    [cardCell(`FORMACIÓN Y EXPERIENCIA ACADÉMICA – INVESTIGATIVA:\n${v("formation")}`, 9, 1, "plain", false, false, false)],
  ]
}

function phpRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

export function identificationCardDocument(data: PhpRecord): PhpRecord {
  const total = CARD_WIDTHS.reduce((sum, width) => sum + width, 0)
  const rows = cardGrid(data).map((cells, rowIndex) => ({
    type: "tableRow",
    attrs: { rowRole: "fixed" },
    content: cells.map((cell) => {
      const marks: PhpRecord[] = [{ type: "textStyle", attrs: { color: cell.style === "blue" ? "#FFFFFF" : "#000000" } }]
      if (cell.bold) marks.push({ type: "bold" })
      return {
        type: "tableCell",
        attrs: {
          colspan: cell.span,
          rowspan: cell.rows,
          colwidth: rowIndex === 0 ? CARD_WIDTHS.map((weight) => phpRound((625 * weight) / total)) : null,
          backgroundColor: cell.style === "blue" ? "#4F81BD" : cell.style === "shade" ? "#C3D4EA" : null,
        },
        content: cell.text.split("\n").map((line) => ({ type: "paragraph", attrs: { textAlign: cell.center ? "center" : "left" }, content: line === "" ? [] : [{ type: "text", text: line, marks }] })),
      }
    }),
  }))
  return { type: "doc", content: [{ type: "table", content: rows }] }
}

export function historicalFieldDocument(field: PhpRecord): PhpRecord {
  if (isPhpArray(field.document)) return record(field.document)
  const value = field.value ?? null
  if (isDocument(value)) return record(value)
  const config = isPhpArray(field.config) ? record(field.config) : {}
  if (field.type === "fijo" && isPhpArray(config.content)) return record(config.content)
  if (field.type === "automatico" && config.source === "identification_card" && isPhpArray(value)) return identificationCardDocument(record(value))
  if (field.type === "tabla") return fixedTableDocument(config.columns ?? [], config.rows ?? [], isPhpArray(value) ? record(value) : {})
  if (field.type === "unidades") {
    const found = isPhpArray(value) ? Object.values(record(value)).filter(isPhpArray) : []
    const units = found.length === 0 ? [{ nombre: "", resultado: "", semanas: Array.from({ length: 16 }, () => []) }] : found
    return { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "unidades", props: [], value: { units } } }] }
  }
  return value === null ? EMPTY_DOCUMENT : documentFromText(wordDisplay(value))
}
