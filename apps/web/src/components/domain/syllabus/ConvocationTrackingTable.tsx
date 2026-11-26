"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type ConvocationDetail } from "@/api/convocations"
import { reviewStageLabel } from "@/api/reviews"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortStatus } from "@/components/domain/TableSort"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"
import { reviewAreaPaths } from "@/lib/routes"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"
import { SYLLABUS_STATE_OPTIONS, syllabusStateLabel } from "@silabos/shared/lib/syllabusStates"
import { queryErrorMessage } from "@/lib/queryClient"
import { convocationQuery } from "@/queries/convocations"

type TrackedSyllabus = ConvocationDetail["convocation"]["syllabi"][number]

const searchable = (item: TrackedSyllabus): string[] => [item.subject, item.code, syllabusStateLabel(item.state)]

const FILTERS: Record<string, ClientFilterDefinition<TrackedSyllabus>> = {
  estado: { matches: (item, value) => item.state === value },
}

const SORT_COLUMNS = {
  subject: { label: "Asignatura", value: (item: TrackedSyllabus) => item.subject },
  parallels: { label: "Paralelos y docentes", value: (item: TrackedSyllabus) => item.parallels[0] },
  state: { label: "Estado", value: (item: TrackedSyllabus) => syllabusStateLabel(item.state) },
} satisfies SortColumns<TrackedSyllabus>

const NO_SYLLABI: TrackedSyllabus[] = []

export function ConvocationTrackingTable({ convocationId }: { convocationId: string | null }) {
  const router = useRouter()
  const query = useQuery({ ...convocationQuery(convocationId ?? ""), enabled: convocationId !== null })
  const data = convocationId !== null ? (query.data ?? null) : null
  const error = convocationId !== null ? queryErrorMessage(query, "No se pudo cargar el seguimiento del periodo académico") : null
  const loading = convocationId !== null && data === null && error === null
  const scope = convocationId ?? "none"

  const source = useMemo(() => data?.convocation.syllabi ?? NO_SYLLABI, [data])
  const filter = useClientFilter(source, searchable, FILTERS)
  const sort = useTableSort(filter.items, SORT_COLUMNS)
  const { items: page, meta, setPage } = useClientPagination(sort.items, 20, `${filter.criteria}|${sort.criteria}`)

  const retry = (): void => {
    void query.refetch()
  }
  const open = (revisionId: string): void => router.push(reviewAreaPaths().review(revisionId))

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
        sort={sort}
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

      <Table label="Seguimiento del periodo académico">
        <TableHeader>
          <TableRow>
            <SortableHead sort={sort} column="subject">Asignatura</SortableHead>
            <SortableHead sort={sort} column="parallels">Paralelos y docentes</SortableHead>
            <SortableHead sort={sort} column="state" className="text-center">Estado</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.length === 0 ? (
            <TableEmpty colSpan={3}>
              {filter.active ? "Ningún expediente coincide con los filtros" : convocationId === null ? "Aún no hay periodo académico abierto en su carrera" : "Los expedientes aparecerán después de abrir el periodo académico"}
            </TableEmpty>
          ) : (
            page.map((syllabus) => (
              <TableRow
                key={syllabus.id}
                className={syllabus.revision_id ? "cursor-pointer" : ""}
                onClick={(event) => {
                  if (syllabus.revision_id) activateRow(event.nativeEvent, () => open(syllabus.revision_id!))
                }}
              >
                <TableCell>
                  <div>
                    {syllabus.revision_id ? (
                      <Link href={reviewAreaPaths().review(syllabus.revision_id)} className={rowLinkClass}>{syllabus.subject}</Link>
                    ) : (
                      syllabus.subject
                    )}
                  </div>
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
      <SortStatus sort={sort} />
      <TablePagination meta={meta} label="Paginación del seguimiento del periodo académico" onPageChange={setPage} />
    </div>
  )
}
