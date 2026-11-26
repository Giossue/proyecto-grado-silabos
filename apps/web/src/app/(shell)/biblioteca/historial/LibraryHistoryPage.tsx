"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { serverSortOf, useServerSort, type ServerSortColumns, type ServerSortState } from "@/composables/useServerSort"
import { goBack } from "@/lib/goBack"
import { queryErrorMessage, sameKey } from "@/lib/queryClient"
import { libraryHistoryQuery } from "@/queries/library"
import { rememberLibraryFaculty, savedLibraryFaculty } from "@/lib/libraryFaculty"
import { paths } from "@/lib/routes"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"

type Filters = { q: string; faculty: string; period: string; who: string; sort: string; dir: string }

const NO_FILTERS: Filters = { q: "", faculty: "all", period: "all", who: "all", sort: "", dir: "" }

const SORT_COLUMNS = {
  period: { label: "Período", type: "date" },
  career: { label: "Carrera" },
  teacher: { label: "Docente" },
  signed: { label: "Firmado por" },
} satisfies ServerSortColumns

export default function LibraryHistoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return {
      filters: {
        q: queryText(query.q),
        faculty: queryText(query.faculty) || savedLibraryFaculty() || "all",
        period: queryText(query.period) || "all",
        who: query.mine === "1" ? "mine" : "all",
        ...serverSortOf(SORT_COLUMNS, queryText(query.sort), queryText(query.dir)),
      },
      page: queryPage(query.page),
    }
  })
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [applied, setApplied] = useState(initial)
  const query = useQuery({ ...libraryHistoryQuery(applied.page, applied.filters), placeholderData: keepPreviousData })
  const data = query.data ?? null
  const loading = query.isFetching
  const filterRejected = query.error instanceof ApiError && query.error.status === 422 && (applied.filters.faculty !== "all" || applied.filters.period !== "all")
  const error = filterRejected ? null : queryErrorMessage(query, "No se pudo cargar el historial de biblioteca")
  const filtersActive = filters.q !== "" || filters.faculty !== "all" || filters.period !== "all" || filters.who !== "all"

  if (filterRejected) {
    const reset = { ...applied.filters, faculty: "all", period: "all" }
    setFilters(reset)
    setApplied({ page: applied.page, filters: reset })
  }

  useEffect(() => {
    if (query.isPlaceholderData || !query.data) return
    const current = applied.filters
    rememberLibraryFaculty(current.faculty)
    syncFilters(router, { q: current.q, faculty: current.faculty, period: current.period, mine: current.who === "mine" ? "1" : "", sort: current.sort, dir: current.dir }, applied.page)
  }, [applied, query.data, query.isPlaceholderData, router])

  const load = (page = 1, current: Filters = filters): Promise<void> => {
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

  return (
    <PageFrame
      title="Historial"
      description="Sílabos de periodos académicos anteriores, en solo lectura"
      size="wide"
      loading={!data && !error}
      eyebrow={
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => goBack(router, paths.library.reviews)}>
          <ArrowLeft aria-hidden="true" />
          Volver a revisiones
        </Button>
      }
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : loading && !data ? (
        <LoadingSkeleton variant="table" columns={4} filters={3} actions={false} />
      ) : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <form onSubmit={submit}>
            <FilterToolbar
              active={filtersActive}
              onClear={clearFilters}
              search={
                <Field>
                  <FieldLabel htmlFor="library-history-search" className="sr-only">
                    Buscar por asignatura, código, carrera o docente
                  </FieldLabel>
                  <Input
                    id="library-history-search"
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
                    <FieldLabel htmlFor="library-history-who" className="sr-only">
                      Revisados por
                    </FieldLabel>
                    <Select value={filters.who} name="who" onValueChange={(who) => setFilters((current) => ({ ...current, who }))}>
                      <SelectTrigger id="library-history-who">
                        <SelectValue placeholder="Toda la biblioteca" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Toda la biblioteca</SelectItem>
                          <SelectItem value="mine">Solo los míos</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="library-history-period" className="sr-only">
                      Período
                    </FieldLabel>
                    <Select value={filters.period} name="period" onValueChange={(period) => setFilters((current) => ({ ...current, period }))}>
                      <SelectTrigger id="library-history-period">
                        <SelectValue placeholder="Todos los períodos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Todos los períodos</SelectItem>
                          {data.periods.map((period) => (
                            <SelectItem key={period.id} value={period.id}>
                              {period.code}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="library-history-faculty" className="sr-only">
                      Facultad
                    </FieldLabel>
                    <Select value={filters.faculty} name="faculty" onValueChange={(faculty) => setFilters((current) => ({ ...current, faculty }))}>
                      <SelectTrigger id="library-history-faculty">
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
                  <SortSelect sort={sort} inputId="library-history-sort" />
                </>
              }
            />
          </form>
          <SortStatus sort={sort} />
          <Table label="Historial de biblioteca">
            <TableHeader>
              <TableRow>
                <SortableHead sort={sort} column="period">
                  Período
                </SortableHead>
                <SortableHead sort={sort} column="career">
                  Carrera
                </SortableHead>
                <SortableHead sort={sort} column="teacher">
                  Docente
                </SortableHead>
                <SortableHead sort={sort} column="signed">
                  Firmado por
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reviews.data.map((item) => (
                <TableRow
                  key={item.revision_id}
                  className="cursor-pointer"
                  onClick={(event) => activateRow(event.nativeEvent, () => open(item.revision_id))}
                >
                  <TableCell>
                    <Link href={paths.library.review(item.revision_id)} className={rowLinkClass}>
                      {item.period}
                      <span className="sr-only"> · {item.subject}</span>
                    </Link>
                    <TableCardLine>
                      {item.career} · {item.teachers.join(", ")}
                    </TableCardLine>
                  </TableCell>
                  <TableCell data-card-hide="true">{item.career}</TableCell>
                  <TableCell data-card-hide="true">{item.teachers.join(", ")}</TableCell>
                  <TableCell>{item.signed_by ?? "—"}</TableCell>
                </TableRow>
              ))}
              {data.reviews.data.length === 0 ? (
                <TableEmpty colSpan={4}>
                  {filters.who === "mine" ? "No hay sílabos revisados por usted con estos filtros" : "No hay sílabos de periodos académicos anteriores con estos filtros"}
                </TableEmpty>
              ) : null}
            </TableBody>
          </Table>
          <TablePagination meta={data.reviews} label="Paginación del historial de biblioteca" onPageChange={(page) => void load(page)} />
        </div>
      ) : null}
    </PageFrame>
  )
}
