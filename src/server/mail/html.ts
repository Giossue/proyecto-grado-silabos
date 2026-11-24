export type HtmlText = { type: "text"; value: string; parent: HtmlElement | null }

export type HtmlElement = {
  type: "element"
  name: string
  attributes: Array<[string, string]>
  children: HtmlNode[]
  parent: HtmlElement | null
}

export type HtmlNode = HtmlElement | HtmlText

export type HtmlDocument = { doctype: string; root: HtmlElement }

const VOID_ELEMENTS = new Set(["area", "base", "basefont", "br", "col", "embed", "frame", "hr", "img", "input", "isindex", "link", "meta", "param", "source", "track", "wbr"])

const RAW_TEXT_ELEMENTS = new Set(["script", "style"])

const INLINE_ELEMENTS = new Set([
  "a", "abbr", "acronym", "applet", "b", "basefont", "bdo", "big", "br", "button", "cite", "code", "del", "dfn", "em", "embed", "font", "i",
  "iframe", "img", "input", "ins", "kbd", "label", "map", "object", "q", "s", "samp", "script", "select", "small", "span", "strike", "strong",
  "sub", "sup", "textarea", "tt", "u", "var",
])

const KNOWN_ELEMENTS = new Set([
  ...INLINE_ELEMENTS, ...VOID_ELEMENTS,
  "address", "blockquote", "body", "caption", "center", "colgroup", "dd", "dir", "div", "dl", "dt", "fieldset", "form", "frameset", "h1", "h2",
  "h3", "h4", "h5", "h6", "head", "html", "li", "legend", "menu", "noframes", "noscript", "ol", "optgroup", "option", "p", "pre", "style",
  "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "ul",
])

const URI_ATTRIBUTES = new Set(["href", "action", "src"])

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity.toLowerCase()] ?? match
    const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
    return String.fromCodePoint(code)
  })
}

function element(name: string, attributes: Array<[string, string]>, parent: HtmlElement | null): HtmlElement {
  return { type: "element", name, attributes, children: [], parent }
}

function parseAttributes(source: string): Array<[string, string]> {
  const attributes: Array<[string, string]> = []
  const pattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase()
    if (attributes.some(([existing]) => existing === name)) continue
    attributes.push([name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")])
  }
  return attributes
}

export function parseHtml(source: string): HtmlDocument {
  const documentNode = element("#document", [], null)
  let current = documentNode
  let doctype = ""
  let position = 0
  const appendText = (value: string) => {
    if (value === "") return
    const last = current.children[current.children.length - 1]
    if (last?.type === "text") last.value += value
    else current.children.push({ type: "text", value, parent: current })
  }
  while (position < source.length) {
    const next = source.indexOf("<", position)
    if (next === -1) {
      appendText(decodeEntities(source.slice(position)))
      break
    }
    appendText(decodeEntities(source.slice(position, next)))
    const doctypeMatch = /^<!doctype[^>]*>/i.exec(source.slice(next))
    if (doctypeMatch) {
      doctype = doctypeMatch[0]
      position = next + doctypeMatch[0].length
      continue
    }
    const endMatch = /^<\/([a-zA-Z][\w-]*)\s*>/.exec(source.slice(next))
    if (endMatch) {
      const name = endMatch[1].toLowerCase()
      let open: HtmlElement | null = current
      while (open && open.name !== name) open = open.parent
      if (open?.parent) current = open.parent
      position = next + endMatch[0].length
      continue
    }
    const startMatch = /^<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/.exec(source.slice(next))
    if (!startMatch) {
      appendText("<")
      position = next + 1
      continue
    }
    const name = startMatch[1].toLowerCase()
    const node = element(name, parseAttributes(startMatch[2]), current)
    current.children.push(node)
    position = next + startMatch[0].length
    if (VOID_ELEMENTS.has(name)) continue
    if (RAW_TEXT_ELEMENTS.has(name)) {
      const close = source.toLowerCase().indexOf(`</${name}`, position)
      const end = close === -1 ? source.length : close
      if (end > position) node.children.push({ type: "text", value: source.slice(position, end), parent: node })
      position = close === -1 ? end : source.indexOf(">", close) + 1
      continue
    }
    current = node
  }
  const root = documentNode.children.find((child): child is HtmlElement => child.type === "element" && child.name === "html")
  if (!root) throw new Error("The mail HTML has no <html> element.")
  root.parent = null
  return { doctype, root }
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeUri(value: string): string {
  const blanks = /^[ \t\n\r]*/.exec(value)?.[0] ?? ""
  const escaped = Array.from(Buffer.from(value.slice(blanks.length), "utf8"), (byte) => {
    const character = String.fromCharCode(byte)
    return byte < 0x80 && /[A-Za-z0-9\-_.!~*'()"#$%&+,/:;<=>?@[\\\]^`{|}]/.test(character) ? character : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
  }).join("")
  return (blanks + escaped).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function serializeAttribute(owner: HtmlElement, [name, value]: [string, string]): string {
  const uri = URI_ATTRIBUTES.has(name) || (name === "name" && owner.name === "a")
  const escaped = uri ? escapeUri(value) : value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return ` ${name}="${escaped}"`
}

const isText = (node: HtmlNode | undefined) => node?.type === "text"
const breaksLines = (node: HtmlElement) => KNOWN_ELEMENTS.has(node.name) && !INLINE_ELEMENTS.has(node.name)

function serializeNode(node: HtmlNode, parent: HtmlElement | null, output: string[]): void {
  if (node.type === "text") {
    output.push(parent && RAW_TEXT_ELEMENTS.has(parent.name) ? node.value : escapeText(node.value))
    return
  }
  output.push(`<${node.name}`, ...node.attributes.map((attribute) => serializeAttribute(node, attribute)))
  if (VOID_ELEMENTS.has(node.name)) {
    output.push(">")
    return
  }
  if (node.children.length === 0) {
    output.push(`></${node.name}>`)
    return
  }
  output.push(">")
  const formats = breaksLines(node) && node.children.length > 1 && !node.name.startsWith("p")
  if (formats && !isText(node.children[0])) output.push("\n")
  node.children.forEach((child, index) => {
    serializeNode(child, node, output)
    const next = node.children[index + 1]
    if (child.type === "element" && next && next.type !== "text" && breaksLines(child) && !node.name.startsWith("p")) output.push("\n")
  })
  if (formats && !isText(node.children[node.children.length - 1])) output.push("\n")
  output.push(`</${node.name}>`)
}

export function serializeHtml(document: HtmlDocument): string {
  const output: string[] = []
  serializeNode(document.root, null, output)
  return `${document.doctype.trim()}\n${output.join("").trim()}`
}

export function elementsOf(root: HtmlElement): HtmlElement[] {
  const found: HtmlElement[] = []
  const visit = (node: HtmlElement) => {
    found.push(node)
    for (const child of node.children) if (child.type === "element") visit(child)
  }
  visit(root)
  return found
}
