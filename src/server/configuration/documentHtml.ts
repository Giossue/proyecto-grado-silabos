import { isPhpArray, list, phpCount, phpString, phpToBool, record, type PhpRecord } from "./phpValues"

function escape(text: string, quotes: boolean): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return quotes ? escaped.replace(/"/g, "&quot;").replace(/'/g, "&apos;") : escaped
}

function jsonText(value: unknown, slashes: boolean): string {
  const json = JSON.stringify(emptyAsList(value)).replace(/[\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16)}`)
  return slashes ? json.replace(/\//g, "\\/") : json
}

function emptyAsList(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(emptyAsList)
  if (value !== null && typeof value === "object" && !(value instanceof EmptyObject)) {
    const entries = Object.entries(value)
    return entries.length === 0 ? [] : Object.fromEntries(entries.map(([key, item]) => [key, emptyAsList(item)]))
  }
  return value
}

class EmptyObject {
  toJSON(): Record<string, never> {
    return {}
  }
}

function given(value: unknown, key: string): unknown {
  const found = record(value)[key]
  return found === undefined ? null : found
}

function empty(value: unknown): boolean {
  return !phpToBool(value)
}

function directives(attrs: unknown): string {
  let html = ""
  for (const directive of ["repeat", "when"]) {
    if (given(attrs, directive) !== null) html += ` data-${directive}='${escape(jsonText(given(attrs, directive), false), false)}'`
  }
  if (given(attrs, "band") !== null) html += ` data-band="${phpString(given(attrs, "band"))}"`
  return html
}

function blockElement(node: PhpRecord): string {
  const attrs = isPhpArray(node.attrs) ? node.attrs : []
  const encode = (value: unknown) => escape(jsonText(value, true), true)
  const props = given(attrs, "props") ?? new EmptyObject()
  const value = given(attrs, "value") ?? new EmptyObject()
  return `<div data-block="${escape(phpString(given(attrs, "kind") ?? ""), true)}" data-props="${encode(props)}" data-value="${encode(value)}"></div>`
}

function textStyle(attrs: unknown, inner: string): string {
  const style: string[] = []
  if (given(attrs, "color") !== null) style.push(`color:${phpString(given(attrs, "color"))}`)
  if (given(attrs, "fontFamily") !== null) style.push(`font-family:${phpString(given(attrs, "fontFamily"))}`)
  return style.length === 0 ? inner : `<span style="${style.join(";")}">${inner}</span>`
}

function inline(nodes: unknown): string {
  let html = ""
  for (const raw of list(nodes)) {
    const node = record(raw)
    let inner = ""
    if (node.type === "text") inner = escape(phpString(node.text), true)
    else if (node.type === "hardBreak") inner = "<br>"
    else if (node.type === "variable") {
      const listStyle = given(node.attrs, "listStyle")
      inner = `<span data-variable="${escape(phpString(given(node.attrs, "id")), true)}"${listStyle !== null ? ` data-list="${phpString(listStyle)}"` : ""}></span>`
    } else if (node.type === "response") inner = `<span data-response="${escape(jsonText(given(node, "attrs") ?? [], false), true)}"></span>`
    else if (node.type === "slot") inner = `<span data-slot='${escape(jsonText(given(node, "attrs") ?? [], false), false)}'></span>`
    for (const mark of [...list(given(node, "marks") ?? [])].reverse()) {
      const type = given(mark, "type")
      if (type === "bold") inner = `<strong>${inner}</strong>`
      else if (type === "italic") inner = `<em>${inner}</em>`
      else if (type === "underline") inner = `<u>${inner}</u>`
      else if (type === "textStyle") inner = textStyle(given(mark, "attrs") ?? [], inner)
    }
    html += inner
  }
  return html
}

function paragraph(node: PhpRecord): string {
  const align = given(node.attrs, "textAlign")
  const style = align !== null && align !== "left" ? ` style="text-align:${phpString(align)}"` : ""
  return `<p${style}${directives(node.attrs)}>${inline(given(node, "content") ?? [])}</p>`
}

function simpleParagraph(first: unknown): boolean {
  return isPhpArray(first) && given(first, "type") === "paragraph" && (given(given(first, "attrs"), "textAlign") ?? "left") === "left"
}

function htmlList(node: PhpRecord): string[] {
  const tag = node.type === "orderedList" ? "ol" : "ul"
  const lines = [`<${tag}${directives(node.attrs)}>`]
  for (const item of list(node.content)) {
    const parts = list(given(item, "content") ?? [])
    const first = parts[0] ?? null
    const simple = simpleParagraph(first)
    const line = simple ? `<li>${inline(given(first, "content") ?? [])}` : "<li>"
    const nested = (simple ? parts.slice(1) : parts).flatMap((child) => block(record(child)))
    if (nested.length === 0) lines.push(`${line}</li>`)
    else lines.push(line, ...nested, "</li>")
  }
  lines.push(`</${tag}>`)
  return lines
}

function cell(raw: unknown): string[] {
  const node = record(raw)
  const tag = node.type === "tableHeader" ? "th" : "td"
  const attrs = given(node, "attrs") ?? []
  let open = `<${tag}`
  if (Number(given(attrs, "colspan") ?? 1) > 1) open += ` colspan="${phpString(given(attrs, "colspan"))}"`
  if (Number(given(attrs, "rowspan") ?? 1) > 1) open += ` rowspan="${phpString(given(attrs, "rowspan"))}"`
  if (!empty(given(attrs, "colwidth"))) open += ` data-width="${list(given(attrs, "colwidth")).map(phpString).join(",")}"`
  if (!empty(given(attrs, "borderStyle"))) open += ` data-border="${phpString(given(attrs, "borderStyle"))}"`
  const style: string[] = []
  if (!empty(given(attrs, "backgroundColor"))) style.push(`background:${phpString(given(attrs, "backgroundColor"))}`)
  if (!empty(given(attrs, "textColor"))) style.push(`color:${phpString(given(attrs, "textColor"))}`)
  if (!empty(given(attrs, "textAlign"))) style.push(`text-align:${phpString(given(attrs, "textAlign"))}`)
  if (given(attrs, "bold") !== null) style.push(`font-weight:${phpToBool(given(attrs, "bold")) ? "bold" : "normal"}`)
  if (given(attrs, "italic") !== null) style.push(`font-style:${phpToBool(given(attrs, "italic")) ? "italic" : "normal"}`)
  if (style.length > 0) open += ` style="${style.join(";")}"`
  open += `${directives(attrs)}>`
  const content = list(given(node, "content") ?? [])
  const first = content[0] ?? null
  if (content.length === 1 && simpleParagraph(first)) return [`${open}${inline(given(first, "content") ?? [])}</${tag}>`]
  return [open, ...content.flatMap((child) => block(record(child))), `</${tag}>`]
}

function table(node: PhpRecord): string[] {
  const lines = [`<table${directives(node.attrs)}>`]
  for (const row of list(node.content)) {
    const open = `<tr${directives(given(row, "attrs") ?? [])}>`
    const cells = list(given(row, "content") ?? []).map(cell)
    if (!cells.some((parts) => parts.length > 1)) {
      lines.push(`${open}${cells.map((parts) => parts[0]).join("")}</tr>`)
      continue
    }
    lines.push(open, ...cells.flat(), "</tr>")
  }
  lines.push("</table>")
  return lines
}

function group(node: PhpRecord): string[] {
  return [`<section${directives(node.attrs)}>`, ...list(given(node, "content") ?? []).flatMap((child) => block(record(child))), "</section>"]
}

function block(node: PhpRecord): string[] {
  if (node.type === "paragraph") return [paragraph(node)]
  if (node.type === "bulletList" || node.type === "orderedList") return htmlList(node)
  if (node.type === "table") return table(node)
  if (node.type === "documentBlock") return [blockElement(node)]
  if (node.type === "group") return group(node)
  return []
}

export function documentLines(document: unknown): string[] {
  return list(given(document, "content") ?? []).flatMap((node) => block(record(node)))
}

export function hasEntries(value: unknown): boolean {
  return phpCount(value) > 0
}
