import type { DocumentStyle } from "@silabos/shared/lib/blocks/types"
import { paperOf } from "@/lib/documentLayout"
import { createDocumentPaginator } from "@/lib/documentPagination"

const PX_PER_MM = 96 / 25.4
const MARGIN = 15 * PX_PER_MM
const GAP = 16
const pageOf = (landscape: boolean, document: DocumentStyle | null | undefined): { width: number; height: number } => {
  const paper = paperOf(document)
  return landscape ? { width: paper.height * PX_PER_MM, height: paper.width * PX_PER_MM } : { width: paper.width * PX_PER_MM, height: paper.height * PX_PER_MM }
}
const BLOCKS = ":scope > header, :scope > section > h3, :scope > section > [data-section-heading], :scope > section > p"

type SheetPaginator = { landscape: boolean; document: DocumentStyle | null | undefined; paginate: () => number }
const paginators = new WeakMap<HTMLElement, SheetPaginator>()

const paginatorFor = (content: HTMLElement, landscape: boolean, document: DocumentStyle | null | undefined): SheetPaginator => {
  const existing = paginators.get(content)
  if (existing) {
    existing.landscape = landscape
    existing.document = document
    return existing
  }
  const entry: SheetPaginator = {
    landscape,
    document,
    paginate: () => created.paginate(),
  }
  const margin = (): number => {
    const sheet = content.parentElement
    const padding = sheet ? Number.parseFloat(getComputedStyle(sheet).paddingTop) : Number.NaN

    return Number.isFinite(padding) && padding > 0 ? padding : MARGIN
  }
  const created = createDocumentPaginator(content, () => ({ ...pageOf(entry.landscape, entry.document), margin: margin(), gap: GAP }))
  paginators.set(content, entry)
  return entry
}

const setUnit = (element: Element, unit: boolean, keepNext = false): void => {
  for (const [name, on] of [["data-page-unit", unit], ["data-page-keep-next", unit && keepNext]] as const) {
    if (on) element.setAttribute(name, "")
    else element.removeAttribute(name)
  }
}

const markBlocks = (content: HTMLElement): void => {
  for (const block of content.querySelectorAll<HTMLElement>(BLOCKS)) setUnit(block, true, block.matches("h3, [data-section-heading]"))
  for (const field of content.querySelectorAll<HTMLElement>(":scope > section > ol > li[data-field]")) {
    const label = field.querySelector("[data-field-label]")
    const body = field.querySelector("[data-field-body]")
    if (!body) {
      setUnit(field, true)
      continue
    }
    setUnit(field, false)
    if (label) setUnit(label, true, true)
    if (body.querySelector("[contenteditable=\"true\"]")) {
      setUnit(body, true)
      continue
    }
    setUnit(body, false)
    for (const part of body.querySelectorAll("p, ul > li, ol > li")) setUnit(part, part.closest("table") === null)
  }
}

export const paginateSheet = (sheet: HTMLElement, landscape: boolean, document?: DocumentStyle | null): void => {
  const content = sheet.querySelector<HTMLElement>(":scope > [data-sheet-content]")
  if (!content || sheet.getBoundingClientRect().width === 0) return

  const zoom = sheet.style.zoom
  sheet.style.zoom = "1"
  sheet.style.height = ""
  markBlocks(content)
  const pages = paginatorFor(content, landscape, document).paginate()
  sheet.style.zoom = zoom

  const page = pageOf(landscape, document).height
  const stride = page + GAP
  sheet.style.minHeight = "0"
  sheet.style.height = `${pages * stride - GAP}px`
  sheet.style.backgroundColor = "transparent"
  sheet.style.boxShadow = "none"
  sheet.style.backgroundImage = `repeating-linear-gradient(to bottom, var(--document-paper, var(--document-sheet-paper)) 0, var(--document-paper, var(--document-sheet-paper)) ${page}px, transparent ${page}px, transparent ${stride}px)`
}
