"use client"

import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { type CoordinationHistoryItem } from "@/api/reviews"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { goBack } from "@/lib/goBack"
import { openRevisionPdf } from "@/lib/openPdf"
import { queryErrorMessage, sameKey } from "@/lib/queryClient"
import { paths } from "@/lib/routes"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { coordinationHistoryQuery } from "@/queries/reviews"

type Filters = { q: string; period: string }

const NO_FILTERS: Filters = { q: "", period: "all" }

const formatApprovedAt = (value: string | null): string => (value ? formatDateDisplay(value, { dateStyle: "medium" }) : "—")

export default function CoordinationHistoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return { filters: { q: queryText(query.q), period: queryText(query.period) || "all" }, page: queryPage(query.page) }
  })
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [applied, setApplied] = useState(initial)
  const query = useQuery({ ...coordinationHistoryQuery(applied.page, applied.filters), placeholderData: keepPreviousData })
  const data = query.data ?? null
  const loading = query.isFetching
  const periodRejected = query.error instanceof ApiError && query.error.status === 422 && applied.filters.period !== "all"
  const error = periodRejected ? null : queryErrorMessage(query, "No se pudo cargar el historial")
  const [openingPdf, setOpeningPdf] = useState<string | null>(null)
  const filtersActive = filters.q !== "" || filters.period !== "all"
  const groups = useMemo(() => {
    const byPeriod = new Map<string, CoordinationHistoryItem[]>()
    for (const item of data?.syllabi.data ?? []) byPeriod.set(item.period, [...(byPeriod.get(item.period) ?? []), item])

    return [...byPeriod.entries()].map(([period, items]) => ({ period, items }))
  }, [data])

  if (periodRejected) {
    const reset = { ...applied.filters, period: "all" }
    setFilters(reset)
    setApplied({ page: applied.page, filters: reset })
  }

  useEffect(() => {
    if (query.isPlaceholderData || !query.data) return
    syncFilters(router, { q: applied.filters.q, period: applied.filters.period }, applied.page)
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
    setFilters(NO_FILTERS)
    void load(1, NO_FILTERS)
  }

  const open = (item: CoordinationHistoryItem): void => router.push(paths.coordination.review(item.revision_id))

  const openPdf = async (item: CoordinationHistoryItem): Promise<void> => {
    setOpeningPdf(item.revision_id)
    const failure = await openRevisionPdf(item.revision_id)
    setOpeningPdf(null)
    if (failure) toast.error(failure)
  }

  return (
    <PageFrame
      title="Historial"
      description="Sílabos aprobados de períodos anteriores de su carrera, en solo lectura"
      size="wide"
      loading={!data && !error}
      eyebrow={
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => goBack(router, paths.coordination.reviews)}>
          <ArrowLeft aria-hidden="true" />
          Volver a revisión
        </Button>
      }
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : loading && !data ? (
        <LoadingSkeleton variant="table" columns={6} filters={1} actions={false} />
      ) : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <form onSubmit={submit}>
            <FilterToolbar
              active={filtersActive}
              onClear={clearFilters}
              search={
                <Field>
                  <FieldLabel htmlFor="coordination-history-search" className="sr-only">
                    Buscar por asignatura o código
                  </FieldLabel>
                  <Input
                    id="coordination-history-search"
                    value={filters.q}
                    type="search"
                    maxLength={120}
                    placeholder="Buscar por asignatura o código"
                    onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                  />
                </Field>
              }
              filters={
                <Field>
                  <FieldLabel htmlFor="coordination-history-period" className="sr-only">
                    Período
                  </FieldLabel>
                  <Select value={filters.period} name="period" onValueChange={(period) => setFilters((current) => ({ ...current, period }))}>
                    <SelectTrigger id="coordination-history-period">
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
              }
            />
          </form>
          {groups.length === 0 ? (
            <Table label="Historial de Coordinación">
              <TableBody>
                <TableEmpty colSpan={6}>No hay sílabos aprobados de períodos anteriores con estos filtros</TableEmpty>
              </TableBody>
            </Table>
          ) : null}
          {groups.map((group) => (
            <div key={group.period} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Período {group.period}</h2>
              <Table label={`Sílabos aprobados del período ${group.period}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asignatura</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Paralelos</TableHead>
                    <TableHead>Elaborado por</TableHead>
                    <TableHead>Aprobado</TableHead>
                    <TableHead className="w-12 text-center">
                      <span className="sr-only">PDF</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow
                      key={item.revision_id}
                      className="cursor-pointer"
                      onClick={(event) => activateRow(event.nativeEvent, () => open(item))}
                    >
                      <TableCell>
                        <Link href={paths.coordination.review(item.revision_id)} className={rowLinkClass}>{item.subject}</Link>
                        <TableCardLine>
                          {item.code} · {item.parallels.length === 1 ? "Paralelo" : "Paralelos"} {item.parallels.join(", ")}
                        </TableCardLine>
                      </TableCell>
                      <TableCell data-card-hide="true">{item.code}</TableCell>
                      <TableCell data-card-hide="true">{item.parallels.join(", ")}</TableCell>
                      <TableCell>{item.author ?? "—"}</TableCell>
                      <TableCell>{formatApprovedAt(item.approved_at)}</TableCell>
                      <TableCell className="text-center" data-card-no-label="true">
                        <IconTooltip label="Ver PDF">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Ver PDF de ${item.subject}`}
                            disabled={openingPdf === item.revision_id}
                            onClick={() => void openPdf(item)}
                          >
                            {openingPdf === item.revision_id ? <Spinner /> : <FileText aria-hidden="true" />}
                          </Button>
                        </IconTooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          <TablePagination meta={data.syllabi} label="Paginación del historial" onPageChange={(page) => void load(page)} />
        </div>
      ) : null}
    </PageFrame>
  )
}
