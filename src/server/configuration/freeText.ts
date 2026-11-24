import { isPhpArray, isScalar, list, mbStrlen, phpString, phpTrim, record, type PhpRecord } from "./phpValues"
import { RESPONSE_NODE, responseAttrs, TemplateValidationError } from "./templateRuntime"

const MAX_NODES = 5000
const MAX_DEPTH = 12
const MAX_CHARACTERS = 50000
const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/u

const CHILDREN: Record<string, string[]> = {
  doc: ["paragraph", "bulletList", "orderedList", "table"],
  paragraph: ["text", "hardBreak", RESPONSE_NODE],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList"],
  table: ["tableRow"],
  tableRow: ["tableCell", "tableHeader"],
  tableCell: ["paragraph", "bulletList", "orderedList"],
  tableHeader: ["paragraph", "bulletList", "orderedList"],
}

export type FreeTextColumn = { key: string; label: string }

function fail(attribute: string, message: string): never {
  throw new TemplateValidationError({ [attribute]: [message] })
}

function isFreeTextDocument(value: unknown): value is PhpRecord {
  return isPhpArray(value) && record(value).type === "doc"
}

function span(value: unknown, attribute: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) fail(attribute, "Una celda del texto libre no es válida.")
  return value
}

type Counter = { nodes: number; characters: number }

function normalizeNode(raw: PhpRecord, parent: string | null, depth: number, counter: Counter, attribute: string): PhpRecord {
  const type = raw.type
  const allowed = parent === null ? ["doc"] : CHILDREN[parent]
  if (typeof type !== "string" || !allowed.includes(type)) fail(attribute, "El texto libre contiene un elemento no permitido.")
  if (++counter.nodes > MAX_NODES || depth > MAX_DEPTH) fail(attribute, "El texto libre es demasiado extenso o anidado.")
  if (type === "text") {
    const text = raw.text
    if (typeof text !== "string" || text === "") fail(attribute, "El texto libre contiene un texto vacío.")
    counter.characters += mbStrlen(text)
    const marks: PhpRecord[] = []
    for (const mark of isPhpArray(raw.marks) ? list(raw.marks) : []) {
      const name = isPhpArray(mark) ? record(mark).type : null
      if (name === "bold" || name === "italic") marks.push({ type: name })
    }
    return marks.length === 0 ? { type: "text", text } : { type: "text", text, marks }
  }
  if (type === "hardBreak") return { type: "hardBreak" }
  if (type === RESPONSE_NODE) {
    try {
      return { type, attrs: responseAttrs(isPhpArray(raw.attrs) ? raw.attrs : []) }
    } catch (error) {
      if (error instanceof TemplateValidationError) fail(attribute, Object.values(error.errors).flat()[0] ?? "")
      throw error
    }
  }
  const node: PhpRecord = { type }
  if (type === "tableCell" || type === "tableHeader") {
    const attrs = isPhpArray(raw.attrs) ? record(raw.attrs) : {}
    node.attrs = { colspan: span(attrs.colspan ?? 1, attribute), rowspan: span(attrs.rowspan ?? 1, attribute) }
  }
  const content: PhpRecord[] = []
  for (const child of isPhpArray(raw.content) ? list(raw.content) : []) {
    if (!isPhpArray(child)) fail(attribute, "El texto libre contiene un elemento no permitido.")
    content.push(normalizeNode(record(child), type, depth + 1, counter, attribute))
  }
  if (content.length === 0 && type !== "paragraph") {
    if (type === "doc") return { type: "doc", content: [{ type: "paragraph" }] }
    fail(attribute, "El texto libre contiene una lista o tabla vacía.")
  }
  if (content.length > 0) node.content = content
  return node
}

export function freeTextNormalize(value: unknown, attribute = "value"): PhpRecord {
  if (!isFreeTextDocument(value)) fail(attribute, "El texto libre no tiene un formato válido.")
  const counter: Counter = { nodes: 0, characters: 0 }
  const document = normalizeNode(value, null, 0, counter, attribute)
  if (counter.characters > MAX_CHARACTERS) fail(attribute, "El texto libre supera los 50 000 caracteres.")
  return document
}

export function freeTextFromText(text: string): PhpRecord {
  const paragraphs = phpTrim(text)
    .split(LINE_BREAK)
    .map((line) => (phpTrim(line) === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text: line }] }))
  return { type: "doc", content: paragraphs.length === 0 ? [{ type: "paragraph" }] : paragraphs }
}

function paragraph(text: string): PhpRecord {
  return text === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text }] }
}

function cellText(value: unknown): string {
  return isScalar(value) ? phpTrim(phpString(value)) : ""
}

function cellOf(row: unknown, key: string): unknown {
  if (Array.isArray(row)) return /^(0|[1-9]\d*)$/.test(key) ? row[Number(key)] : undefined
  return isPhpArray(row) ? record(row)[key] : undefined
}

export function freeTextFromRows(columns: FreeTextColumn[], rows: unknown[], numbered = false): PhpRecord {
  const kept = rows.filter((row) => columns.some((column) => cellText(cellOf(row, column.key)) !== ""))
  if (kept.length === 0) return { type: "doc", content: [{ type: "paragraph" }] }
  if (columns.length === 1) {
    return {
      type: "doc",
      content: [
        {
          type: numbered ? "orderedList" : "bulletList",
          content: kept.map((row) => ({ type: "listItem", content: [paragraph(cellText(cellOf(row, columns[0].key)))] })),
        },
      ],
    }
  }
  const tableRow = (cells: string[], type: string): PhpRecord => ({
    type: "tableRow",
    content: cells.map((text) => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(text)] })),
  })
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          tableRow(
            columns.map((column) => column.label),
            "tableHeader",
          ),
          ...kept.map((row) =>
            tableRow(
              columns.map((column) => cellText(cellOf(row, column.key))),
              "tableCell",
            ),
          ),
        ],
      },
    ],
  }
}
