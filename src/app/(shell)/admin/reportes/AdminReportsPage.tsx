"use client"

import { Download } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { ApiError } from "@/api/client"
import { downloadProcessReport, getProcessReport, type ProcessReport, type ReportPayload } from "@/api/reports"
import { EmptyState } from "@/components/domain/EmptyState"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { StatTile } from "@/components/domain/StatTile"
import { TablePagination } from "@/components/domain/TablePagination"
import { REPORT_STATE_LABELS, ReportDailyChart, ReportReturnsChart, ReportStatesChart } from "@/components/domain/admin/ReportCharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { toast } from "@/lib/toast"
import { queryOf, queryText } from "@/lib/urlFilters"
import { cn } from "@/lib/utils"

const NO_PENDING: ProcessReport["pending"] = []

const formatDate = (value: string): string => formatDateDisplay(`${value}T12:00:00`, { dateStyle: "long" })

export default function AdminReportsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [initialProcess] = useState(() => queryText(queryOf(searchParams).convocatoria))
  const [processId, setProcessId] = useState(initialProcess)
  const [payload, setPayload] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const report = payload?.report ?? null
  const { items: pendingPage, meta: pendingMeta, setPage: setPendingPage } = useClientPagination(report?.pending ?? NO_PENDING, 20)
  const hasReturns = (report?.careers ?? []).some((row) => row.returns.coordinacion + row.returns.biblioteca > 0)

  const fetchReport = useCallback(
    (id: string): Promise<void> =>
      getProcessReport(id || null)
        .then(
          (response) => {
            setPayload(response)
            setProcessId(response.report?.process.id ?? "")
          },
          (reason: unknown) => setError(reason instanceof ApiError ? reason.message : "No se pudo cargar el reporte"),
        )
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    void fetchReport(initialProcess)
  }, [fetchReport, initialProcess])

  const load = (id: string = processId): Promise<void> => {
    setLoading(true)
    setError(null)
    return fetchReport(id)
  }

  const choose = (value: string): void => {
    setProcessId(value)
    const query = new URLSearchParams(searchParams.toString())
    query.set("convocatoria", value)
    router.replace(`${pathname}?${query}`, { scroll: false })
    void load(value)
  }

  const exportWorkbook = async (): Promise<void> => {
    setExporting(true)
    try {
      const period = report?.process.period ?? "convocatoria"
      await downloadProcessReport(processId || null, `reporte-${period.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo exportar el reporte")
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageFrame
      title="Reportes"
      description="Cómo va la elaboración de los sílabos en cada convocatoria"
      size="wide"
      loading={loading && !payload && !error}
      actions={
        payload?.options.length ? (
          <>
            <Field data-tour="report-process" className="w-72">
              <FieldLabel htmlFor="report-process" className="sr-only">
                Convocatoria
              </FieldLabel>
              <Select value={processId} onValueChange={choose}>
                <SelectTrigger id="report-process">
                  <SelectValue placeholder="Elija la convocatoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {payload.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button type="button" variant="success" data-tour="report-export" disabled={exporting || !report} onClick={() => void exportWorkbook()}>
              {exporting ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden="true" />}
              Exportar a Excel
            </Button>
          </>
        ) : null
      }
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : loading && !payload ? (
        <LoadingSkeleton variant="table" metrics columns={4} search={false} filters={0} actions={false} />
      ) : payload && !report ? (
        <EmptyState title="Todavía no hay convocatorias" description="Cuando abra la primera, aquí verá cómo avanza" />
      ) : report ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Elaboración desde el {formatDate(report.process.starts_at)} hasta el {formatDate(report.process.due_at)}
          </p>

          <div data-tour="report-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Sílabos" value={report.kpis.total} hint="Uno por paralelo con docente" />
            <StatTile label="Aprobados" value={report.kpis.approved_percent} suffix="%" hint="Firmados por Coordinación y Biblioteca" />
            <StatTile
              label="Enviados a tiempo"
              value={report.kpis.on_time_percent ?? 0}
              suffix={report.kpis.on_time_percent === null ? undefined : "%"}
              hint={report.kpis.on_time_percent === null ? "Todavía no hay envíos" : "Primer envío antes de la fecha de entrega"}
            />
            <StatTile
              label="Días de revisión"
              value={report.kpis.review_days ?? 0}
              hint={report.kpis.review_days === null ? "Todavía no hay aprobados" : "Promedio desde el primer envío hasta la aprobación"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Avance por carrera</CardTitle>
                <CardDescription>Sílabos de cada carrera según su estado</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportStatesChart careers={report.careers} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Envíos por día</CardTitle>
                <CardDescription>Para ver si los sílabos llegan a tiempo o todos al final</CardDescription>
              </CardHeader>
              <CardContent>
                {report.daily.length === 0 ? (
                  <EmptyState className="h-72 justify-center border-0 shadow-none ring-0" title="Todavía no hay envíos" />
                ) : (
                  <ReportDailyChart daily={report.daily} />
                )}
              </CardContent>
            </Card>
          </div>

          {hasReturns ? (
            <Card>
              <CardHeader>
                <CardTitle>Devoluciones</CardTitle>
                <CardDescription>Veces que Coordinación o Biblioteca pidieron correcciones, por carrera</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportReturnsChart careers={report.careers} />
              </CardContent>
            </Card>
          ) : null}

          <section data-tour="report-careers" className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Por carrera</h2>
            <Table label="Avance por carrera">
              <TableHeader>
                <TableRow>
                  <TableHead>Carrera</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Aprobados</TableHead>
                  <TableHead className="text-center">Pendientes</TableHead>
                  <TableHead className="text-center">Devueltos</TableHead>
                  <TableHead className="text-center">Atrasados</TableHead>
                  <TableHead className="text-center">Avance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.careers.map((row) => (
                  <TableRow key={row.career}>
                    <TableCell>{row.career}</TableCell>
                    <TableCell className="text-center">{row.total}</TableCell>
                    <TableCell className="text-center">{row.approved}</TableCell>
                    <TableCell className="text-center">{row.pending}</TableCell>
                    <TableCell className="text-center">{row.returned}</TableCell>
                    <TableCell className={cn("text-center", row.late > 0 && "font-medium text-destructive")}>{row.late}</TableCell>
                    <TableCell className="text-center">{row.progress} %</TableCell>
                  </TableRow>
                ))}
                {report.careers.length === 0 ? <TableEmpty colSpan={7}>Esta convocatoria no tiene sílabos</TableEmpty> : null}
              </TableBody>
            </Table>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Sílabos pendientes</h2>
            <Table label="Sílabos pendientes por docente">
              <TableHeader>
                <TableRow>
                  <TableHead>Docente</TableHead>
                  <TableHead>Carrera</TableHead>
                  <TableHead>Asignatura</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPage.map((row) => (
                  <TableRow key={`${row.career}-${row.subject}-${row.parallel}`}>
                    <TableCell>{row.teachers || "Sin docente"}</TableCell>
                    <TableCell>{row.career}</TableCell>
                    <TableCell>
                      {row.subject} · Paralelo {row.parallel}
                    </TableCell>
                    <TableCell className="text-center">
                      {REPORT_STATE_LABELS[row.state]}
                      {row.late ? <span className="ml-1 text-destructive">(atrasado)</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
                {report.pending.length === 0 ? <TableEmpty colSpan={4}>Todos los sílabos están aprobados</TableEmpty> : null}
              </TableBody>
            </Table>
            <TablePagination meta={pendingMeta} label="Paginación de los sílabos pendientes" onPageChange={setPendingPage} />
          </section>
        </div>
      ) : null}
    </PageFrame>
  )
}
