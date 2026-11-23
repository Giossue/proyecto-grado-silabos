"use client"

import { Download } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { downloadAuditWorkbook, getAuditEvents, type AuditPayload } from "@/api/operations"
import { getSession } from "@/api/session"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { useLatestRequest } from "@/lib/latestRequest"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"

type Option = { value: string; label: string }
type FilterKey = "period" | "role" | "career" | "action" | "result" | "technical"
type AuditFilters = Record<FilterKey, string>

const FILTER_KEYS: FilterKey[] = ["period", "role", "career", "action", "result", "technical"]
const NO_FILTERS: AuditFilters = { period: "all", role: "all", career: "all", action: "all", result: "all", technical: "all" }
const RESULTS: Option[] = [
  { value: "exito", label: "Exitoso" },
  { value: "fallido", label: "Fallido" },
]
const TECHNICAL: Option[] = [{ value: "1", label: "Incluir actividad técnica" }]

const appliedFilters = (filters: AuditFilters): Record<string, string> => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "all"))

const detailLine = (details: Array<{ label: string; value: string | number | boolean }>): string =>
  details.map((detail) => `${detail.label}: ${typeof detail.value === "boolean" ? (detail.value ? "Sí" : "No") : detail.value}`).join(" · ")

const formatDate = (value: string): string => formatDateDisplay(value, { dateStyle: "medium", timeStyle: "medium" })

export default function AdminAuditPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requests = useLatestRequest()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)

    return {
      page: queryPage(query.page),
      filters: Object.fromEntries(FILTER_KEYS.map((key) => [key, queryText(query[key]) || "all"])) as AuditFilters,
    }
  })
  const [filters, setFilters] = useState<AuditFilters>(initial.filters)
  const [data, setData] = useState<AuditPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const filtersActive = Object.values(filters).some((value) => value !== "all")

  const fetchEvents = useCallback(
    (page: number, current: AuditFilters): Promise<void> => {
      const ticket = requests.begin()
      const isCurrent = (): boolean => requests.isCurrent(ticket)

      return getSession()
        .then(async (session) => {
          if (!isCurrent()) return
          if (session.active_role?.code !== "administrador") {
            router.replace(paths.dashboard)
            return
          }
          const response = await getAuditEvents({ ...appliedFilters(current), page: String(page) })
          if (!isCurrent()) return
          setData(response)
          syncFilters(router, current, page)
        })
        .catch((reason: unknown) => {
          if (isCurrent()) setError(reason instanceof ApiError ? reason.message : "No se pudo cargar la auditoría")
        })
        .finally(() => {
          if (isCurrent()) setLoading(false)
        })
    },
    [requests, router],
  )

  useEffect(() => {
    void fetchEvents(initial.page, initial.filters)
  }, [fetchEvents, initial])

  const load = (page = 1, current: AuditFilters = filters): Promise<void> => {
    setLoading(true)
    setError(null)
    return fetchEvents(page, current)
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void load()
  }

  const clearFilters = (): void => {
    setFilters(NO_FILTERS)
    void load(1, NO_FILTERS)
  }

  const exportWorkbook = async (): Promise<void> => {
    setExporting(true)
    try {
      const period = data?.period_options.find((option) => option.value === filters.period)?.label
      await downloadAuditWorkbook(appliedFilters(filters), `auditoria-${(period ?? new Date().toISOString().slice(0, 10)).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo exportar la auditoría")
    } finally {
      setExporting(false)
    }
  }

  const filterFields: Array<{ key: FilterKey; label: string; all: string; options: Option[] }> = data
    ? [
        { key: "period", label: "Período", all: "Todos los períodos", options: data.period_options },
        { key: "role", label: "Rol", all: "Todos los roles", options: data.role_options },
        { key: "career", label: "Carrera", all: "Todas las carreras", options: data.career_options },
        { key: "action", label: "Actividad", all: "Todas las actividades", options: data.action_options },
        { key: "result", label: "Resultado", all: "Todos los resultados", options: RESULTS },
        { key: "technical", label: "Tipo de actividad", all: "Solo lo importante", options: TECHNICAL },
      ]
    : []

  return (
    <PageFrame
      title="Auditoría"
      description="Registro de las acciones realizadas en el sistema"
      size="wide"
      loading={loading && !data && !error}
      actions={
        data ? (
          <Button type="button" variant="success" disabled={exporting} onClick={() => void exportWorkbook()}>
            {exporting ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden="true" />}
            Exportar a Excel
          </Button>
        ) : null
      }
    >
      {error ? <LoadErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !data && !error ? (
        <LoadingSkeleton
          variant="table"
          columns={3}
          search={false}
          filters={5}
          actions={false}
          cellLines={[1, 2, 2]}
          widths={["minmax(0, 1fr)", "minmax(0, 2fr)", "minmax(0, 1.5fr)"]}
        />
      ) : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <form onSubmit={submit}>
            <FilterToolbar
              active={filtersActive}
              onClear={clearFilters}
              filters={filterFields.map((filter) => (
                <Field key={filter.key}>
                  <FieldLabel htmlFor={`audit-${filter.key}`} className="sr-only">
                    {filter.label}
                  </FieldLabel>
                  <Select value={filters[filter.key]} onValueChange={(value) => setFilters((previous) => ({ ...previous, [filter.key]: value }))} name={filter.key}>
                    <SelectTrigger id={`audit-${filter.key}`}>
                      <SelectValue placeholder={filter.all} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">{filter.all}</SelectItem>
                        {filter.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}
            />
          </form>

          <Table label="Registro de auditoría">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Actividad</TableHead>
                <TableHead>Responsable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.events.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(event.occurred_at)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{event.action}</div>
                    <div className="text-sm">{event.target || event.resource}</div>
                    {event.details.length ? <div className="text-sm text-muted-foreground">{detailLine(event.details)}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div>{event.actor}</div>
                    {event.role || event.career ? <div className="text-sm text-muted-foreground">{[event.role, event.career].filter(Boolean).join(" · ")}</div> : null}
                  </TableCell>
                </TableRow>
              ))}
              {data.events.data.length === 0 ? (
                <TableEmpty colSpan={3}>{filtersActive ? "No hay actividad para los filtros seleccionados" : "Todavía no hay actividad registrada"}</TableEmpty>
              ) : null}
            </TableBody>
          </Table>
          <TablePagination meta={data.events} label="Paginación del registro de auditoría" onPageChange={(page) => void load(page)} />
        </div>
      ) : null}
    </PageFrame>
  )
}
