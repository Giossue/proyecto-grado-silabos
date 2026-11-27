"use client"

import { History } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { MetricTiles } from "@/components/domain/MetricTiles"
import { PageFrame } from "@/components/domain/PageFrame"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { serverSortOf, useServerSort, type ServerSortColumns, type ServerSortState } from "@/composables/useServerSort"
import { rememberLibraryFaculty, savedLibraryFaculty } from "@/lib/libraryFaculty"
import { LIBRARY_STATE_FILTERS, libraryStage, libraryStatus, libraryStatusLabel, libraryStatusTone } from "@silabos/shared/lib/libraryStates"
import { queryErrorMessage, sameKey } from "@/lib/queryClient"
import { paths } from "@/lib/routes"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"
import { cn } from "@/lib/utils"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { dashboardSummaryQuery } from "@/queries/dashboard"
import { libraryReviewsQuery } from "@/queries/library"

type Filters = { q: string; state: string; faculty: string; sort: string; dir: string }

const NO_FILTERS: Filters = { q: "", state: "all", faculty: "all", sort: "", dir: "" }

const SORT_COLUMNS = {
  career: { label: "Carrera" },
  faculty: { label: "Facultad" },
  subject: { label: "Asignatura" },
  responsible: { label: "Responsable" },
  state: { label: "Estado" },
} satisfies ServerSortColumns

const STATE_OPTIONS = Object.entries(LIBRARY_STATE_FILTERS).map(([value, label]) => ({ value, label }))

export default function LibraryReviewsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return {
      filters: {
        q: queryText(query.q),
        state: queryText(query.state) || "all",
        faculty: queryText(query.faculty) || savedLibraryFaculty() || "all",
        ...serverSortOf(SORT_COLUMNS, queryText(query.sort), queryText(query.dir)),
      },
      page: queryPage(query.page),
    }
  })
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [applied, setApplied] = useState(initial)
  const query = useQuery({ ...libraryReviewsQuery(applied.page, applied.filters), placeholderData: keepPreviousData })
  const summaryQuery = useQuery(dashboardSummaryQuery())
  const data = query.data ?? null
  const summary = summaryQuery.data ?? null
  const loading = query.isFetching
  const facultyRejected = query.error instanceof ApiError && query.error.status === 422 && applied.filters.faculty !== "all"
  const error = facultyRejected ? null : queryErrorMessage(query, "No se pudieron cargar las revisiones de biblioteca")
  const filtersActive = filters.q !== "" || filters.state !== "all" || filters.faculty !== "all"
  const periods = [...new Set((data?.reviews.data ?? []).map((item) => item.period))]
  const title = periods.length === 1 ? `Revisiones de biblioteca - Período ${periods[0]}` : "Revisiones de biblioteca"

  if (facultyRejected) {
    const reset = { ...applied.filters, faculty: "all" }
    setFilters(reset)
    setApplied({ page: applied.page, filters: reset })
  }

  useEffect(() => {
    if (query.isPlaceholderData || !query.data) return
    rememberLibraryFaculty(applied.filters.faculty)
    syncFilters(router, applied.filters, applied.page)
  }, [applied, query.data, query.isPlaceholderData, router])

  const load = (page = 1, current: Filters = filters, withSummary = false): Promise<void> => {
    if (withSummary) void summaryQuery.refetch()
    const next = { page, filters: current }
    if (sameKey(next, applied)) return query.refetch().then(() => undefined)
    setApplied(next)
    return Promise.resolve()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void load()
  }

  const clearFilters = (): void => {
    const cleared = { ...NO_FILTERS, sort: filters.sort, dir: filters.dir }
    setFilters(cleared)
    void load(1, cleared)
  }

  const applySort = (next: ServerSortState): void => {
    const current = { ...filters, ...next }
    setFilters(current)
    void load(1, current)
  }

  const sort = useServerSort({
    columns: SORT_COLUMNS,
    value: filters,
    total: data?.reviews.total,
    onSort: applySort,
    onChoose: (next) => setFilters((current) => ({ ...current, ...next })),
  })

  const open = (revision: string): void => router.push(paths.library.review(revision))
  const firstLoad = !data && !error

  return (
    <PageFrame
      title={title}
      description="Bibliografía de los sílabos enviados"
      size="wide"
      loading={firstLoad}
      actionsSkeleton={firstLoad ? ["w-28"] : []}
      tools={
        <Button asChild variant="outline" data-labeled-tool className="max-sm:size-9 max-sm:has-[>svg]:px-0">
          <Link href={paths.library.history} aria-label="Historial">
            <History aria-hidden="true" />
            <span className="max-sm:sr-only">Historial</span>
          </Link>
        </Button>
      }
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load(1, filters, true)} />
      ) : loading && !data ? (
        <LoadingSkeleton variant="table" columns={5} filters={2} actions={false} badges={[5]} metrics />
      ) : null}
      {data && summary?.metrics.length ? <MetricTiles metrics={summary.metrics} /> : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <form onSubmit={submit}>
            <FilterToolbar
              active={filtersActive}
              onClear={clearFilters}
              search={
                <Field>
                  <FieldLabel htmlFor="library-search" className="sr-only">
                    Buscar por asignatura, código, carrera o docente
                  </FieldLabel>
                  <Input
                    id="library-search"
                    value={filters.q}
                    type="search"
                    maxLength={120}
                    placeholder="Buscar por asignatura, código, carrera o docente"
                    onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                  />
                </Field>
              }
              filters={
                <>
                  <Field>
                    <FieldLabel htmlFor="library-faculty" className="sr-only">
                      Facultad
                    </FieldLabel>
                    <Select value={filters.faculty} name="faculty" onValueChange={(faculty) => setFilters((current) => ({ ...current, faculty }))}>
                      <SelectTrigger id="library-faculty">
                        <SelectValue placeholder="Todas las facultades" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Todas las facultades</SelectItem>
                          {(data.faculties ?? []).map((faculty) => (
                            <SelectItem key={faculty.id} value={faculty.id}>
                              {faculty.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="library-state" className="sr-only">
                      Estado
                    </FieldLabel>
                    <Select value={filters.state} name="state" onValueChange={(state) => setFilters((current) => ({ ...current, state }))}>
                      <SelectTrigger id="library-state">
                        <SelectValue placeholder="Todos los estados" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Todos los estados</SelectItem>
                          {STATE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <SortSelect sort={sort} inputId="library-sort" />
                </>
              }
            />
          </form>
          <SortStatus sort={sort} />
          <Table label="Revisiones de biblioteca">
            <TableHeader>
              <TableRow>
                <SortableHead sort={sort} column="career">
                  Carrera
                </SortableHead>
                <SortableHead sort={sort} column="faculty">
                  Facultad
                </SortableHead>
                <SortableHead sort={sort} column="subject">
                  Asignatura
                </SortableHead>
                <SortableHead sort={sort} column="responsible">
                  Responsable
                </SortableHead>
                <SortableHead sort={sort} column="state" className="text-center">
                  Estado
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reviews.data.map((item) => {
                const status = libraryStatus(item)

                return (
                  <TableRow
                    key={item.revision_id}
                    className="cursor-pointer"
                    onClick={(event) => activateRow(event.nativeEvent, () => open(item.revision_id))}
                  >
                    <TableCell data-card-hide="true">{item.career}</TableCell>
                    <TableCell data-card-hide="true">{item.faculty ?? "—"}</TableCell>
                    <TableCell>
                      <Link href={paths.library.review(item.revision_id)} className={rowLinkClass}>{item.subject}</Link>
                      <TableCardLine>
                        {item.career}
                        {item.faculty ? ` · ${item.faculty}` : ""}
                      </TableCardLine>
                      <TableCardLine>
                        <StatusBadge label={libraryStatusLabel(status)} tone={libraryStatusTone(status)} />
                        {libraryStage(item) ? ` ${libraryStage(item)}` : ""}
                      </TableCardLine>
                    </TableCell>
                    <TableCell className={cn(!item.responsible && "text-muted-foreground")}>{item.responsible ?? "Sin asignar"}</TableCell>
                    <TableCell className="text-center" data-card-hide="true">
                      <StatusBadge label={libraryStatusLabel(status)} tone={libraryStatusTone(status)} />
                      {libraryStage(item) ? <span className="mt-1 block text-xs text-muted-foreground">{libraryStage(item)}</span> : null}
                    </TableCell>
                  </TableRow>
                )
              })}
              {data.reviews.data.length === 0 ? <TableEmpty colSpan={5}>No hay sílabos por revisar</TableEmpty> : null}
            </TableBody>
          </Table>
          <TablePagination meta={data.reviews} label="Paginación de revisiones de biblioteca" onPageChange={(page) => void load(page)} />
        </div>
      ) : null}
    </PageFrame>
  )
}
