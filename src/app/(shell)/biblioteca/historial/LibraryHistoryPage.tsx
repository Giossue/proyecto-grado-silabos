"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { getLibraryHistory, type LibraryHistoryPage as HistoryPayload } from "@/api/library"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { goBack } from "@/lib/goBack"
import { useLatestRequest } from "@/lib/latestRequest"
import { rememberLibraryFaculty, savedLibraryFaculty } from "@/lib/libraryFaculty"
import { paths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"

type Filters = { q: string; faculty: string; period: string; who: string }

const NO_FILTERS: Filters = { q: "", faculty: "all", period: "all", who: "all" }

const activateWithKey = (event: KeyboardEvent<HTMLTableRowElement>, action: () => void): void => {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
  event.preventDefault()
  action()
}

export default function LibraryHistoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requests = useLatestRequest()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return {
      filters: {
        q: queryText(query.q),
        faculty: queryText(query.faculty) || savedLibraryFaculty() || "all",
        period: queryText(query.period) || "all",
        who: query.mine === "1" ? "mine" : "all",
      },
      page: queryPage(query.page),
    }
  })
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [data, setData] = useState<HistoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filtersActive = filters.q !== "" || filters.faculty !== "all" || filters.period !== "all" || filters.who !== "all"

  const fetchHistory = useCallback(
    (page: number, start: Filters): Promise<void> => {
      const run = async (current: Filters): Promise<void> => {
        const ticket = requests.begin()
        try {
          const response = await getLibraryHistory({ q: current.q, faculty: current.faculty, period: current.period, mine: current.who === "mine", page })
          if (!requests.isCurrent(ticket)) return
          setData(response)
          rememberLibraryFaculty(current.faculty)
          syncFilters(router, { q: current.q, faculty: current.faculty, period: current.period, mine: current.who === "mine" ? "1" : "" }, page)
        } catch (reason) {
          if (!requests.isCurrent(ticket)) return
          if (reason instanceof ApiError && reason.status === 422 && (current.faculty !== "all" || current.period !== "all")) {
            const reset = { ...current, faculty: "all", period: "all" }
            setFilters(reset)
            rememberLibraryFaculty(reset.faculty)
            await run(reset)
            return
          }
          setError(reason instanceof ApiError ? reason.message : "No se pudo cargar el historial de biblioteca")
        } finally {
          if (requests.isCurrent(ticket)) setLoading(false)
        }
      }

      return run(start)
    },
    [requests, router],
  )

  useEffect(() => {
    void fetchHistory(initial.page, initial.filters)
  }, [fetchHistory, initial])

  const load = (page = 1, current: Filters = filters): Promise<void> => {
    setLoading(true)
    setError(null)
    return fetchHistory(page, current)
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

  return (
    <PageFrame
      title="Historial"
      description="Sílabos de convocatorias anteriores, en solo lectura"
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
                </>
              }
            />
          </form>
          <Table label="Historial de biblioteca">
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Carrera</TableHead>
                <TableHead>Docente</TableHead>
                <TableHead>Firmado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reviews.data.map((item) => (
                <TableRow
                  key={item.revision_id}
                  className="cursor-pointer"
                  tabIndex={0}
                  aria-label={`Abrir revisión de ${item.subject}`}
                  onClick={(event) => activateRow(event.nativeEvent, () => open(item.revision_id))}
                  onKeyDown={(event) => activateWithKey(event, () => open(item.revision_id))}
                >
                  <TableCell>
                    {item.period}
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
                  {filters.who === "mine" ? "No hay sílabos revisados por usted con estos filtros" : "No hay sílabos de convocatorias anteriores con estos filtros"}
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
