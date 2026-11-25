"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { ApiError } from "@/api/client"
import { type HistorySyllabus } from "@/api/syllabi"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { rememberSyllabusPreview } from "@/components/domain/syllabus/syllabusPreview"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns, type TableSort } from "@/composables/useTableSort"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { syllabusStateLabel } from "@silabos/shared/lib/syllabusStates"
import { goBack } from "@/lib/goBack"
import { failedQuery, queryErrorMessage } from "@/lib/queryClient"
import { paths } from "@/lib/routes"
import { teacherHistoryCareerQuery } from "@/queries/teacher"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"

const NO_SYLLABI: HistorySyllabus[] = []

const formatSavedAt = (value: string | null): string => (value ? formatDateDisplay(value, { dateStyle: "medium", timeStyle: "short" }) : "Sin guardados")

const SORT_COLUMNS = {
  subject: { label: "Asignatura", value: (syllabus: HistorySyllabus) => syllabus.subject },
  parallels: { label: "Paralelos", value: (syllabus: HistorySyllabus) => syllabus.parallels.join(", ") },
  state: { label: "Estado", value: (syllabus: HistorySyllabus) => syllabusStateLabel(syllabus.state) },
  saved: { label: "Último guardado", type: "date", value: (syllabus: HistorySyllabus) => syllabus.guardado_en },
} satisfies SortColumns<HistorySyllabus>

type HistorySort = TableSort<Extract<keyof typeof SORT_COLUMNS, string>>

function HistoryHeader({ sort }: { sort: HistorySort }) {
  return (
    <TableHeader>
      <TableRow>
        <SortableHead sort={sort} column="subject">Asignatura</SortableHead>
        <SortableHead sort={sort} column="parallels">Paralelos</SortableHead>
        <SortableHead sort={sort} column="state" className="text-center">Estado</SortableHead>
        <SortableHead sort={sort} column="saved">Último guardado</SortableHead>
      </TableRow>
    </TableHeader>
  )
}

export default function TeacherHistoryCareerPage() {
  const router = useRouter()
  const { career } = useParams<{ career: string }>()
  const query = useQuery(teacherHistoryCareerQuery(String(career)))
  const careerName = query.data?.career.name ?? null
  const syllabi = query.data?.syllabi ?? null
  const failed = failedQuery(query)
  const status = failed && query.error instanceof ApiError ? query.error.status : null
  const error = status === 401 || status === 404 ? null : queryErrorMessage(query, "No se pudo cargar el historial de la carrera")
  const loading = syllabi === null && error === null
  const sort = useTableSort(syllabi ?? NO_SYLLABI, SORT_COLUMNS)
  const sortedSyllabi = useMemo(() => {
    if (sort.sortKey === null) return sort.items
    const periodRank = new Map<string, number>()
    for (const syllabus of syllabi ?? NO_SYLLABI) if (!periodRank.has(syllabus.period)) periodRank.set(syllabus.period, periodRank.size)

    return sort.items.toSorted((left, right) => (periodRank.get(left.period) ?? 0) - (periodRank.get(right.period) ?? 0))
  }, [syllabi, sort.items, sort.sortKey])
  const { items: pagedSyllabi, meta, setPage } = useClientPagination(sortedSyllabi, 20, sort.criteria)
  const groups = useMemo(() => {
    const byPeriod = new Map<string, HistorySyllabus[]>()
    for (const syllabus of pagedSyllabi) byPeriod.set(syllabus.period, [...(byPeriod.get(syllabus.period) ?? []), syllabus])

    return [...byPeriod.entries()].map(([period, items]) => ({ period, items }))
  }, [pagedSyllabi])

  useEffect(() => {
    if (status === 401) router.replace(paths.login)
    else if (status === 404) router.replace(paths.teacher.history)
  }, [router, status])

  const load = (): void => {
    void query.refetch()
  }


  const open = (id: string): void => {
    rememberSyllabusPreview(id, true)
    router.push(paths.teacher.syllabus(id))
  }

  return (
    <PageFrame
      title="Historial"
      description="Sílabos de períodos anteriores de esta carrera"
      size="wide"
      loading={loading}
      eyebrow={
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => goBack(router, paths.teacher.history)}>
          <ArrowLeft aria-hidden="true" />
          Volver al historial
        </Button>
      }
      meta={loading ? <Skeleton className="h-5 w-40" /> : careerName ? <span className="text-sm font-semibold">{careerName}</span> : null}
    >
      {error ? (
        <LoadErrorState message={error} onRetry={load} />
      ) : loading ? (
        <LoadingSkeleton variant="table-body" columns={4} rows={3} actions={false} badges={[3]} heading />
      ) : (
        <>
          <SortSelect sort={sort} inputId="teacher-history-career-sort" />
          {groups.map((group) => (
            <div key={group.period} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Período {group.period}</h2>
              <Table label={`Sílabos del período ${group.period}`}>
                <HistoryHeader sort={sort} />
                <TableBody>
                  {group.items.map((syllabus) => (
                    <TableRow
                      key={syllabus.id}
                      className="cursor-pointer"
                      onClick={(event) => activateRow(event.nativeEvent, () => open(syllabus.id))}
                    >
                      <TableCell>
                        <Link href={paths.teacher.syllabus(syllabus.id)} className={rowLinkClass} onClick={() => rememberSyllabusPreview(syllabus.id, true)}>
                          {syllabus.subject}
                        </Link>
                        <TableCardLine>
                          {syllabus.parallels.length === 1 ? "Paralelo" : "Paralelos"} {syllabus.parallels.join(", ")} · {formatSavedAt(syllabus.guardado_en)}
                        </TableCardLine>
                        <TableCardLine>
                          <SyllabusStateBadge state={syllabus.state} />
                        </TableCardLine>
                      </TableCell>
                      <TableCell data-card-hide="true">{syllabus.parallels.join(", ")}</TableCell>
                      <TableCell className="text-center" data-card-hide="true">
                        <SyllabusStateBadge state={syllabus.state} />
                      </TableCell>
                      <TableCell data-card-hide="true">{formatSavedAt(syllabus.guardado_en)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          {groups.length === 0 ? (
            <Table label="Sílabos de la carrera">
              <HistoryHeader sort={sort} />
              <TableBody>
                <TableEmpty colSpan={4}>Todavía no tiene sílabos de períodos anteriores en esta carrera</TableEmpty>
              </TableBody>
            </Table>
          ) : null}
          <SortStatus sort={sort} />
          <TablePagination meta={meta} label="Paginación del historial de la carrera" onPageChange={setPage} />
        </>
      )}
    </PageFrame>
  )
}
