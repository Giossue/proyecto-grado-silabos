"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { drawnInDocument } from "@silabos/shared/lib/teacherFormation"
import type { DocumentPresentation } from "@/api/syllabi"
import { paginateSheet } from "@/components/domain/configuration/templatePagination"
import { FreeTextContent } from "@/components/domain/syllabus/FreeTextContent"
import type { PreviewSection } from "@/components/domain/syllabus/previewSection"
import { documentLayout, layoutStyle, sheetPixels } from "@/lib/documentLayout"
import { cn } from "@/lib/utils"

export type { PreviewSection }

type SyllabusDocumentPreviewProps = {
  presentation: DocumentPresentation
  sections: PreviewSection[]
  changed?: ReadonlySet<string>
}

type Sheet = { landscape: boolean; items: PreviewSection[] }

const groupSheets = (sections: PreviewSection[]): Sheet[] => {
  const groups: Sheet[] = []
  for (const section of sections) {
    const landscape = section.orientation === "landscape"
    const last = groups[groups.length - 1]
    if (last && last.landscape === landscape) last.items.push(section)
    else groups.push({ landscape, items: [section] })
  }

  return groups.length > 0 ? groups : [{ landscape: false, items: [] }]
}

export function SyllabusDocumentPreview({ presentation, sections, changed }: SyllabusDocumentPreviewProps) {
  const root = useRef<HTMLDivElement | null>(null)
  const sheetElements = useRef(new Map<number, HTMLElement>())
  const frame = useRef(0)
  const [available, setAvailable] = useState(0)

  const layout = useMemo(
    () => layoutStyle(presentation.document ? documentLayout(presentation.document) : presentation.appearance, presentation.document),
    [presentation],
  )
  const sheetPx = useMemo(() => sheetPixels(presentation.document), [presentation])
  const sheets = useMemo(() => groupSheets(sections), [sections])
  const latest = useRef({ sheets, presentation })
  useEffect(() => {
    latest.current = { sheets, presentation }
  })

  const paginate = useCallback((): void => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const current = latest.current
      sheetElements.current.forEach((element, index) => paginateSheet(element, current.sheets[index]?.landscape ?? false, current.presentation.document))
    })
  }, [])

  useEffect(() => {
    const element = root.current
    let observer: ResizeObserver | null = null
    if (element && typeof ResizeObserver !== "undefined") {
      setAvailable(element.clientWidth)
      observer = new ResizeObserver(() => {
        setAvailable(root.current?.clientWidth ?? 0)
        paginate()
      })
      observer.observe(element)
    }
    void document.fonts?.ready.then(paginate)

    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame.current)
    }
  }, [paginate])

  useEffect(() => {
    paginate()
  }, [sections, presentation, changed, paginate])

  const scaleFor = (landscape: boolean): number => {
    const width = landscape ? sheetPx.landscape : sheetPx.portrait

    return available > 0 ? Math.min(1, available / width) : 1
  }
  const setSheet = (index: number, element: HTMLElement | null): void => {
    if (element) sheetElements.current.set(index, element)
    else sheetElements.current.delete(index)
  }
  const isChanged = (sectionId: string, field: PreviewSection["fields"][number]): boolean => changed?.has(`${sectionId}.${field.key ?? field.id}`) === true

  return (
    <div ref={root} className="flex min-w-0 flex-col gap-4" role="region" aria-label="Vista previa del sílabo">
      {sheets.map((sheet, sheetIndex) => (
        <div key={sheetIndex} className="min-w-0 overflow-x-auto">
          <article
            ref={(element) => setSheet(sheetIndex, element)}
            data-sheet
            data-preview="true"
            style={{ zoom: scaleFor(sheet.landscape), ...layout }}
            className={cn("template-sheet relative", sheet.landscape && "template-sheet--landscape")}
          >
            <div data-sheet-content className="flex flex-col gap-6">
              {sheetIndex === 0 ? (
                <header className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={presentation.logos.institution} alt="Logo de la universidad" className="h-12 w-auto object-contain" onLoad={paginate} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={presentation.logos.faculty} alt="Logo de la facultad" className="h-12 w-auto object-contain" onLoad={paginate} />
                  </div>
                  <h2 className="template-sheet-title px-2 py-1">{presentation.title}</h2>
                </header>
              ) : null}
              {sheet.items.map((section) => (
                <section key={section.id} className="flex min-w-0 flex-col gap-3" data-section={section.id}>
                  <h3 className="font-bold" data-section-title>
                    {section.title}
                  </h3>
                  <ol className="flex flex-col gap-3">
                    {section.fields.filter(drawnInDocument).map((field) => {
                      const fieldChanged = isChanged(section.id, field)
                      const label = field.label.trim()

                      return (
                        <li
                          key={field.id}
                          data-field={field.id}
                          data-changed={fieldChanged || undefined}
                          className={cn("relative min-w-0 px-2 py-1", fieldChanged && "rounded-md bg-warning/10 ring-2 ring-warning/60")}
                        >
                          {fieldChanged ? (
                            <span className="absolute -top-2.5 right-2 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground" data-change-mark>
                              Cambió
                            </span>
                          ) : null}
                          <div className="flex min-w-0 flex-col gap-1">
                            {label && label.toLowerCase() !== section.title.trim().toLowerCase() ? (
                              <div data-field-label>
                                <h4 className="min-w-0 font-bold [overflow-wrap:anywhere]">{field.label}</h4>
                              </div>
                            ) : null}
                            <div data-field-body>
                              <FreeTextContent value={field.document ?? field.value} emptyText="Sin completar" />
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          </article>
        </div>
      ))}
    </div>
  )
}
