import { strLimit } from "../ai/php"
import { freeTextFromRows, freeTextFromText } from "../configuration/freeText"
import { isList, isPhpArray, list, phpIntCast, phpTrim, record, type PhpRecord } from "../configuration/phpValues"
import { blank, listTable, plainText, responsesEnabled, responseTemplate, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"

export type FichaTable = { columns: string[]; rows: string[][] }

export type FichaValue = string | string[] | FichaTable

export type FichaSchema = { key: string; label: string; columns: string[]; table: PhpRecord | null }

export type FichaSchemaField = { key: string; label: string; content: unknown }

export type CoverageField = { key: string; label: string; columns: string[] }

const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/u
const MAX_COLUMNS = 12
const MAX_ROWSPAN = 6

function fail(message: string): never {
  throw new TemplateValidationError({ file: [message] })
}

function nodeType(node: unknown): string {
  const type = isPhpArray(node) ? record(node).type : undefined
  return typeof type === "string" ? type : ""
}

function nodes(value: unknown): unknown[] {
  return isPhpArray(value) ? list(value) : []
}

function spanOf(value: unknown, limit: number): number {
  return Math.min(limit, Math.max(1, phpIntCast(value)))
}

export function displayName(label: string, sectionTitle: string): string {
  const trimmed = phpTrim(label)
  return trimmed !== "" ? trimmed : phpTrim(sectionTitle)
}

function firstTable(document: unknown): PhpRecord | null {
  if (nodeType(document) === "table") return record(document)
  for (const child of nodes(record(document).content)) {
    const table = firstTable(child)
    if (table !== null) return table
  }
  return null
}

function tableColumns(document: unknown, definition: TemplateDefinition): string[] {
  if (nodeType(document) !== "table") {
    for (const node of nodes(record(document).content)) {
      const columns = tableColumns(node, definition)
      if (columns.length > 0) return columns
    }
    return []
  }
  const grid = new Map<number, Map<number, string>>()
  for (const [rowIndex, row] of nodes(record(document).content).entries()) {
    const cells = nodes(record(row).content)
    if (!cells.some((cell) => nodeType(cell) === "tableHeader")) break
    let column = 0
    for (const cell of cells) {
      while (grid.get(rowIndex)?.has(column)) column++
      const attrs = record(record(cell).attrs)
      const text = phpTrim(plainText({ type: "doc", content: record(cell).content ?? [] }, definition))
      const colspan = spanOf(attrs.colspan ?? 1, MAX_COLUMNS)
      const rowspan = spanOf(attrs.rowspan ?? 1, MAX_ROWSPAN)
      for (let target = rowIndex; target < rowIndex + rowspan; target++) {
        const line = grid.get(target) ?? new Map<number, string>()
        for (let position = column; position < Math.min(MAX_COLUMNS, column + colspan); position++) line.set(position, text)
        grid.set(target, line)
      }
      column += colspan
    }
  }
  const labels = new Map<number, string[]>()
  for (const row of grid.values()) {
    for (const [column, text] of row) {
      const parts = labels.get(column) ?? []
      if (text !== "" && !parts.includes(text)) {
        parts.push(text)
        labels.set(column, parts)
      }
    }
  }
  return [...labels.entries()].sort(([left], [right]) => left - right).map(([, parts]) => parts.join(" / "))
}

export function fichaSchema(field: FichaSchemaField, sectionTitle: string, definition: TemplateDefinition): FichaSchema {
  return {
    key: field.key,
    label: displayName(field.label, sectionTitle),
    columns: tableColumns(field.content, definition),
    table: responsesEnabled(definition) ? firstTable(field.content) : null,
  }
}

export function fichaCoverage(
  entry: { values?: Record<string, unknown> },
  fields: CoverageField[] | { key: string; label: string }[],
): { coverage: { found: number; total: number }; missing: { key: string; label: string; reason: string }[] } {
  const values = entry.values ?? {}
  const keys = new Set(fields.map((field) => field.key))
  const found = Object.keys(values).filter((key) => keys.has(key)).length
  const missing = fields.filter((field) => !Object.prototype.hasOwnProperty.call(values, field.key)).map((field) => ({ key: field.key, label: field.label, reason: "no_encontrado" }))
  return { coverage: { found, total: fields.length }, missing }
}

function isTableValue(value: unknown): value is { rows: unknown } {
  return isPhpArray(value) && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "rows") && record(value).rows !== null && isPhpArray(record(value).rows)
}

export function fichaClean(value: unknown, columns: string[]): FichaValue | null {
  if (isTableValue(value)) {
    if (columns.length === 0) return null
    const rows: string[][] = []
    for (const row of list(value.rows).slice(0, 40)) {
      if (!isList(row) || row.length !== columns.length || row.some((cell) => typeof cell !== "string")) return null
      const cells = (row as string[]).map((cell) => strLimit(phpTrim(cell), 1500, ""))
      if (cells.some((cell) => cell !== "")) rows.push(cells)
    }
    return rows.length === 0 ? null : { columns, rows }
  }
  if (columns.length > 0) return null
  if (typeof value === "string") {
    const text = strLimit(phpTrim(value), 12000, "")
    return text === "" ? null : text
  }
  if (!isList(value) || value.some((item) => typeof item !== "string")) return null
  const items = (value as string[])
    .slice(0, 60)
    .map((item) => strLimit(phpTrim(item), 3000, ""))
    .filter((item) => item !== "")
  return items.length === 0 ? null : items
}

function isFilledTable(value: unknown): value is FichaTable {
  return isPhpArray(value) && !Array.isArray(value) && record(value).columns !== undefined && record(value).columns !== null && record(value).rows !== undefined && record(value).rows !== null
}

function headerRow(row: unknown): boolean {
  const cells = nodes(record(row).content)
  return cells.length > 0 && cells.every((cell) => nodeType(cell) === "tableHeader")
}

function fillTable(node: unknown, rows: PhpRecord[], state: { filled: boolean }, definition: TemplateDefinition): unknown {
  if (state.filled) return node
  if (nodeType(node) === "table") {
    const table = record(node)
    const content = nodes(table.content)
    const headers = content.filter(headerRow)
    let filledRows = rows
    if (responsesEnabled(definition)) {
      const body = content.slice(headers.length)
      if (!listTable(table) && rows.length !== body.length) fail("Conserve todas las filas de la tabla fija.")
      filledRows = rows.map((row, index) => {
        const source = index < body.length ? body[index] : body.length > 0 ? body[body.length - 1] : null
        const sourceCells = nodes(record(source).content)
        const cells = nodes(row.content)
        if (!isPhpArray(source) || cells.length !== sourceCells.length) fail("Las columnas no coinciden con la plantilla.")
        return {
          ...row,
          content: cells.map((cell, column) => {
            const original = record(sourceCells[column])
            if (!blank(original)) {
              const typed = phpTrim(plainText({ type: "doc", content: record(cell).content }, definition))
              const fixed = phpTrim(plainText({ type: "doc", content: original.content }, definition))
              if (typed !== fixed) fail("No cambie el texto fijo de la plantilla.")
              return original
            }
            return { ...original, content: record(cell).content }
          }),
        }
      })
    }
    state.filled = true
    return { ...table, content: [...headers, ...filledRows] }
  }
  if (isPhpArray(node) && record(node).content !== undefined && record(node).content !== null) {
    const current = record(node)
    const children = nodes(current.content)
    const next: unknown[] = []
    for (const child of children) next.push(fillTable(child, rows, state, definition))
    return { ...current, content: next }
  }
  return node
}

function bodyRows(block: PhpRecord): PhpRecord[] {
  const content = nodes(block.content).map((node) => record(node))
  if (nodeType(block) === "table") return content.slice(1)
  return content
    .filter((item) => nodeType(item) === "listItem")
    .map((item) => ({ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: item.content }] }))
}

export function fichaDocument(value: unknown, template: unknown, definition: TemplateDefinition): PhpRecord {
  if (isFilledTable(value)) {
    const columns = list(value.columns).map((label, index) => ({ key: String(index), label: String(label) }))
    const document = freeTextFromRows(columns, list(value.rows))
    if (template === null) return document
    const rows = bodyRows(record(nodes(document.content)[0]))
    return record(fillTable(template, rows, { filled: false }, definition))
  }
  if (template !== null && responsesEnabled(definition) && !blank(template)) {
    const document = responseTemplate(record(template))
    const content = nodes(document.content)
    for (const [index, node] of content.entries()) {
      if (nodeType(node) === "paragraph" && blank(node)) {
        const lines = (Array.isArray(value) ? value.join("\n") : String(value)).split(LINE_BREAK)
        const inline: PhpRecord[] = []
        lines.forEach((text, line) => {
          if (line > 0) inline.push({ type: "hardBreak" })
          if (text !== "") inline.push({ type: "text", text })
        })
        const next = [...content]
        next[index] = { ...record(node), content: inline }
        return { ...document, content: next }
      }
    }
    fail("Este campo debe completarse desde el proyecto de carrera porque su contenido no es una tabla o un espacio de texto.")
  }
  return Array.isArray(value)
    ? freeTextFromRows(
        [{ key: "t", label: "" }],
        value.map((item) => ({ t: item })),
      )
    : freeTextFromText(String(value))
}
