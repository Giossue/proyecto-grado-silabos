"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { DOCUMENT_DEFAULTS } from "@/lib/documentDefaults"
import { A4_PAGE, createDocumentPaginator, LETTER_PAGE, type DocumentPageMetrics } from "@/lib/documentPagination"

type PaginatedDocumentProps = {
  orientation?: "portrait" | "landscape"
  paperSize?: "a4" | "letter"
  marginCm?: number
  fontFamily?: string
  fontSize?: number
  textColor?: string
  onPages?: (count: number) => void
  children?: ReactNode
}

export function PaginatedDocument({
  orientation = "portrait",
  paperSize = "letter",
  marginCm = DOCUMENT_DEFAULTS.marginCm,
  fontFamily = DOCUMENT_DEFAULTS.fontFamily,
  fontSize = DOCUMENT_DEFAULTS.fontSize,
  textColor = "var(--document-text)",
  onPages,
  children,
}: PaginatedDocumentProps) {
  const page = useMemo<DocumentPageMetrics>(() => {
    const paper = paperSize === "a4" ? A4_PAGE : LETTER_PAGE
    const landscape = orientation === "landscape"

    return {
      width: landscape ? paper.height : paper.width,
      height: landscape ? paper.width : paper.height,
      margin: (marginCm * 96) / 2.54,
      gap: paper.gap,
    }
  }, [orientation, paperSize, marginCm])

  const content = useRef<HTMLDivElement>(null)
  const metrics = useRef(page)
  const schedule = useRef<() => void>(() => undefined)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    metrics.current = page
    schedule.current()
  }, [page])

  useEffect(() => {
    onPages?.(pages)
  }, [pages, onPages])

  useEffect(() => {
    const node = content.current
    if (node === null) return
    let frame = 0
    let rerun = false
    let disposed = false
    let measuredWidth = 0
    let measuredHeight = 0
    const paginator = createDocumentPaginator(node, () => metrics.current)

    const rememberContentSize = (): void => {
      const rect = node.getBoundingClientRect()
      measuredWidth = rect.width
      measuredHeight = rect.height
    }

    const observeContent = (): void => {
      mutations.observe(node, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style", "src", "rowspan", "colspan"],
      })
    }

    const run = (): void => {
      if (disposed) return
      if (frame) {
        rerun = true
        return
      }
      frame = requestAnimationFrame(() => {
        frame = 0
        mutations.disconnect()
        setPages(paginator.paginate() ?? 1)
        rememberContentSize()
        observeContent()
        if (rerun) {
          rerun = false
          run()
        }
      })
    }

    const mutations = new MutationObserver(() => {
      if (paginator.hasGeometryChanged() ?? true) run()
    })
    schedule.current = run
    observeContent()
    rememberContentSize()
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      if (Math.abs(width - measuredWidth) <= 0.5 && Math.abs(height - measuredHeight) <= 0.5) return
      measuredWidth = width
      measuredHeight = height
      run()
    })
    resize.observe(node)
    node.addEventListener("load", run, true)
    const fontSet = typeof document !== "undefined" ? document.fonts : undefined
    void fontSet?.ready.then(run)
    fontSet?.addEventListener("loadingdone", run)
    run()

    return () => {
      disposed = true
      schedule.current = () => undefined
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      node.removeEventListener("load", run, true)
      fontSet?.removeEventListener("loadingdone", run)
      paginator.reset()
    }
  }, [])

  const style = {
    "--page-width": `${page.width}px`,
    "--page-height": `${page.height}px`,
    "--page-margin": `${page.margin}px`,
    "--page-gap": `${page.gap}px`,
    width: `${page.width}px`,
    minHeight: `${pages * (page.height + page.gap) - page.gap}px`,
    color: textColor,
    fontFamily,
    fontSize: `${fontSize}pt`,
  } as CSSProperties

  return (
    <div className="paged-document relative mx-auto box-border p-(--page-margin) leading-(--document-line-height)" style={style}>
      <div className="paged-document-papers pointer-events-none absolute inset-0 flex flex-col gap-(--page-gap)" aria-hidden="true">
        {Array.from({ length: pages }, (_, index) => (
          <div key={index} className="paged-document-paper relative h-(--page-height) shrink-0 bg-(--document-paper) shadow-(--document-paper-shadow)" />
        ))}
      </div>
      <div ref={content} className="paged-document-content relative flow-root">
        {children}
      </div>
    </div>
  )
}
