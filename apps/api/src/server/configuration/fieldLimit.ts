import { openShape, writtenValue } from "./teacherText"
import { isPhpArray, list, mbStrlen, record, type PhpRecord } from "./phpValues"
import { responseVisible, type Answers } from "./responseConditions"
import { blank, isDocument, listTable, RESPONSE_NODE, responseAnswered, responsesEnabled, responseTemplate, type TemplateDefinition } from "./templateRuntime"

const EMPTY_DOCUMENT: PhpRecord = { type: "doc", content: [{ type: "paragraph" }] }

export function formatLimit(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

export function fieldLimitMessage(limit: number): string {
  return `Este campo admite hasta ${formatLimit(limit)} caracteres.`
}

export function fieldLimitExceeded(name: string, limit: number, count: number): string {
  return `«${name}» tiene ${formatLimit(count)} caracteres y admite hasta ${formatLimit(limit)}. Recorte el texto antes de enviar.`
}

function text(node: PhpRecord): number {
  if (node.type === "text") return typeof node.text === "string" ? mbStrlen(node.text) : 0
  if (node.type === "documentBlock" || node.type === RESPONSE_NODE) return 0
  return list(isPhpArray(node.content) ? node.content : []).reduce<number>((total, child) => total + (isPhpArray(child) ? text(record(child)) : 0), 0)
}

function written(template: PhpRecord, value: PhpRecord, answers: Answers): number {
  const type = template.type ?? null
  if (type === RESPONSE_NODE) {
    const attrs = isPhpArray(template.attrs) ? record(template.attrs) : {}
    const answer = isPhpArray(value.attrs) ? (record(value.attrs).value ?? null) : null
    if (value.type !== RESPONSE_NODE || attrs.kind !== "texto" || responseAnswered(attrs) || !responseVisible(attrs, answers) || typeof answer !== "string") return 0
    return mbStrlen(answer)
  }
  if (type === "documentBlock" || type === "tableHeader" || type !== (value.type ?? null)) return 0
  if (blank(template)) return text(value)
  const rows = isPhpArray(template.content) ? list(template.content) : []
  const repeats = type === "table" && listTable(template)
  return list(isPhpArray(value.content) ? value.content : []).reduce<number>((total, child, index) => {
    const source = rows[index] ?? (repeats ? rows[rows.length - 1] : null)
    return total + (isPhpArray(source) && isPhpArray(child) ? written(record(source), record(child), answers) : 0)
  }, 0)
}

export function fieldLimitCount(source: unknown, held: unknown, answers: Answers, definition: TemplateDefinition): number {
  const template = openShape(source)
  const value = writtenValue(source, held)
  if (!isDocument(value)) return 0
  if (!responsesEnabled(definition)) return written(EMPTY_DOCUMENT, record(value), answers)
  return written(responseTemplate(record(template)), record(value), answers)
}

