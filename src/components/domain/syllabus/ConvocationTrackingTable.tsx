"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useMemo, type KeyboardEvent } from "react"
import { type ConvocationDetail } from "@/api/convocations"
import { reviewStageLabel } from "@/api/reviews"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { TablePagination } from "@/components/domain/TablePagination"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { reviewAreaPaths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"
import { SYLLABUS_STATE_OPTIONS, syllabusStateLabel } from "@/lib/syllabusStates"
import { queryErrorMessage } from "@/lib/queryClient"
import { convocationQuery } from "@/queries/convocations"

type TrackedSyllabus = ConvocationDetail["convocation"]["syllabi"][number]

const searchable = (item: TrackedSyllabus): string[] => [item.subject, item.code, syllabusStateLabel(item.state)]

const FILTERS: Record<string, ClientFilterDefinition<TrackedSyllabus>> = {
  estado: { matches: (item, value) => item.state === value },
}

const NO_SYLLABI: TrackedSyllabus[] = []

export function ConvocationTrackingTable({ convocationId }: { convocationId: string | null }) {
  const router = useRouter()
  const query = useQuery({ ...convocationQuery(convocationId ?? ""), enabled: convocationId !== null })
  const data = convocationId !== null ? (query.data ?? null) : null
  const error = convocationId !== null ? queryErrorMessage(query, "No se pudo cargar el seguimiento de la convocatoria") : null
  const loading = convocationId !== null && data === null && error === null
  const scope = convocationId ?? "none"

  const source = useMemo(() => data?.convocation.syllabi ?? NO_SYLLABI, [data])
  const filter = useClientFilter(source, searchable, FILTERS)
  const { items: page, meta, setPage } = useClientPagination(filter.items, 20, filter.criteria)

  const retry = (): void => {
    void query.refetch()
  }
  const open = (revisionId: string): void => router.push(reviewAreaPaths().review(revisionId))
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, revisionId: string | null | undefined): void => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    if (revisionId) open(revisionId)
  }

  if (error) return <LoadErrorState message={error} onRetry={retry} />
  if (loading && !data) return <LoadingSkeleton variant="table" columns={3} filters={1} filterWidth="lg:w-44" actions={false} cellLines={[2, 2, 1]} badges={[3]} />
  if (!data && convocationId !== null) return null

  return (
    <div className="flex flex-col gap-4">
      <ClientFilterBar
        filter={filter}
        inputId={`convocation-syllabi-search-${scope}`}
        label="Buscar expediente"
        placeholder="Buscar por asignatura o código"
        filters={
          <Field>
            <FieldLabel htmlFor={`convocation-syllabi-search-state-${scope}`} className="sr-only">
              Estado
            </FieldLabel>
            <Select value={filter.values.estado} onValueChange={(value) => filter.setValue("estado", value)}>
              <SelectTrigger id={`convocation-syllabi-search-state-${scope}`}>
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {SYLLABUS_STATE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        }
      />

      <Table label="Seguimiento de la convocatoria">
        <TableHeader>
          <TableRow>
            <TableHead>Asignatura</TableHead>
            <TableHead>Paralelos y docentes</TableHead>
            <TableHead className="text-center">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.length === 0 ? (
            <TableEmpty colSpan={3}>
              {filter.active ? "Ningún expediente coincide con los filtros" : convocationId === null ? "Aún no hay convocatoria abierta en su carrera" : "Los expedientes aparecerán después de abrir la convocatoria"}
            </TableEmpty>
          ) : (
            page.map((syllabus) => (
              <TableRow
                key={syllabus.id}
                className={syllabus.revision_id ? "cursor-pointer" : ""}
                tabIndex={syllabus.revision_id ? 0 : undefined}
                aria-label={syllabus.revision_id ? `Abrir revisión de ${syllabus.subject}` : undefined}
                onClick={(event) => {
                  if (syllabus.revision_id) activateRow(event.nativeEvent, () => open(syllabus.revision_id!))
                }}
                onKeyDown={(event) => openFromKeyboard(event, syllabus.revision_id)}
              >
                <TableCell>
                  <div>{syllabus.subject}</div>
                  <div className="text-sm text-muted-foreground">{syllabus.code}</div>
                </TableCell>
                <TableCell data-card-no-label="true">
                  <div>
                    {syllabus.parallels.length === 1 ? "Paralelo" : "Paralelos"} {syllabus.parallels.join(", ")}
                  </div>
                  <div className="text-sm text-muted-foreground">{syllabus.teachers.join(", ")}</div>
                </TableCell>
                <TableCell className="text-center" data-card-no-label="true">
                  <SyllabusStateBadge state={syllabus.state} />
                  {syllabus.state === "en_revision" && syllabus.stage ? (
                    <div className="mt-1 text-xs text-muted-foreground">{reviewStageLabel(syllabus.stage)}</div>
                  ) : syllabus.state === "correccion_solicitada" && syllabus.returned_by ? (
                    <div className="mt-1 text-xs text-muted-foreground">Devuelto por {syllabus.returned_by === "biblioteca" ? "biblioteca" : "coordinación"}</div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePagination meta={meta} label="Paginación del seguimiento de convocatoria" onPageChange={setPage} />
    </div>
  )
}
