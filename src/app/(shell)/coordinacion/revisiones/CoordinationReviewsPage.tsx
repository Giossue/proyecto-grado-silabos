"use client"

import { ChartNoAxesColumn, History, Inbox } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { getDashboard, type Dashboard } from "@/api/dashboard"
import { getReviews, type ReviewsPage } from "@/api/reviews"
import { getSession } from "@/api/session"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { ConvocationActions } from "@/components/domain/syllabus/ConvocationActions"
import { ConvocationTrackingTable } from "@/components/domain/syllabus/ConvocationTrackingTable"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { useLatestRequest } from "@/lib/latestRequest"
import { paths, reviewAreaPaths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { deadlineState } from "@/state/deadline"
import { setupChecklistState } from "@/state/setupChecklist"

type Tab = "cola" | "seguimiento"

const submittedOn = (value: string | null): string => (value ? formatDateDisplay(value, { dateStyle: "medium" }) : "—")

export default function CoordinationReviewsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requests = useLatestRequest()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)

    return { page: queryPage(query.page), search: queryText(query.search), tab: (queryText(query.tab) === "seguimiento" ? "seguimiento" : "cola") as Tab }
  })
  const [data, setData] = useState<ReviewsPage | null>(null)
  const [summary, setSummary] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [search, setSearch] = useState(initial.search)
  const filtersActive = search !== ""
  const area = reviewAreaPaths()
  const convocationId = summary?.coordination_convocation?.convocation_id ?? null
  const openHint = summary?.setup?.steps.find((step) => step.key === "convocation")?.hint ?? ""

  const applySummary = useCallback((dashboard: Dashboard | null): void => {
    setSummary(dashboard)
    if (dashboard?.setup !== undefined) setupChecklistState.update(dashboard.setup)
  }, [])

  const fetchReviews = useCallback(
    (page: number, withSummary: boolean, currentSearch: string, currentTab: Tab, currentSummary: Dashboard | null): Promise<void> => {
      const ticket = requests.begin()

      return getSession()
        .then(async (session) => {
          if (!requests.isCurrent(ticket)) return
          if (session.active_role?.code !== "coordinador") {
            router.replace(paths.dashboard)
            return
          }
          const [reviews, dashboard] = await Promise.all([getReviews({ search: currentSearch, page }), withSummary ? getDashboard().catch(() => null) : currentSummary])
          if (!requests.isCurrent(ticket)) return
          setData(reviews)
          applySummary(dashboard)
          syncFilters(router, { search: currentSearch, tab: currentTab === "seguimiento" ? "seguimiento" : "" }, page)
        })
        .catch((reason: unknown) => {
          if (requests.isCurrent(ticket)) setError(reason instanceof ApiError ? reason.message : "No se pudo cargar la cola de revisión")
        })
        .finally(() => {
          if (requests.isCurrent(ticket)) setLoading(false)
        })
    },
    [applySummary, requests, router],
  )

  useEffect(() => {
    void fetchReviews(initial.page, true, initial.search, initial.tab, null)
  }, [fetchReviews, initial])

  const load = (page = 1, withSummary = false, currentSearch = search): Promise<void> => {
    setLoading(true)
    setError(null)
    return fetchReviews(page, withSummary, currentSearch, tab, summary)
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void load()
  }

  const clearFilters = (): void => {
    setSearch("")
    void load(1, false, "")
  }

  const changed = async (message: string): Promise<void> => {
    toast.success(message)
    const [dashboard] = await Promise.all([getDashboard().catch(() => summary), deadlineState.load()])
    applySummary(dashboard)
  }

  const changeTab = (value: string): void => {
    const next: Tab = value === "seguimiento" ? "seguimiento" : "cola"
    setTab(next)
    const query = new URLSearchParams(window.location.search)
    if (next === "seguimiento") query.set("tab", "seguimiento")
    else query.delete("tab")
    const text = query.toString()
    router.replace(`${pathname}${text ? `?${text}` : ""}`, { scroll: false })
  }

  const openReview = (revisionId: string): void => router.push(area.review(revisionId))
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, revisionId: string): void => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    openReview(revisionId)
  }

  return (
    <PageFrame
      title="Revisión"
      description="Lo que envían los docentes de su carrera y el avance de cada sílabo"
      size="wide"
      loading={!data && !error}
      actionsSkeleton={loading && !data ? ["w-48"] : []}
      tools={
        <IconTooltip label="Historial">
          <Button asChild variant="ghost" size="icon">
            <Link href={paths.coordination.periodHistory} aria-label="Historial">
              <History aria-hidden="true" />
            </Link>
          </Button>
        </IconTooltip>
      }
      actions={summary?.coordination_convocation ? <ConvocationActions convocation={summary.coordination_convocation} blockedReason={openHint} onChanged={(message) => void changed(message)} /> : null}
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load(1, true)} />
      ) : loading && !data && tab === "seguimiento" ? (
        <LoadingSkeleton variant="table" columns={3} filters={1} filterWidth="lg:w-44" cellLines={[2, 2, 1]} badges={[3]} actions={false} tabs={2} />
      ) : loading && !data ? (
        <LoadingSkeleton variant="table" columns={4} cellLines={[2, 1, 1, 1]} actions={false} tabs={2} />
      ) : null}
      {data ? (
        <Tabs value={tab} onValueChange={changeTab} className="gap-4">
          <TabsList className="h-11 justify-start" aria-label="Vistas de revisión">
            <TabsTrigger value="cola" className="flex-none gap-2 px-4 data-[state=active]:font-semibold">
              <Inbox aria-hidden="true" />
              Cola de revisión
            </TabsTrigger>
            <TabsTrigger value="seguimiento" className="flex-none gap-2 px-4 data-[state=active]:font-semibold">
              <ChartNoAxesColumn aria-hidden="true" />
              Seguimiento
            </TabsTrigger>
          </TabsList>
          <TabsContent value="cola" className="flex flex-col gap-4">
            <form onSubmit={submit}>
              <FilterToolbar
                active={filtersActive}
                onClear={clearFilters}
                search={
                  <Field>
                    <FieldLabel htmlFor="review-search" className="sr-only">
                      Buscar por asignatura o código
                    </FieldLabel>
                    <Input id="review-search" value={search} type="search" maxLength={120} placeholder="Buscar por asignatura o código" onChange={(event) => setSearch(event.target.value)} />
                  </Field>
                }
              />
            </form>
            <Table label="Revisiones de coordinación">
              <TableHeader>
                <TableRow>
                  <TableHead>Asignatura</TableHead>
                  <TableHead>Docente</TableHead>
                  <TableHead className="text-center">Revisión</TableHead>
                  <TableHead className="text-center">Enviado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.syllabi.data.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    aria-label={`Abrir revisión de ${item.subject}`}
                    onClick={(event) => activateRow(event.nativeEvent, () => openReview(item.revision_id))}
                    onKeyDown={(event) => openFromKeyboard(event, item.revision_id)}
                  >
                    <TableCell>
                      <div>{item.subject}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.code} · {item.period}
                      </div>
                      <TableCardLine>{item.teachers.join(", ")}</TableCardLine>
                      <TableCardLine>
                        N.º {item.revision_number} · {submittedOn(item.submitted_at)}
                      </TableCardLine>
                    </TableCell>
                    <TableCell data-card-hide="true">{item.teachers.join(", ")}</TableCell>
                    <TableCell className="text-center" data-card-hide="true">
                      N.º {item.revision_number}
                    </TableCell>
                    <TableCell className="text-center" data-card-hide="true">
                      {submittedOn(item.submitted_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {data.syllabi.data.length === 0 ? <TableEmpty colSpan={4}>No hay sílabos por revisar</TableEmpty> : null}
              </TableBody>
            </Table>
            <TablePagination meta={data.syllabi} label="Paginación de expedientes en revisión" onPageChange={(page) => void load(page)} />
          </TabsContent>
          <TabsContent value="seguimiento" className="flex flex-col gap-4">
            <ConvocationTrackingTable convocationId={convocationId} />
          </TabsContent>
        </Tabs>
      ) : null}
    </PageFrame>
  )
}
