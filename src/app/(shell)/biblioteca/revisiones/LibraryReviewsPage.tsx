"use client"

import { History } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { getDashboard, type Dashboard } from "@/api/dashboard"
import { getLibraryReviews, type LibraryReviewsPage as ReviewsPayload } from "@/api/library"
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
import { useLatestRequest } from "@/lib/latestRequest"
import { rememberLibraryFaculty, savedLibraryFaculty } from "@/lib/libraryFaculty"
import { LIBRARY_STATE_FILTERS, libraryStatus, libraryStatusLabel, libraryStatusTone } from "@/lib/libraryStates"
import { paths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"
import { cn } from "@/lib/utils"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"

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
  const requests = useLatestRequest()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return {
      filters: { q: queryText(query.q), state: queryText(query.state) || "all", faculty: queryText(query.faculty) || savedLibraryFaculty() || "all" },
      page: queryPage(query.page),
    }
  })
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [data, setData] = useState<ReviewsPayload | null>(null)
  const [summary, setSummary] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filtersActive = filters.q !== "" || filters.state !== "all" || filters.faculty !== "all"
  const periods = [...new Set((data?.reviews.data ?? []).map((item) => item.period))]
  const title = periods.length === 1 ? `Revisiones de biblioteca - Período ${periods[0]}` : "Revisiones de biblioteca"

  const fetchReviews = useCallback(
    (page: number, start: Filters, withSummary: boolean): Promise<void> => {
      const run = async (current: Filters): Promise<void> => {
        const ticket = requests.begin()
        try {
          const [reviews, dashboard] = await Promise.all([
            getLibraryReviews({ q: current.q, state: current.state, faculty: current.faculty, page }),
            withSummary ? getDashboard().catch(() => null) : undefined,
          ])
          if (!requests.isCurrent(ticket)) return
          setData(reviews)
          if (withSummary) setSummary(dashboard ?? null)
          rememberLibraryFaculty(current.faculty)
          syncFilters(router, { q: current.q, state: current.state, faculty: current.faculty }, page)
        } catch (reason) {
          if (!requests.isCurrent(ticket)) return
          if (reason instanceof ApiError && reason.status === 422 && current.faculty !== "all") {
            const reset = { ...current, faculty: "all" }
            setFilters(reset)
            rememberLibraryFaculty(reset.faculty)
            await run(reset)
            return
          }
          setError(reason instanceof ApiError ? reason.message : "No se pudieron cargar las revisiones de biblioteca")
        } finally {
          if (requests.isCurrent(ticket)) setLoading(false)
        }
      }

      return run(start)
    },
    [requests, router],
  )

  useEffect(() => {
    void fetchReviews(initial.page, initial.filters, true)
  }, [fetchReviews, initial])

  const load = (page = 1, current: Filters = filters, withSummary = false): Promise<void> => {
    setLoading(true)
    setError(null)
    return fetchReviews(page, current, withSummary)
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
