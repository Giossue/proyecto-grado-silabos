import { mergeAttributes, Node, type Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import { TableCell, TableHeader } from "@tiptap/extension-table"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { DocumentBlockView } from "@/components/domain/syllabus/DocumentBlockView"
import { RESPONSE_NODE, RESPONSE_SETTING_DEFAULTS, responseAttrs, responseLabel } from "@/lib/responseKinds"

export const variableNode = (variable: { key: string; label: string }) => ({ type: "variable", attrs: { id: variable.key, label: variable.label } })

export const variableLabels = (editor: Editor): Record<string, string> =>
  (editor.extensionManager.extensions.find((item) => item.name === "variable")?.options as { labels?: Record<string, string> } | undefined)?.labels ?? {}

export const DocumentVariable = Node.create<{ labels: Record<string, string> }>({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  addOptions: () => ({ labels: {} }),
  addAttributes: () => ({ id: { default: "" }, label: { default: "" }, listStyle: { default: null } }),
  parseHTML: () => [{ tag: "span[data-variable]", getAttrs: (element) => ({ id: element.getAttribute("data-variable") }) }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-variable": node.attrs.id, class: "document-variable", contenteditable: "false" }),
      this.options.labels[String(node.attrs.id)] ?? "Dato del sistema",
    ]
  },
})

const RESPONSE_LOGIC = ["id", "showIf"]

const parseResponse = (element: HTMLElement): Record<string, unknown> | false => {
  try {
    const attrs = JSON.parse(element.getAttribute("data-response") ?? "") as Record<string, unknown>
    return {
      kind: attrs.kind ?? "",
      options: attrs.options ?? [],
      value: attrs.value ?? null,
      ...Object.fromEntries([...Object.keys(RESPONSE_SETTING_DEFAULTS), ...RESPONSE_LOGIC].map((name) => [name, attrs[name] ?? undefined])),
    }
  } catch {
    return false
  }
}

export const DocumentResponse = Node.create({
  name: RESPONSE_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    kind: { default: "", rendered: false },
    options: { default: () => [], rendered: false },
    value: { default: null, rendered: false },
    ...Object.fromEntries([...Object.keys(RESPONSE_SETTING_DEFAULTS), ...RESPONSE_LOGIC].map((name) => [name, { default: undefined, rendered: false }])),
  }),
  parseHTML: () => [{ tag: "span[data-response]", getAttrs: parseResponse }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-response": JSON.stringify(node.attrs), class: "document-variable document-response", contenteditable: "false" }),
      responseLabel(responseAttrs({ type: RESPONSE_NODE, attrs: node.attrs })),
    ]
  },
})

const cellAttributes = () => ({
  backgroundColor: { default: null, renderHTML: () => ({}) },
  textColor: { default: null, renderHTML: () => ({}) },
  textAlign: { default: null, renderHTML: () => ({}) },
  bold: { default: null, renderHTML: () => ({}) },
  italic: { default: null, renderHTML: () => ({}) },
  borderStyle: { default: null, renderHTML: () => ({}) },
})

const cellStyle = (attrs: Record<string, unknown>): string =>
  [
    typeof attrs.backgroundColor === "string" ? `background-color:${attrs.backgroundColor}` : "",
    typeof attrs.textColor === "string" ? `color:${attrs.textColor}` : "",
    typeof attrs.textAlign === "string" ? `text-align:${attrs.textAlign}` : "",
    attrs.bold === true ? "font-weight:bold" : attrs.bold === false ? "font-weight:normal" : "",
    attrs.italic === true ? "font-style:italic" : "",
    attrs.borderStyle === "none" ? "border:none" : attrs.borderStyle === "thick" ? "border-width:2px" : "",
  ]
    .filter(Boolean)
    .join(";")

export const DocumentTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() }
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["td", mergeAttributes(HTMLAttributes, { style: cellStyle(node.attrs) }), 0]
  },
})

export const DocumentTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() }
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["th", mergeAttributes(HTMLAttributes, { style: cellStyle(node.attrs) }), 0]
  },
})

export const DocumentBlock = Node.create<{ mode: "configure" | "fill" }>({
  name: "documentBlock",
  atom: true,
  selectable: true,
  draggable: false,
  addOptions: () => ({ mode: "fill" }),
  addAttributes: () => ({
    kind: { default: "" },
    props: { default: () => ({}) },
    value: { default: () => ({}) },
  }),
  parseHTML: () => [{ tag: "div[data-block]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-block": "" })],
  addNodeView: () => ReactNodeViewRenderer(DocumentBlockView),
})

export const DocumentWithBlocks = Document.extend({ content: "(block | documentBlock)+" })
