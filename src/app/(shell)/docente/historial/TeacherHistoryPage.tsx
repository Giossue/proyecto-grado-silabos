"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { getTeacherHistory, type HistoryCareer } from "@/api/syllabi"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { goBack } from "@/lib/goBack"
import { paths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"

const NO_CAREERS: HistoryCareer[] = []

const activateWithKey = (event: KeyboardEvent<HTMLTableRowElement>, action: () => void): void => {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
  event.preventDefault()
  action()
}

export default function TeacherHistoryPage() {
  const router = useRouter()
  const [careers, setCareers] = useState<HistoryCareer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = careers === null && error === null
  const { items: pagedCareers, meta, setPage } = useClientPagination(careers ?? NO_CAREERS, 20)

  const fetchHistory = useCallback(
    (): Promise<void> =>
      getTeacherHistory().then(
        (result) => setCareers(result.careers),
        (reason: unknown) => {
          if (reason instanceof ApiError && reason.status === 401) {
            router.replace(paths.login)
            return
          }
          setError(reason instanceof ApiError ? reason.message : "No se pudo cargar su historial")
        },
      ),
    [router],
  )

  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory])

  const load = (): void => {
    setError(null)
    void fetchHistory()
  }

  const open = (career: HistoryCareer): void => router.push(paths.teacher.historyCareer(career.id))

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
          <Table label="Carreras con historial">
            <TableHeader>
              <TableRow>
                <TableHead>Carrera</TableHead>
                <TableHead className="text-center">Sílabos</TableHead>
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
                    tabIndex={0}
                    aria-label={`Ver el historial de ${career.name}`}
                    onClick={(event) => activateRow(event.nativeEvent, () => open(career))}
                    onKeyDown={(event) => activateWithKey(event, () => open(career))}
                  >
                    <TableCell>{career.name}</TableCell>
                    <TableCell className="text-center">{career.syllabi_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination meta={meta} label="Paginación del historial" onPageChange={setPage} />
        </>
      ) : null}
    </PageFrame>
  )
}
