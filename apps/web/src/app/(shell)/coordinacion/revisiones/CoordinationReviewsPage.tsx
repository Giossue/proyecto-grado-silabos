"use client"

import { ChartNoAxesColumn, History, Inbox } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { ConvocationActions } from "@/components/domain/syllabus/ConvocationActions"
import { ConvocationTrackingTable } from "@/components/domain/syllabus/ConvocationTrackingTable"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { serverSortOf, useServerSort, type ServerSortColumns, type ServerSortState } from "@/composables/useServerSort"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { queryErrorMessage, sameKey } from "@/lib/queryClient"
import { paths, reviewAreaPaths } from "@/lib/routes"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { dashboardSummaryQuery } from "@/queries/dashboard"
import { coordinationQueueQuery } from "@/queries/reviews"
import { deadlineState } from "@/state/deadline"
import { setupChecklistState } from "@/state/setupChecklist"

type Tab = "cola" | "seguimiento"

const SORT_COLUMNS = {
  subject: { label: "Asignatura" },
  teacher: { label: "Docente" },
  revision: { label: "Revisión", type: "number" },
  submitted: { label: "Enviado", type: "date" },
} satisfies ServerSortColumns

const submittedOn = (value: string | null): string => (value ? formatDateDisplay(value, { dateStyle: "medium" }) : "—")

export default function CoordinationReviewsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)

    return {
      page: queryPage(query.page),
      search: queryText(query.search),
      sort: serverSortOf(SORT_COLUMNS, queryText(query.sort), queryText(query.dir)),
      tab: (queryText(query.tab) === "seguimiento" ? "seguimiento" : "cola") as Tab,
    }
  })
  const [applied, setApplied] = useState({ page: initial.page, search: initial.search, sort: initial.sort })
  const [sorting, setSorting] = useState<ServerSortState>(initial.sort)
  const reviews = useQuery({ ...coordinationQueueQuery(applied.page, applied.search, applied.sort), placeholderData: keepPreviousData })
  const summaryQuery = useQuery(dashboardSummaryQuery())
  const data = reviews.data ?? null
  const summary = summaryQuery.data ?? null
  const loading = reviews.isFetching
  const error = queryErrorMessage(reviews, "No se pudo cargar la cola de revisión")
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [search, setSearch] = useState(initial.search)
  const filtersActive = search !== ""
  const area = reviewAreaPaths()
  const convocationId = summary?.coordination_convocation?.convocation_id ?? null

  useEffect(() => {
    if (summary?.setup !== undefined) setupChecklistState.update(summary.setup)
  }, [summary])

  useEffect(() => {
    if (reviews.isPlaceholderData || reviews.data === undefined) return
    if (reviews.data === null) {
      router.replace(paths.dashboard)
      return
    }
    syncFilters(router, { search: applied.search, ...applied.sort, tab: tab === "seguimiento" ? "seguimiento" : "" }, applied.page)
  }, [applied, reviews.data, reviews.isPlaceholderData, router, tab])

  const load = (page = 1, withSummary = false, currentSearch = search, currentSort = sorting): Promise<void> => {
    if (withSummary) void summaryQuery.refetch()
    const next = { page, search: currentSearch, sort: currentSort }
    if (sameKey(next, applied)) return reviews.refetch().then(() => undefined)
    setApplied(next)
    return Promise.resolve()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void load()
  }

  const clearFilters = (): void => {
    setSearch("")
    void load(1, false, "")
  }

  const sort = useServerSort({
    columns: SORT_COLUMNS,
    value: sorting,
    total: data?.syllabi.total,
    onSort: (next) => {
      setSorting(next)
      void load(1, false, search, next)
    },
    onChoose: setSorting,
  })

  const changed = async (message: string): Promise<void> => {
    toast.success(message)
    await Promise.all([summaryQuery.refetch(), deadlineState.load()])
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

  return (
    <PageFrame
      title="Revisión"
      description="Lo que envían los docentes de su carrera y el avance de cada sílabo"
      size="wide"
      loading={!data && !error}
      actionsSkeleton={loading && !data ? ["w-48"] : []}
      tools={
        <Button asChild variant="outline" data-labeled-tool className="max-sm:size-9 max-sm:has-[>svg]:px-0">
          <Link href={paths.coordination.periodHistory} aria-label="Historial">
            <History aria-hidden="true" />
            <span className="max-sm:sr-only">Historial</span>
          </Link>
        </Button>
      }
      actions={summary?.coordination_convocation ? <ConvocationActions convocation={summary.coordination_convocation} onChanged={(message) => void changed(message)} /> : null}
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
                filters={<SortSelect sort={sort} inputId="review-sort" />}
              />
            </form>
            <SortStatus sort={sort} />
            <Table label="Revisiones de coordinación">
              <TableHeader>
                <TableRow>
                  <SortableHead sort={sort} column="subject">
                    Asignatura
                  </SortableHead>
                  <SortableHead sort={sort} column="teacher">
                    Docente
                  </SortableHead>
                  <SortableHead sort={sort} column="revision" className="text-center">
                    Revisión
                  </SortableHead>
                  <SortableHead sort={sort} column="submitted" className="text-center">
                    Enviado
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.syllabi.data.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={(event) => activateRow(event.nativeEvent, () => openReview(item.revision_id))}
                  >
                    <TableCell>
                      <div>
                        <Link href={area.review(item.revision_id)} className={rowLinkClass}>{item.subject}</Link>
                      </div>
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
