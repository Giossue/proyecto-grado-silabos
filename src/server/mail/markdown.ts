import { HtmlRenderer, Parser, type Node } from "commonmark"

type RawRenderer = { lit(text: string): void; cr(): void }

type InlineParser = {
  subject: string
  pos: number
  delimiters: unknown
  brackets: unknown
  parse(block: Node): void
  parseInline(block: Node): boolean
  processEmphasis(stackBottom: null): void
}

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

class LaravelMarkdownRenderer extends HtmlRenderer {
  constructor() {
    super({ safe: true })
  }

  html_inline(node: Node): void {
    ;(this as unknown as RawRenderer).lit(node.literal ?? "")
  }

  html_block(node: Node): void {
    const renderer = this as unknown as RawRenderer
    renderer.cr()
    renderer.lit(node.literal ?? "")
    renderer.cr()
  }
}

function laravelParser(): Parser {
  const parser = new Parser()
  const inline = (parser as unknown as { inlineParser: InlineParser }).inlineParser
  inline.parse = function (this: InlineParser, block: Node) {
    const raw = block as unknown as { _string_content: string | null }
    this.subject = (raw._string_content ?? "").replace(PHP_TRIM, "")
    this.pos = 0
    this.delimiters = null
    this.brackets = null
    while (this.parseInline(block)) {}
    raw._string_content = null
    this.processEmphasis(null)
  }
  return parser
}

function unusedPrivateCharacter(text: string): string {
  for (let code = 0xe000; code <= 0xf8ff; code += 1) {
    const character = String.fromCharCode(code)
    if (!text.includes(character)) return character
  }
  throw new Error("The mail text uses every private character.")
}

export function markdownToHtml(markdown: string): string {
  if (!markdown.includes("\ufeff")) return new LaravelMarkdownRenderer().render(laravelParser().parse(markdown))
  const placeholder = unusedPrivateCharacter(markdown)
  const html = new LaravelMarkdownRenderer().render(laravelParser().parse(markdown.replaceAll("\ufeff", placeholder)))
  return html.replaceAll(placeholder, "\ufeff")
}
