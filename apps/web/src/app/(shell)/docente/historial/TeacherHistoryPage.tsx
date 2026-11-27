"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { ApiError } from "@/api/client"
import { type HistoryCareer } from "@/api/syllabi"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableEmpty, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"
import { goBack } from "@/lib/goBack"
import { failedQuery, queryErrorMessage } from "@/lib/queryClient"
import { paths } from "@/lib/routes"
import { teacherHistoryQuery } from "@/queries/teacher"
import { activateRow, rowLinkClass } from "@/lib/rowActivation"

const NO_CAREERS: HistoryCareer[] = []

const SORT_COLUMNS = {
  name: { label: "Carrera", value: (career: HistoryCareer) => career.name },
  syllabi: { label: "Sílabos", type: "number", value: (career: HistoryCareer) => career.syllabi_count },
} satisfies SortColumns<HistoryCareer>

export default function TeacherHistoryPage() {
  const router = useRouter()
  const query = useQuery(teacherHistoryQuery())
  const careers = query.data?.careers ?? null
  const failed = failedQuery(query)
  const status = failed && query.error instanceof ApiError ? query.error.status : null
  const error = status === 401 ? null : queryErrorMessage(query, "No se pudo cargar su historial")
  const loading = careers === null && error === null
  const sort = useTableSort(careers ?? NO_CAREERS, SORT_COLUMNS)
  const { items: pagedCareers, meta, setPage } = useClientPagination(sort.items, 20, sort.criteria)

  useEffect(() => {
    if (status === 401) router.replace(paths.login)
  }, [router, status])

  const load = (): void => {
    void query.refetch()
  }

  const open = (career: HistoryCareer): void => router.push(paths.teacher.historyCareer(career.code))

  return (
    <PageFrame
      title="Historial"
      description="Sílabos de períodos anteriores de esta carrera"
      size="wide"
      loading={loading}
      eyebrow={
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => goBack(router, paths.teacher.syllabi)}>
          <ArrowLeft aria-hidden="true" />
          Volver a mis sílabos
        </Button>
      }
    >
      {error ? (
        <LoadErrorState message={error} onRetry={load} />
      ) : loading ? (
        <LoadingSkeleton variant="table-body" columns={2} actions={false} />
      ) : careers ? (
        <>
          <SortSelect sort={sort} inputId="teacher-history-sort" />
          <Table label="Carreras con historial">
            <TableHeader>
              <TableRow>
                <SortableHead sort={sort} column="name">Carrera</SortableHead>
                <SortableHead sort={sort} column="syllabi" className="text-center">Sílabos</SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {careers.length === 0 ? (
                <TableEmpty colSpan={2}>Todavía no tiene sílabos de períodos anteriores</TableEmpty>
              ) : (
                pagedCareers.map((career) => (
                  <TableRow
                    key={career.id}
                    className="cursor-pointer"
                    onClick={(event) => activateRow(event.nativeEvent, () => open(career))}
                  >
                    <TableCell>
                      <Link href={paths.teacher.historyCareer(career.code)} className={rowLinkClass}>{career.name}</Link>
                    </TableCell>
                    <TableCell className="text-center">{career.syllabi_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <SortStatus sort={sort} />
          <TablePagination meta={meta} label="Paginación del historial" onPageChange={setPage} />
        </>
      ) : null}
    </PageFrame>
  )
}
