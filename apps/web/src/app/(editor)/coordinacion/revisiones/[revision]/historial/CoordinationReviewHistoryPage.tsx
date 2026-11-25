"use client"

import { ArrowLeft, Highlighter } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { type ReviewDetail, type ReviewTimelineEvent } from "@/api/reviews"
import { AppearanceToggle } from "@/components/AppearanceToggle"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { RoleDeadlineBanner } from "@/components/domain/RoleDeadlineBanner"
import { SyllabusDocumentPreview, type PreviewSection } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { scrollBehavior } from "@/lib/motion"
import { libraryCommentLines } from "@/lib/reviewComment"
import { reviewAreaPaths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { errorMessage, queryErrorMessage } from "@/lib/queryClient"
import { reviewComparisonQuery, reviewQuery } from "@/queries/reviews"

type Version = { id: string; number: number; at: string; by: string | null; current: boolean; events: ReviewTimelineEvent[] }
type Mark = { top: number; element: HTMLElement }

const NO_CHANGES: ReadonlySet<string> = new Set()

const versionsOf = (data: ReviewDetail | null): Version[] => {
  if (!data) return []
  const newest = Math.max(...data.history.map((item) => item.number))

  return data.history
    .map((item) => {
      const events = data.timeline.filter((event) => event.revision_id === item.id)
      const sent = events.find((event) => event.kind === "enviado")

      return {
        id: item.id,
        number: item.number,
        at: sent?.at ?? item.submitted_at,
        by: sent?.by ?? item.submitted_by,
        current: item.number === newest,
        events: events.filter((event) => event.kind !== "enviado").sort((left, right) => left.at.localeCompare(right.at)),
      }
    })
    .sort((left, right) => right.number - left.number)
}

const selectedOf = (versions: Version[], data: ReviewDetail | null): Version | null => versions.find((version) => version.id === data?.revision.id) ?? null

const previousOf = (versions: Version[], selected: Version | null): Version | null =>
  selected ? (versions.find((version) => version.number === selected.number - 1) ?? null) : null

const time = (value: string): string => formatDateDisplay(value, { hour: "2-digit", minute: "2-digit", hour12: false })

const capitalized = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

const eventText = (event: ReviewTimelineEvent): string =>
  ({
    enviado: "El docente envió el sílabo",
    biblioteca_verifico: "Biblioteca verificó la bibliografía y envió a Coordinación",
    coordinacion_aprobo: "Coordinación aprobó y envió a Biblioteca",
    correccion: "Coordinación pidió correcciones",
    devuelto_biblioteca: "Biblioteca devolvió al docente",
    aprobado: event.by ? "Coordinación aprobó el sílabo" : "Sílabo aprobado",
  })[event.kind]

const versionLabel = (version: Version): string => {
  if (version.events.some((event) => event.kind === "aprobado")) return "Aprobada"
  return version.number === 1 ? "Primer envío" : "Corregida tras observaciones"
}

export default function CoordinationReviewHistoryPage() {
  const router = useRouter()
  const revisionId = String(useParams<{ revision: string }>().revision)
  const area = reviewAreaPaths()
  const query = useQuery({ ...reviewQuery(revisionId), placeholderData: keepPreviousData })
  const data = query.data ?? null
  const loading = query.isFetching
  const loadError = queryErrorMessage(query, "No se pudo cargar el historial") ?? ""
  const loaded = query.isPlaceholderData ? null : data
  const previousId = useMemo(() => {
    const versions = versionsOf(loaded)

    return loaded ? (previousOf(versions, selectedOf(versions, loaded))?.id ?? null) : null
  }, [loaded])
  const comparison = useQuery({ ...reviewComparisonQuery(previousId ?? "", loaded?.revision.id ?? ""), enabled: previousId !== null && loaded !== null })
  const comparedChanges = previousId ? comparison.data?.comparison.changes : undefined
  const changedFields = useMemo<ReadonlySet<string>>(
    () => (comparedChanges ? new Set(comparedChanges.map((change) => `${change.section_key}.${change.field_key}`)) : NO_CHANGES),
    [comparedChanges],
  )
  const [highlight, setHighlight] = useState(true)
  const [marks, setMarks] = useState<Mark[]>([])
  const page = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (comparison.isError) toast.error(errorMessage(comparison.error, "No se pudieron destacar los cambios"))
  }, [comparison.error, comparison.isError])

  const load = (): void => {
    void query.refetch()
  }

  useEffect(() => {
    const measure = (): void => {
      const container = page.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? page.current
      if (!container) {
        setMarks([])
        return
      }
      const origin = container.getBoundingClientRect().top - container.scrollTop
      setMarks(
        Array.from(container.querySelectorAll<HTMLElement>("[data-changed]")).map((element) => ({
          top: ((element.getBoundingClientRect().top - origin) / container.scrollHeight) * 100,
          element,
        })),
      )
    }
    measure()
  }, [changedFields, highlight, data])

  const versions = useMemo(() => versionsOf(data), [data])
  const days = useMemo(() => {
    const groups: Array<{ label: string; versions: Version[] }> = []
    for (const version of versions) {
      const label = formatDateDisplay(version.at, { weekday: "long", day: "numeric", month: "long" })
      const last = groups.at(-1)
      if (last?.label === label) last.versions.push(version)
      else groups.push({ label, versions: [version] })
    }

    return groups
  }, [versions])
  const selected = selectedOf(versions, data)
  const currentVersion = versions.find((version) => version.current) ?? null
  const previewSections = useMemo<PreviewSection[]>(
    () =>
      (data?.revision.snapshot.sections ?? []).map((section) => ({
        id: section.key,
        title: section.title,
        orientation: section.orientation,
        fields: section.fields.map((field) => ({ ...field, id: field.id ?? field.key })),
      })),
    [data],
  )
  const title = selected
    ? `Versión ${selected.number} · ${formatDateDisplay(selected.at, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false })}`
    : ""

  const select = (id: string): void => {
    if (id !== data?.revision.id) router.replace(area.history(id))
  }

  const firstLoad = !data && !loadError
  const highlightLabel = changedFields.size === 0 ? "No hay cambios que resaltar" : highlight ? "Quitar el resaltado" : "Resaltar los cambios"

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur sm:px-5" aria-label="Herramientas del historial">
        <IconTooltip label="Volver al sílabo">
          <Button asChild variant="ghost" size="icon" aria-label="Volver al sílabo">
            <Link href={area.review(currentVersion?.id ?? revisionId)}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        </IconTooltip>
        {firstLoad ? (
          <div className="flex min-w-0 flex-col gap-1.5" data-skeleton="history-title">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3.5 w-32 max-w-full" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col leading-tight">
            <h1 className="truncate font-medium">{data?.syllabus.subject ?? ""}</h1>
            <span className="truncate text-sm text-muted-foreground">{title}</span>
          </div>
        )}
        <span className="flex-1" />
        {firstLoad ? (
          <Skeleton className="size-9" />
        ) : (
          <IconTooltip label={highlightLabel}>
            <span className="inline-flex" tabIndex={changedFields.size === 0 ? 0 : undefined}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Resaltar cambios"
                aria-pressed={highlight}
                disabled={changedFields.size === 0}
                className={highlight && changedFields.size > 0 ? "bg-accent text-accent-foreground" : ""}
                onClick={() => setHighlight((value) => !value)}
              >
                <Highlighter aria-hidden="true" />
              </Button>
            </span>
          </IconTooltip>
        )}
        <AppearanceToggle />
      </header>
      <RoleDeadlineBanner />
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : (
        <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <ScrollArea type="auto" className="h-full lg:h-[calc(100dvh-3.5rem)]">
              <div ref={page} className="p-4 sm:p-6">
                {loading && !data ? (
                  <LoadingSkeleton variant="preview" />
                ) : data ? (
                  <SyllabusDocumentPreview presentation={data.presentation} sections={previewSections} changed={highlight ? changedFields : NO_CHANGES} />
                ) : null}
              </div>
            </ScrollArea>
            {marks.length ? (
              <div className="pointer-events-none absolute inset-y-0 right-3 hidden w-3 lg:block" role="group" aria-label="Cambios en el documento">
                {marks.map((mark, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="ghost"
                    className="pointer-events-auto absolute right-0 h-1.5 min-h-0 w-3 rounded-full bg-warning p-0 hover:bg-warning"
                    style={{ top: `${mark.top}%` }}
                    aria-label={`Ir al cambio ${index + 1}`}
                    onClick={() => mark.element.scrollIntoView({ behavior: scrollBehavior(), block: "center" })}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <aside
            className="flex w-full shrink-0 flex-col border-t bg-card lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:w-80 lg:border-t-0 lg:border-l"
            aria-label="Historial de versiones"
          >
            {loading && !data ? (
              <div className="flex flex-col gap-1 p-4" role="status" aria-label="Cargando versiones" data-skeleton="history-versions">
                <div className="flex h-6 items-center pb-2">
                  <Skeleton className="h-5 w-44" />
                </div>
                {[1, 2].map((day) => (
                  <section key={day} className="flex flex-col gap-1">
                    <div className="flex h-9 items-end pb-1">
                      <Skeleton className="h-4 w-32" />
                    </div>
                    {[1, 2].map((version) => (
                      <div key={version} className="flex flex-col gap-1.5 px-3 py-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3.5 w-12" />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <h2 className="p-4 pb-2 text-base font-medium">Historial de versiones</h2>
            )}
            {data ? (
              <ScrollArea type="auto" className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-6.5rem)]">
                <div className="flex flex-col gap-1 px-4 pb-4">
                  {days.map((day) => (
                    <section key={day.label} className="flex flex-col gap-1">
                      <h3 className="pt-3 pb-1 text-sm text-muted-foreground">{capitalized(day.label)}</h3>
                      {day.versions.map((version) => (
                        <div key={version.id} className="flex flex-col">
                          <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                              "h-auto w-full flex-col items-start justify-start gap-0.5 rounded-md border border-transparent px-3 py-2 text-left text-sm font-normal whitespace-normal",
                              version.id === selected?.id && "border-ring bg-accent",
                            )}
                            aria-current={version.id === selected?.id ? "true" : undefined}
                            onClick={() => select(version.id)}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span className="font-medium">
                                Versión {version.number} · {versionLabel(version)}
                              </span>
                              {version.current ? <Badge variant="secondary">Versión actual</Badge> : null}
                            </span>
                            <span className="text-muted-foreground">{time(version.at)}</span>
                          </Button>
                          {version.events.length ? (
                            <ul className="ml-5 flex flex-col gap-2 border-l py-2 pl-4 text-sm">
                              {version.events.map((event, index) => (
                                <li key={`${event.kind}-${index}`} className="flex flex-col">
                                  <span>{eventText(event)}</span>
                                  {event.comment && event.kind === "devuelto_biblioteca" ? (
                                    <ul className="list-disc pl-4 text-muted-foreground">
                                      {libraryCommentLines(event.comment).map((line) => (
                                        <li key={line}>{line}</li>
                                      ))}
                                    </ul>
                                  ) : event.comment ? (
                                    <span className="text-muted-foreground">«{event.comment}»</span>
                                  ) : null}
                                  <span className="text-xs text-muted-foreground">{time(event.at)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              </ScrollArea>
            ) : null}
          </aside>
        </div>
      )}
    </>
  )
}
