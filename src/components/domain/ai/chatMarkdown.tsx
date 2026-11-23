import type { ReactNode } from "react"

const inline = (text: string): ReactNode[] =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part))

export const renderChatMarkdown = (text: string): ReactNode[] => {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let paragraph: string[] = []
  const flushParagraph = (): void => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "))}</p>)
    paragraph = []
  }
  const flushList = (): void => {
    if (list) {
      const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>)
      blocks.push(list.ordered ? <ol key={blocks.length} className="list-decimal pl-8">{items}</ol> : <ul key={blocks.length} className="list-disc pl-5">{items}</ul>)
    }
    list = null
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      if (list && (list as { ordered: boolean }).ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1]!)
    } else if (heading) {
      flushParagraph()
      flushList()
      blocks.push(<p key={blocks.length} className="font-semibold">{inline(heading[1]!)}</p>)
    } else if (line === "") {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()

  return blocks
}
