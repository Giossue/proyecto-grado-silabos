"use client"

import { History } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { MetricTiles } from "@/components/domain/MetricTiles"
import { PageFrame } from "@/components/domain/PageFrame"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { rememberLibraryFaculty, savedLibraryFaculty } from "@/lib/libraryFaculty"
import { LIBRARY_STATE_FILTERS, libraryStatus, libraryStatusLabel, libraryStatusTone } from "@/lib/libraryStates"
import { queryErrorMessage, sameKey } from "@/lib/queryClient"
import { paths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"
import { cn } from "@/lib/utils"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { dashboardSummaryQuery } from "@/queries/dashboard"
import { libraryReviewsQuery } from "@/queries/library"

type Filters = { q: string; state: string; faculty: string }

const NO_FILTERS: Filters = { q: "", state: "all", faculty: "all" }

const STATE_OPTIONS = Object.entries(LIBRARY_STATE_FILTERS).map(([value, label]) => ({ value, label }))

const activateWithKey = (event: KeyboardEvent<HTMLTableRowElement>, action: () => void): void => {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
  event.preventDefault()
  action()
}

export default function LibraryReviewsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return {
      filters: { q: queryText(query.q), state: queryText(query.state) || "all", faculty: queryText(query.faculty) || savedLibraryFaculty() || "all" },
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
    syncFilters(router, { q: applied.filters.q, state: applied.filters.state, faculty: applied.filters.faculty }, applied.page)
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
    setFilters(NO_FILTERS)
    void load(1, NO_FILTERS)
  }

  const open = (revision: string): void => router.push(paths.library.review(revision))
  const firstLoad = !data && !error

  return (
    <PageFrame
      title={title}
      description="Bibliografía de los sílabos enviados"
      size="wide"
      loading={firstLoad}
      actionsSkeleton={firstLoad ? ["w-9"] : []}
      tools={
        <IconTooltip label="Historial">
          <Button asChild variant="ghost" size="icon">
            <Link href={paths.library.history} aria-label="Historial">
              <History aria-hidden="true" />
            </Link>
          </Button>
        </IconTooltip>
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
                </>
              }
            />
          </form>
          <Table label="Revisiones de biblioteca">
            <TableHeader>
              <TableRow>
                <TableHead>Facultad</TableHead>
                <TableHead>Carrera</TableHead>
                <TableHead>Asignatura</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reviews.data.map((item) => {
                const status = libraryStatus(item)

                return (
                  <TableRow
                    key={item.revision_id}
                    className="cursor-pointer"
                    tabIndex={0}
                    aria-label={`Abrir revisión de ${item.subject}`}
                    onClick={(event) => activateRow(event.nativeEvent, () => open(item.revision_id))}
                    onKeyDown={(event) => activateWithKey(event, () => open(item.revision_id))}
                  >
                    <TableCell data-card-hide="true">{item.faculty ?? "—"}</TableCell>
                    <TableCell data-card-hide="true">{item.career}</TableCell>
                    <TableCell>
                      {item.subject}
                      <TableCardLine>
                        {item.faculty ? `${item.faculty} · ` : ""}
                        {item.career}
                      </TableCardLine>
                      <TableCardLine>
                        <StatusBadge label={libraryStatusLabel(status)} tone={libraryStatusTone(status)} />
                      </TableCardLine>
                    </TableCell>
                    <TableCell className={cn(!item.responsible && "text-muted-foreground")}>{item.responsible ?? "Sin asignar"}</TableCell>
                    <TableCell className="text-center" data-card-hide="true">
                      <StatusBadge label={libraryStatusLabel(status)} tone={libraryStatusTone(status)} />
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
