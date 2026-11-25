"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { MetricTiles } from "@/components/domain/MetricTiles"
import { PageFrame } from "@/components/domain/PageFrame"
import { StatusBadge, type StatusTone } from "@/components/domain/StatusBadge"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { ConvocationOptionsDialog } from "@/components/domain/syllabus/ConvocationOptionsDialog"
import { ConvocationPeriodDialog } from "@/components/domain/syllabus/ConvocationPeriodDialog"
import { ConvocationRowActions, type ConvocationRowActionsHandle } from "@/components/domain/syllabus/ConvocationRowActions"
import type { ConvocationRow } from "@/components/domain/syllabus/convocationRows"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { paths } from "@/lib/routes"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { setupChecklistState } from "@/state/setupChecklist"
import { queryErrorMessage } from "@/lib/queryClient"
import { dashboardSummaryQuery } from "@/queries/dashboard"
import { processOverviewQuery } from "@/queries/processes"

const STATE_LABELS = { abierto: "Abierto", pausado: "Pausado", cerrado: "Finalizado" } as const
const STATE_TONES = { abierto: "success", pausado: "warning", cerrado: "info" } as const

const stateLabel = (row: ConvocationRow): string => (row.process ? STATE_LABELS[row.process.state] : "Sin iniciar")
const stateTone = (row: ConvocationRow): StatusTone => (row.process ? STATE_TONES[row.process.state] : "neutral")
const formatDate = (value: string): string => formatDateDisplay(value, { dateStyle: "medium" })

const searchable = (row: ConvocationRow): string[] => [row.code]

const FILTERS: Record<string, ClientFilterDefinition<ConvocationRow>> = {
  estado: { matches: (row, value) => (value === "sin_iniciar" ? row.process === null : row.process?.state === value) },
}

export default function AdminProcessesPage() {
  const router = useRouter()
  const query = useQuery(processOverviewQuery())
  const summaryQuery = useQuery(dashboardSummaryQuery())
  const governance = query.data?.governance ?? null
  const processData = query.data?.processes ?? null
  const summary = summaryQuery.data ?? null
  const loading = query.isFetching
  const error = queryErrorMessage(query, "No se pudieron cargar las convocatorias")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const rowActions = useRef<ConvocationRowActionsHandle>(null)
  const loaded = governance !== null && processData !== null
  const setupReady = (summary?.setup?.steps ?? []).every((step) => step.key === "process" || step.done)

  const rows = useMemo<ConvocationRow[]>(() => {
    const byPeriod = new Map((processData?.processes ?? []).map((process) => [process.period_id, process]))

    return (governance?.catalogs.periods ?? [])
      .toSorted((a, b) => b.starts_on.localeCompare(a.starts_on))
      .map((period) => ({ ...period, process: byPeriod.get(period.id) ?? null }))
  }, [governance, processData])
  const filter = useClientFilter(rows, searchable, FILTERS)
  const { items: page, meta, setPage } = useClientPagination(filter.items, 20, filter.criteria)
  const inProgress = rows.some((row) => row.process?.state === "abierto" || row.process?.state === "pausado")
  const current = rows.find((row) => row.id === selectedId) ?? null

  useEffect(() => {
    if (query.data === null) router.replace(paths.dashboard)
  }, [query.data, router])

  useEffect(() => {
    if (summary?.setup !== undefined) setupChecklistState.update(summary.setup)
  }, [summary])

  const load = (): Promise<void> => Promise.all([query.refetch(), summaryQuery.refetch()]).then(() => undefined)

  const changed = async (notice: string): Promise<void> => {
    toast.success(notice)
    await load()
  }

  const select = (row: ConvocationRow): void => {
    setSelectedId(row.id)
    setSheetOpen(true)
  }

  const runAction = (key: string): void => {
    window.setTimeout(() => rowActions.current?.run(key), 0)
  }

  return (
    <PageFrame
      title="Convocatorias"
      description="Periodos lectivos y sus fechas de clases y de elaboración de sílabos"
      size="wide"
      loading={!loaded && !error}
      actionsSkeleton={loading && !loaded ? ["w-44"] : []}
      actions={
        loaded && !setupReady ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                <ConvocationPeriodDialog disabled onSaved={(message) => void changed(message)} />
              </span>
            </TooltipTrigger>
            <TooltipContent>Complete «Antes de empezar» para abrir una convocatoria</TooltipContent>
          </Tooltip>
        ) : loaded && inProgress ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                <ConvocationPeriodDialog disabled onSaved={(message) => void changed(message)} />
              </span>
            </TooltipTrigger>
            <TooltipContent>Hay una convocatoria abierta o pausada. Finalícela o elimínela antes de abrir otra</TooltipContent>
          </Tooltip>
        ) : loaded ? (
          <ConvocationPeriodDialog onSaved={(message) => void changed(message)} />
        ) : null
      }
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : loading && !loaded ? (
        <LoadingSkeleton variant="table" metrics columns={4} filters={1} filterWidth="lg:w-44" actions={false} badges={[4]} />
      ) : null}
      {loaded && summary?.metrics.length ? <MetricTiles metrics={summary.metrics} /> : null}
      {loaded ? (
        <div className="flex flex-col gap-4">
          <ClientFilterBar
            filter={filter}
            inputId="processes-search"
            label="Buscar período"
            placeholder="Buscar por período"
            filters={
              <Field>
                <FieldLabel htmlFor="processes-search-state" className="sr-only">
                  Estado
                </FieldLabel>
                <Select value={filter.values.estado} onValueChange={(value) => filter.setValue("estado", value)}>
                  <SelectTrigger id="processes-search-state">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="sin_iniciar">Sin iniciar</SelectItem>
                      <SelectItem value="abierto">Abiertos</SelectItem>
                      <SelectItem value="pausado">Pausados</SelectItem>
                      <SelectItem value="cerrado">Finalizados</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            }
          />

          <Table label="Convocatorias">
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Clases</TableHead>
                <TableHead>Elaboración de sílabos</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.length === 0 ? (
                <TableEmpty colSpan={4}>{filter.active ? "Ningún período coincide con los filtros" : "No hay periodos registrados. Cree el primero con «Nueva convocatoria»"}</TableEmpty>
              ) : (
                page.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={(event) => activateRow(event.nativeEvent, () => select(row))}
                  >
                    <TableCell>
                      <button type="button" className={rowButtonClass} aria-haspopup="dialog" onClick={() => select(row)}>{row.code}</button>
                      <TableCardLine>
                        <StatusBadge label={stateLabel(row)} tone={stateTone(row)} />
                      </TableCardLine>
                    </TableCell>
                    <TableCell>
                      <time dateTime={row.starts_on}>{formatDate(row.starts_on)}</time> → <time dateTime={row.ends_on}>{formatDate(row.ends_on)}</time>
                    </TableCell>
                    {row.process ? (
                      <TableCell>
                        <time dateTime={row.process.starts_at}>{formatDate(row.process.starts_at)}</time> → <time dateTime={row.process.due_at}>{formatDate(row.process.due_at)}</time>
                      </TableCell>
                    ) : (
                      <TableCell className="text-muted-foreground">Sin fechas</TableCell>
                    )}
                    <TableCell className="text-center" data-card-hide="true">
                      <StatusBadge label={stateLabel(row)} tone={stateTone(row)} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination meta={meta} label="Paginación de convocatorias" onPageChange={setPage} />
        </div>
      ) : null}
      {current ? (
        <>
          <ConvocationOptionsDialog open={sheetOpen} onOpenChange={setSheetOpen} row={current} onAction={runAction} />
          <ConvocationRowActions key={current.id} ref={rowActions} row={current} menu={false} onChanged={(message) => void changed(message)} />
        </>
      ) : null}
    </PageFrame>
  )
}
