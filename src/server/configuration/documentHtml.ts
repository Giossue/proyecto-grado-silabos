import { firstElement, parseHtmlDocument, type HtmlElement, type HtmlNode } from "./htmlTree"
import { isPhpArray, list, phpCount, phpIntCast, phpJsonDecode, phpString, phpToBool, phpTrim, record, type PhpRecord } from "./phpValues"

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
    for (const mark of list(given(node, "marks") ?? []).toReversed()) {
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

const INLINE_MARKS: Record<string, string> = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline" }

function elvis(value: string, fallback: string): string {
  return phpToBool(value) ? value : fallback
}

function attribute(element: HtmlElement, name: string): string {
  return element.attributes.get(name) ?? ""
}

function decodedArray(text: string): unknown {
  const decoded = phpJsonDecode(text)
  return isPhpArray(decoded) ? decoded : []
}

function cssOf(element: HtmlElement): Record<string, string> {
  const style = new Map<string, string>()
  for (const declaration of attribute(element, "style").split(";")) {
    const separator = declaration.indexOf(":")
    if (separator === -1) continue
    const name = phpTrim(declaration.slice(0, separator))
    if (name === "") continue
    style.set(name.replace(/[A-Z]/g, (letter) => letter.toLowerCase()), phpTrim(declaration.slice(separator + 1)))
  }
  return Object.fromEntries(style)
}

function directiveAttrs(element: HtmlElement): PhpRecord {
  const attrs: PhpRecord = {}
  for (const directive of ["repeat", "when"]) {
    const raw = element.attributes.get(`data-${directive}`)
    if (raw === undefined) continue
    const decoded = phpJsonDecode(raw)
    attrs[directive] = isPhpArray(decoded) ? decoded : raw
  }
  if (element.attributes.has("data-band")) attrs.band = attribute(element, "data-band")
  return attrs
}

function withDirectives(node: PhpRecord, element: HtmlElement): PhpRecord {
  const attrs = directiveAttrs(element)
  return Object.keys(attrs).length === 0 ? node : { ...node, attrs: { ...record(node.attrs), ...attrs } }
}

function withMarks(node: PhpRecord, marks: PhpRecord[]): PhpRecord {
  return marks.length === 0 ? node : { ...node, marks: [...marks] }
}

function inlineNodes(node: HtmlNode, marks: PhpRecord[]): PhpRecord[] {
  if (node.kind === "text") return node.text === "" ? [] : [withMarks({ type: "text", text: node.text }, marks)]
  if (node.kind !== "element") return []
  const tag = node.name
  if (tag === "br") return [{ type: "hardBreak" }]
  if (tag === "span" && node.attributes.has("data-slot")) return [withMarks({ type: "slot", attrs: decodedArray(attribute(node, "data-slot")) }, marks)]
  if (tag === "span" && node.attributes.has("data-response")) {
    return [withMarks({ type: "response", attrs: decodedArray(attribute(node, "data-response")) }, marks)]
  }
  if (tag === "span" && node.attributes.has("data-variable")) {
    const attrs: PhpRecord = { id: attribute(node, "data-variable") }
    if (node.attributes.has("data-list")) attrs.listStyle = attribute(node, "data-list")
    return [withMarks({ type: "variable", attrs }, marks)]
  }
  let inner = marks
  if (INLINE_MARKS[tag] !== undefined) inner = [...marks, { type: INLINE_MARKS[tag] }]
  else if (tag === "span") {
    const style = cssOf(node)
    const attrs = Object.fromEntries(
      [
        ["color", style.color],
        ["fontFamily", style["font-family"]],
      ].filter(([, value]) => phpToBool(value)),
    )
    if (Object.keys(attrs).length > 0) inner = [...marks, { type: "textStyle", attrs }]
  }
  return node.children.flatMap((child) => inlineNodes(child, inner))
}

function flushInline(blocks: PhpRecord[], buffer: PhpRecord[]): PhpRecord[] {
  const last = buffer[buffer.length - 1]
  let pending = buffer
  if (last && last.type === "text" && typeof last.text === "string") {
    const text = last.text.replace(/\n+$/, "")
    pending = text === "" ? buffer.slice(0, -1) : [...buffer.slice(0, -1), { ...last, text }]
  }
  if (pending.length > 0) blocks.push({ type: "paragraph", content: pending })
  return []
}

function cellAttrs(cell: HtmlElement): PhpRecord {
  const style = cssOf(cell)
  const attrs: PhpRecord = {
    colspan: cell.attributes.has("colspan") ? phpIntCast(attribute(cell, "colspan")) : 1,
    rowspan: cell.attributes.has("rowspan") ? phpIntCast(attribute(cell, "rowspan")) : 1,
  }
  if (cell.attributes.has("data-width")) attrs.colwidth = attribute(cell, "data-width").split(",").map(phpIntCast)
  if (cell.attributes.has("data-border")) attrs.borderStyle = attribute(cell, "data-border")
  const map: [string, string][] = [
    ["background", "backgroundColor"],
    ["color", "textColor"],
    ["text-align", "textAlign"],
  ]
  for (const [css, name] of map) {
    if (style[css] !== undefined) attrs[name] = style[css]
  }
  if (style["font-weight"] !== undefined) attrs.bold = style["font-weight"] === "bold"
  if (style["font-style"] !== undefined) attrs.italic = style["font-style"] === "italic"
  return { ...attrs, ...directiveAttrs(cell) }
}

function rowNode(row: HtmlElement): PhpRecord {
  const cells: PhpRecord[] = []
  for (const cell of row.children) {
    if (cell.kind !== "element" || (cell.name !== "td" && cell.name !== "th")) continue
    const content = blocksOf(cell, false)
    cells.push({ type: cell.name === "th" ? "tableHeader" : "tableCell", attrs: cellAttrs(cell), content: content.length === 0 ? [{ type: "paragraph" }] : content })
  }
  return { type: "tableRow", content: cells }
}

function tableNode(table: HtmlElement): PhpRecord {
  const rows: PhpRecord[] = []
  const collect = (parent: HtmlElement): void => {
    for (const child of parent.children) {
      if (child.kind !== "element") continue
      if (child.name === "tr") rows.push(withDirectives(rowNode(child), child))
      else if (child.name === "tbody" || child.name === "thead" || child.name === "tfoot") collect(child)
    }
  }
  collect(table)
  return { type: "table", content: rows }
}

function listNode(element: HtmlElement): PhpRecord {
  const items: PhpRecord[] = []
  for (const item of element.children) {
    if (item.kind !== "element" || item.name !== "li") continue
    const content = blocksOf(item, false)
    items.push({ type: "listItem", content: content.length === 0 ? [{ type: "paragraph" }] : content })
  }
  return { type: element.name === "ol" ? "orderedList" : "bulletList", content: items }
}

function paragraphNode(element: HtmlElement): PhpRecord {
  const content = inlineNodes(element, [])
  const paragraph: PhpRecord = { type: "paragraph" }
  if (content.length > 0) paragraph.content = content
  const align = cssOf(element)["text-align"]
  const attrs = { ...(align !== undefined ? { textAlign: align } : {}), ...directiveAttrs(element) }
  if (Object.keys(attrs).length > 0) paragraph.attrs = attrs
  return paragraph
}

function blocksOf(parent: HtmlElement, layout: boolean): PhpRecord[] {
  const blocks: PhpRecord[] = []
  let buffer: PhpRecord[] = []
  for (const child of parent.children) {
    if (child.kind === "element") {
      const tag = child.name
      if (tag === "p") {
        buffer = flushInline(blocks, buffer)
        blocks.push(paragraphNode(child))
      } else if (tag === "section" && layout) {
        buffer = flushInline(blocks, buffer)
        const attrs = directiveAttrs(child)
        blocks.push({ type: "group", content: blocksOf(child, true), ...(Object.keys(attrs).length > 0 ? { attrs } : {}) })
      } else if (tag === "ul" || tag === "ol") {
        buffer = flushInline(blocks, buffer)
        blocks.push(withDirectives(listNode(child), child))
      } else if (tag === "table") {
        buffer = flushInline(blocks, buffer)
        blocks.push(withDirectives(tableNode(child), child))
      } else if (tag === "div" && child.attributes.has("data-block")) {
        buffer = flushInline(blocks, buffer)
        const props = phpJsonDecode(elvis(attribute(child, "data-props"), "{}"))
        const value = phpJsonDecode(elvis(attribute(child, "data-value"), "{}"))
        blocks.push({ type: "documentBlock", attrs: { kind: attribute(child, "data-block"), props: isPhpArray(props) ? props : [], value: isPhpArray(value) ? value : [] } })
      } else {
        buffer = [...buffer, ...inlineNodes(child, [])]
      }
    } else if (child.kind === "text") {
      const text = buffer.length === 0 ? child.text.replace(/^\n+/, "") : child.text
      if ((phpTrim(text) !== "" || buffer.length > 0) && text !== "") buffer = [...buffer, { type: "text", text }]
    }
  }
  flushInline(blocks, buffer)
  return blocks
}

export function documentFromHtml(html: unknown, layout = false): PhpRecord {
  const source = Array.isArray(html) ? html.map(implodedPart).join("\n") : phpString(html)
  const body = firstElement(parseHtmlDocument(`<?xml encoding="UTF-8"><body>${source}</body>`), "body")
  const content = body === null ? [] : blocksOf(body, layout)
  return { type: "doc", content: content.length === 0 ? [{ type: "paragraph" }] : content }
}

function implodedPart(value: unknown): string {
  if (isPhpArray(value)) throw new Error("Array to string conversion")
  return phpString(value)
}
