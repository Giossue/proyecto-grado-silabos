import { isPhpArray, list, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { isDocument, plainText, resolveDocument } from "../configuration/templateRuntime"
import { historicalDocument, NeedsLaravel, snapshotDefinition } from "../syllabus/snapshotDocuments"
import { variablesOf, type DocumentRenderInput } from "./docx/syllabusWordDocument"

const WRAP_WIDTH = 92
const LINES_PER_PAGE = 52
const WINDOWS_1252 = new Map([...new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 128 }, (_, index) => index + 128))].map((character, index) => [character, index + 128]))

export function phpWordwrap(text: string, width: number): string {
  const bytes = Buffer.from(text, "utf8")
  const wrapped = Buffer.from(bytes)
  let lastStart = 0
  let lastSpace = 0
  for (let current = 0; current < bytes.length; current += 1) {
    if (bytes[current] === 0x0a) {
      lastStart = lastSpace = current + 1
    } else if (bytes[current] === 0x20) {
      if (current - lastStart >= width) {
        wrapped[current] = 0x0a
        lastStart = current + 1
      }
      lastSpace = current
    } else if (current - lastStart >= width && lastStart !== lastSpace) {
      wrapped[lastSpace] = 0x0a
      lastStart = lastSpace + 1
    }
  }
  return wrapped.toString("utf8")
}

function windows1252(value: string): string {
  let encoded = ""
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    encoded += code < 0x80 ? character : String.fromCharCode(WINDOWS_1252.get(character) ?? 0x3f)
  }
  return encoded
}

function pdfText(value: string): string {
  return windows1252(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[\\()]/g, (character) => `\\${character}`)
}

export function plainTextPdf(lines: string[]): Buffer {
  const wrapped = lines.flatMap((line) => (line === "" ? [""] : phpWordwrap(line, WRAP_WIDTH).split("\n")))
  const source = wrapped.length === 0 ? [""] : wrapped
  const pages: string[][] = []
  for (let index = 0; index < source.length; index += LINES_PER_PAGE) pages.push(source.slice(index, index + LINES_PER_PAGE))
  const fontObject = 3 + pages.length * 2
  const objects = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] >>`],
  ])
  pages.forEach((pageLines, index) => {
    const pageObject = 3 + index * 2
    const stream = `BT\n/F1 10 Tf\n50 790 Td\n14 TL\n${pageLines.map((line) => `(${pdfText(line)}) Tj\nT*\n`).join("")}ET`
    objects.set(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${pageObject + 1} 0 R >>`)
    objects.set(pageObject + 1, `<< /Length ${stream.length}>>\nstream\n${stream}\nendstream`)
  })
  objects.set(fontObject, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"
  const offsets: number[] = [0]
  for (const number of [...objects.keys()].sort((left, right) => left - right)) {
    offsets[number] = pdf.length
    pdf += `${number} 0 obj\n${objects.get(number)}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n`
  for (let number = 1; number <= objects.size; number += 1) pdf += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

function arrayList(value: unknown): PhpRecord[] {
  return isPhpArray(value) ? list(value).filter(isPhpArray).map(record) : []
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && phpTrim(value) !== "" ? phpTrim(value) : fallback
}

function scalarText(value: unknown): string {
  if (typeof value === "boolean") return value ? "1" : ""
  if (typeof value === "number" && !Number.isInteger(value) && /e/i.test(String(value))) throw new NeedsLaravel()
  if (typeof value === "number" && Math.abs(value) >= 1e15) throw new NeedsLaravel()
  return String(value)
}

function display(value: unknown, emptyText: string, definition: ReturnType<typeof snapshotDefinition>): string {
  if (value === null || value === undefined || value === "") return emptyText
  if (isDocument(value)) return plainText(value, definition)
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (typeof value === "string" || typeof value === "number") return phpTrim(scalarText(value))
  if (!isPhpArray(value)) return "Contenido estructurado"
  return Object.entries(value)
    .map(([key, item]) => {
      if (isPhpArray(item)) throw new NeedsLaravel()
      const shown = item === null || item === undefined ? "—" : scalarText(item)
      return /^(0|-?[1-9]\d*)$/.test(key) ? shown : `${key.replace(/_/g, " ")}: ${shown}`
    })
    .join(" · ")
}

function textNodes(node: PhpRecord): string[] {
  const own = node.type === "text" ? [typeof node.text === "string" ? node.text : ""] : []
  return [...own, ...arrayList(node.content).flatMap(textNodes)]
}

function paragraphs(node: PhpRecord): PhpRecord[] {
  return [...(node.type === "paragraph" ? [node] : []), ...arrayList(node.content).flatMap(paragraphs)]
}

export function syllabusLines(input: DocumentRenderInput): string[] {
  const definition = snapshotDefinition(input.snapshot)
  const document = definition.document
  const emptyText = String(document.empty_text ?? "")
  const variables = variablesOf(input.snapshot)
  const lines = [String(record(document.title).text ?? ""), `${input.subject} (${input.subjectCode})`, `Periodo: ${input.academicPeriod}`, ""]
  for (const section of arrayList(input.snapshot.sections)) {
    lines.push(stringOr(section.title, "Sección"))
    for (const field of arrayList(section.fields)) {
      lines.push(`${stringOr(field.label, "")}: ${plainText(resolveDocument(historicalDocument(field), variables, definition), definition)}`)
    }
    for (const block of arrayList(section.blocks)) {
      lines.push(`  ${stringOr(block.title, "Bloque")}`)
      if (isPhpArray(block.document)) {
        if (arrayList(block.fields).length > 0) throw new NeedsLaravel()
        for (const paragraph of paragraphs(resolveDocument(record(block.document), variables, definition))) lines.push(textNodes(paragraph).join(""))
        continue
      }
      for (const field of arrayList(block.fields)) {
        lines.push(`    ${stringOr(field.label, "Campo")}: ${field.hidden === true ? "" : display(field.value ?? null, emptyText, definition)}`)
      }
    }
    lines.push("")
  }
  return lines
}
