import { decodeHTML, decodeHTMLAttribute } from "entities"

export type HtmlElement = { kind: "element"; name: string; attributes: Map<string, string>; children: HtmlNode[] }
export type HtmlText = { kind: "text"; text: string }
export type HtmlOther = { kind: "other" }
export type HtmlNode = HtmlElement | HtmlText | HtmlOther

type Mode = "data" | "rcdata" | "rawtext" | "script" | "plaintext"

const START_CLOSE: Record<string, string[]> = {
  a: ["a", "fieldset", "table", "td", "th"],
  address: ["dd", "dl", "dt", "form", "li", "ul"],
  b: ["center", "p", "td", "th"],
  big: ["p"],
  caption: ["col", "colgroup", "tbody", "tfoot", "thead", "tr"],
  col: ["col", "colgroup", "tbody", "tfoot", "thead", "tr"],
  colgroup: ["colgroup", "tbody", "tfoot", "thead", "tr"],
  dd: ["dt"],
  dir: ["dd", "dl", "dt", "form", "ul"],
  dl: ["form", "li"],
  dt: ["dd", "dl"],
  font: ["center", "td", "th"],
  form: ["form"],
  h1: ["fieldset", "form", "li", "p", "table"],
  h2: ["fieldset", "form", "li", "p", "table"],
  h3: ["fieldset", "form", "li", "p", "table"],
  h4: ["fieldset", "form", "li", "p", "table"],
  h5: ["fieldset", "form", "li", "p", "table"],
  h6: ["fieldset", "form", "li", "p", "table"],
  head: [
    "a", "abbr", "acronym", "address", "b", "bdo", "big", "blockquote", "body", "br", "center", "cite", "code", "dd", "dfn", "dir", "div",
    "dl", "dt", "em", "fieldset", "font", "form", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "iframe", "img", "kbd", "li",
    "listing", "map", "menu", "ol", "p", "pre", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "table", "tt", "u",
    "ul", "var", "xmp",
  ],
  hr: ["form"],
  i: ["center", "p", "td", "th"],
  legend: ["fieldset"],
  li: ["li"],
  link: ["body", "frameset"],
  listing: ["dd", "dl", "dt", "fieldset", "form", "li", "table", "ul"],
  menu: ["dd", "dl", "dt", "form", "ul"],
  ol: ["form"],
  option: ["optgroup", "option"],
  p: [
    "address", "blockquote", "body", "caption", "center", "col", "colgroup", "dd", "dir", "div", "dl", "dt", "fieldset", "form", "frameset",
    "h1", "h2", "h3", "h4", "h5", "h6", "head", "hr", "li", "listing", "menu", "ol", "p", "pre", "table", "tbody", "td", "tfoot", "th",
    "title", "tr", "ul", "xmp",
  ],
  pre: ["dd", "dl", "dt", "fieldset", "form", "li", "table", "ul"],
  s: ["p"],
  script: ["noscript"],
  small: ["p"],
  span: ["td", "th"],
  strike: ["p"],
  style: ["body", "frameset"],
  tbody: ["tbody", "tfoot"],
  td: ["tbody", "td", "tfoot", "th", "tr"],
  tfoot: ["tbody"],
  th: ["tbody", "td", "tfoot", "th", "tr"],
  thead: ["tbody", "tfoot"],
  title: ["body", "frameset"],
  tr: ["tbody", "tfoot", "tr"],
  tt: ["p"],
  u: ["p", "td", "th"],
  ul: ["address", "form", "menu", "pre"],
  xmp: ["dd", "dl", "dt", "fieldset", "form", "li", "table", "ul"],
}

const END_PRIORITY: Record<string, number> = { div: 150, td: 160, th: 160, tr: 170, thead: 180, tbody: 180, tfoot: 180, table: 190, head: 200, body: 200, html: 220 }

const EMPTY = new Set(["area", "base", "basefont", "bgsound", "br", "col", "embed", "frame", "hr", "img", "input", "isindex", "keygen", "link", "meta", "param", "source", "track", "wbr"])

const MODES: Record<string, Mode> = {
  iframe: "rawtext",
  noembed: "rawtext",
  noframes: "rawtext",
  plaintext: "plaintext",
  script: "script",
  style: "rawtext",
  textarea: "rcdata",
  title: "rcdata",
  xmp: "rawtext",
}

const WHITESPACE = new Set([" ", "\t", "\n", "\f", "\r"])

function isLetter(character: string | undefined): boolean {
  return character !== undefined && /^[A-Za-z]$/.test(character)
}

function priority(name: string): number {
  return END_PRIORITY[name] ?? 100
}

function closesOnStart(open: string, next: string): boolean {
  return START_CLOSE[open]?.includes(next) ?? false
}

function normalize(text: string, keepNul: boolean): string {
  const lines = text.replace(/\r\n?/g, "\n")
  return keepNul ? lines.replace(/\0/g, "\uFFFD") : lines.replace(/\0/g, "")
}

function decodeText(raw: string, attribute: boolean, keepNul: boolean): string {
  const text = normalize(raw, keepNul)
  return attribute ? decodeHTMLAttribute(text) : decodeHTML(text)
}

class HtmlTreeBuilder {
  private position = 0
  private depth = 0
  private mode: Mode = "data"
  private readonly stack: HtmlElement[] = []
  private readonly roots: HtmlNode[] = []

  constructor(private readonly source: string) {}

  build(): HtmlNode[] {
    const { source } = this
    while (this.position < source.length) {
      if (this.mode === "data" && source[this.position] === "<") this.markup()
      else this.characterData()
    }
    this.stack.length = 0
    return this.roots
  }

  private get top(): HtmlElement | undefined {
    return this.stack[this.stack.length - 1]
  }

  private markup(): void {
    const { source } = this
    const next = source[this.position + 1]
    if (next === "/") this.endTag()
    else if (next === "!") {
      if (source.slice(this.position + 2, this.position + 9).toUpperCase() === "DOCTYPE") this.skipPast(">")
      else if (source[this.position + 2] === "-" && source[this.position + 3] === "-") {
        this.position += 4
        this.comment(false)
      } else {
        this.position += 2
        this.comment(true)
      }
    } else if (next === "?") {
      this.position += 1
      this.comment(true)
    } else if (isLetter(next)) this.element()
    else {
      this.characters("<")
      this.position += 1
    }
  }

  private skipPast(terminator: string): void {
    const found = this.source.indexOf(terminator, this.position)
    this.position = found === -1 ? this.source.length : found + terminator.length
  }

  private comment(bogus: boolean): void {
    const { source } = this
    if (bogus) {
      this.skipPast(">")
    } else if (source[this.position] === ">") {
      this.position += 1
    } else if (source[this.position] === "-" && source[this.position + 1] === ">") {
      this.position += 2
    } else {
      const pattern = /--!?>/g
      pattern.lastIndex = this.position
      const found = pattern.exec(source)
      this.position = found === null ? source.length : found.index + found[0].length
    }
    this.append({ kind: "other" })
  }

  private append(node: HtmlNode): void {
    const parent = this.top
    if (parent) parent.children.push(node)
    else if (node.kind === "element") this.roots.push(node)
  }

  private characters(text: string): void {
    const parent = this.top
    if (!parent || text === "") return
    const last = parent.children[parent.children.length - 1]
    if (last && last.kind === "text") last.text += text
    else parent.children.push({ kind: "text", text })
  }

  private skipBlanks(): void {
    while (this.position < this.source.length && WHITESPACE.has(this.source[this.position])) this.position += 1
  }

  private readName(attribute: boolean): string {
    const { source } = this
    let name = ""
    while (this.position < source.length) {
      const character = source[this.position]
      if (name !== "" && (character === "/" || character === ">" || WHITESPACE.has(character) || (attribute && character === "="))) break
      name += character === "\0" ? "\uFFFD" : character >= "A" && character <= "Z" ? character.toLowerCase() : character
      this.position += 1
    }
    return name
  }

  private attributeValue(): string {
    const { source } = this
    const quote = source[this.position]
    let end: number
    if (quote === '"' || quote === "'") {
      this.position += 1
      end = source.indexOf(quote, this.position)
      if (end === -1) end = source.length
      const raw = source.slice(this.position, end)
      this.position = end < source.length ? end + 1 : end
      return decodeText(raw, true, true)
    }
    end = this.position
    while (end < source.length && !WHITESPACE.has(source[end]) && source[end] !== ">") end += 1
    const raw = source.slice(this.position, end)
    this.position = end
    return decodeText(raw, true, true)
  }

  private attributes(collect: boolean): Map<string, string> {
    const { source } = this
    const found = new Map<string, string>()
    this.skipBlanks()
    while (this.position < source.length && source[this.position] !== ">" && !(source[this.position] === "/" && source[this.position + 1] === ">")) {
      if (source[this.position] === "/") {
        this.position += 1
        this.skipBlanks()
        continue
      }
      const name = this.readName(true)
      this.skipBlanks()
      let value = ""
      if (source[this.position] === "=") {
        this.position += 1
        this.skipBlanks()
        value = this.attributeValue()
      }
      if (collect && !found.has(name)) found.set(name, value)
      this.skipBlanks()
    }
    return found
  }

  private pop(): void {
    this.stack.pop()
  }

  private element(): void {
    const { source } = this
    this.position += 1
    const name = this.readName(false)
    while (this.top && closesOnStart(this.top.name, name)) this.pop()
    let discard = false
    if (this.stack.length > 0 && name === "html") {
      discard = true
      this.depth += 1
    }
    if (this.stack.length !== 1 && name === "head") {
      discard = true
      this.depth += 1
    }
    if (name === "body") {
      for (const open of this.stack) {
        if (open.name === "body") {
          discard = true
          this.depth += 1
        }
      }
    }
    const attributes = this.attributes(true)
    if (this.position >= source.length) return
    if (!discard) {
      const element: HtmlElement = { kind: "element", name, attributes, children: [] }
      this.append(element)
      this.stack.push(element)
    }
    const current = this.top
    if (!current) return
    if (source[this.position] === "/" && source[this.position + 1] === ">") {
      this.position += 2
      this.pop()
      return
    }
    if (source[this.position] !== ">") return
    this.position += 1
    if (EMPTY.has(current.name)) {
      this.pop()
      return
    }
    this.mode = MODES[current.name] ?? "data"
  }

  private endTag(): void {
    const { source } = this
    this.position += 2
    if (this.position >= source.length) {
      this.characters("</")
      return
    }
    if (source[this.position] === ">") {
      this.position += 1
      return
    }
    if (!isLetter(source[this.position])) {
      this.comment(true)
      return
    }
    const name = this.readName(false)
    this.attributes(false)
    if (source[this.position] === ">") this.position += 1
    else if (source[this.position] === "/" && source[this.position + 1] === ">") this.position += 2
    else return
    if (this.depth > 0 && (name === "html" || name === "body" || name === "head")) {
      this.depth -= 1
      return
    }
    let index = this.stack.length - 1
    while (index >= 0 && this.stack[index].name !== name) index -= 1
    if (index < 0) return
    const level = priority(name)
    for (let position = this.stack.length - 1; position > index; position -= 1) {
      if (priority(this.stack[position].name) > level) return
    }
    this.stack.length = index
  }

  private endsAt(position: number, name: string): boolean {
    const { source } = this
    const candidate = source.slice(position, position + name.length).toLowerCase()
    if (candidate !== name) return false
    const after = source[position + name.length]
    return after !== undefined && (after === ">" || after === "/" || WHITESPACE.has(after))
  }

  private characterData(): void {
    const { source } = this
    const mode = this.mode
    if (mode === "data") {
      let end = source.indexOf("<", this.position)
      if (end === -1) end = source.length
      const raw = source.slice(this.position, end)
      this.position = end
      this.characters(decodeText(raw, false, false))
      return
    }
    if (mode === "plaintext") {
      const raw = source.slice(this.position)
      this.position = source.length
      this.appendData(raw, mode)
      return
    }
    const name = this.top?.name ?? ""
    let scan = this.position
    let escape: 0 | 1 | 2 = 0
    let end = source.length
    while (scan < source.length) {
      const character = source[scan]
      if (character === "<") {
        if (mode === "script" && escape === 0 && source.startsWith("!--", scan + 1)) {
          escape = 1
          scan += 1
          continue
        }
        const solidus = source[scan + 1] === "/"
        if ((solidus || (mode === "script" && escape === 1)) && this.endsAt(scan + (solidus ? 2 : 1), name)) {
          if (mode === "script" && escape === 1 && !solidus) escape = 2
          else if (mode === "script" && escape === 2) escape = 1
          else {
            end = scan
            break
          }
        }
      } else if (character === "-" && mode === "script" && escape !== 0 && source.startsWith("-->", scan)) {
        escape = 0
      }
      scan += 1
    }
    const raw = source.slice(this.position, end)
    this.position = end
    if (end < source.length) this.mode = "data"
    this.appendData(raw, mode)
  }

  private appendData(raw: string, mode: Mode): void {
    if (mode === "rcdata") {
      this.characters(decodeText(raw, false, true))
      return
    }
    if (raw !== "") this.append({ kind: "other" })
  }
}

export function parseHtmlDocument(source: string): HtmlNode[] {
  return new HtmlTreeBuilder(source).build()
}

export function firstElement(nodes: HtmlNode[], name: string): HtmlElement | null {
  for (const node of nodes) {
    if (node.kind !== "element") continue
    if (node.name === name) return node
    const found = firstElement(node.children, name)
    if (found) return found
  }
  return null
}
