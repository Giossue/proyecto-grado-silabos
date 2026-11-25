import { createElement, Fragment, type CSSProperties, type ReactNode } from "react"
import { blockFilledText, expandBlock } from "@/lib/blocks/runtime"
import { RESPONSE_NODE, responseAttrs, responseLabel, responseLines } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"

const TAGS: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  table: "table",
  tableRow: "tr",
  tableCell: "td",
  tableHeader: "th",
}

export const isFreeTextDocument = (value: unknown): value is DocumentNode =>
  typeof value === "object" && value !== null && (value as DocumentNode).type === "doc"

export const freeTextPlain = (node: DocumentNode): string =>
  node.type === "documentBlock"
    ? blockFilledText(node)
    : node.type === RESPONSE_NODE
      ? responseLines(responseAttrs(node)).join(" ")
      : node.type === "text"
        ? (node.text ?? "")
        : node.type === "variable"
          ? String(node.attrs?.label || "Dato del sistema")
          : (node.content ?? []).map(freeTextPlain).join(" ")

export const freeTextLines = (node: DocumentNode): string => {
  if (node.type === "documentBlock") return blockFilledText(node)
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  if (node.type === RESPONSE_NODE) return responseLines(responseAttrs(node)).join("\n")
  const children = (node.content ?? []).map(freeTextLines)
  if (node.type === "paragraph") return children.join("")
  if (node.type === "tableRow") return children.join(" | ")
  if (node.type === "listItem") return `• ${children.join("\n")}`

  return children.join("\n")
}

const tableColumnWidths = (table: DocumentNode): number[] | null => {
  for (const row of table.content ?? []) {
    for (const cell of row.content ?? []) {
      const widths = cell.attrs?.colwidth
      const span = Number(cell.attrs?.colspan ?? 1)
      if (Array.isArray(widths) && widths.length === span && span > 1 && widths.every((width) => typeof width === "number" && width > 0)) {
        return widths as number[]
      }
    }
  }

  return null
}

export type RenderOptions = {
  variable?: (id: string) => ReactNode | undefined
  node?: (node: DocumentNode, options: RenderOptions) => ReactNode | undefined
}

const element = (tag: string, props: Record<string, unknown> | null, children: ReactNode[] = []): ReactNode => createElement(tag, props, ...children)

const fragment = (children: ReactNode[]): ReactNode => createElement(Fragment, null, ...children)

const styleOf = (style: Record<string, unknown>): CSSProperties | undefined => {
  const entries = Object.entries(style).filter(([, value]) => value !== undefined && value !== null && value !== "")

  return entries.length > 0 ? (Object.fromEntries(entries) as CSSProperties) : undefined
}

const renderBlock = (node: DocumentNode, options?: RenderOptions): ReactNode =>
  element(
    "div",
    { className: "document-block", "data-block-kind": String(node.attrs?.kind ?? "") },
    expandBlock(node).map((child) => renderFreeText(child, options)),
  )

const cellProps = (node: DocumentNode): Record<string, unknown> => ({
  colSpan: Number(node.attrs?.colspan ?? 1),
  rowSpan: Number(node.attrs?.rowspan ?? 1),
  style: styleOf({
    backgroundColor: node.attrs?.backgroundColor,
    color: node.attrs?.textColor,
    textAlign: node.attrs?.textAlign,
    fontWeight: node.attrs?.bold === true ? "bold" : node.attrs?.bold === false ? "normal" : undefined,
    fontStyle: node.attrs?.italic === true ? "italic" : undefined,
    borderStyle: node.attrs?.borderStyle === "none" ? "none" : undefined,
    borderWidth: node.attrs?.borderStyle === "thick" ? "2px" : undefined,
  }),
})

export const renderFreeText = (node: DocumentNode, options?: RenderOptions): ReactNode => {
  const custom = options?.node?.(node, options)
  if (custom !== undefined) return custom
  if (node.type === "documentBlock") return renderBlock(node, options)
  if (node.type === "text") {
    const marks = new Set((node.marks ?? []).map((mark) => mark.type))
    let content: ReactNode = node.text ?? ""
    if (marks.has("italic")) content = element("em", null, [content])
    if (marks.has("underline")) content = element("u", null, [content])
    if (marks.has("bold")) content = element("strong", null, [content])
    const style = (node.marks ?? []).find((mark) => mark.type === "textStyle")?.attrs
    if (style) content = element("span", { style: styleOf({ color: style.color, fontFamily: style.fontFamily }) }, [content])

    return content
  }
  if (node.type === "variable") {
    const replacement = options?.variable?.(String(node.attrs?.id ?? ""))
    if (replacement !== undefined) return replacement

    return element("span", { className: "document-variable" }, [String(node.attrs?.label || "Dato del sistema")])
  }
  if (node.type === "hardBreak") return element("br", null)
  if (node.type === RESPONSE_NODE) {
    const lines = responseLines(responseAttrs(node))
    if (lines.length === 0) return element("span", { className: "document-variable" }, [responseLabel(responseAttrs(node))])

    return fragment(lines.flatMap((line, index) => (index === 0 ? [line] : [element("br", null), line])))
  }
  const children = (node.content ?? []).map((child) => renderFreeText(child, options))
  if (node.type === "doc") return element("div", { className: "free-text-view" }, children)
  if (node.type === "table") {
    const widths = tableColumnWidths(node)
    if (widths === null) return element("table", { className: "free-text-table" }, [element("tbody", null, children)])
    const total = widths.reduce((sum, width) => sum + width, 0)

    return element("table", { className: "free-text-table", style: { tableLayout: "fixed" } }, [
      element("colgroup", null, widths.map((width) => element("col", { style: { width: `${(width / total) * 100}%` } }))),
      element("tbody", null, children),
    ])
  }
  const tag = TAGS[node.type] ?? "div"
  if (node.type === "paragraph" && children.length === 0) children.push(element("br", null))
  const props =
    node.type === "tableCell" || node.type === "tableHeader"
      ? cellProps(node)
      : node.type === "paragraph"
        ? { style: styleOf({ textAlign: node.attrs?.textAlign }) }
        : null

  return element(tag, props, children)
}
