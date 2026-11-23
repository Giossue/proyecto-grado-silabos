"use client"

import { ArrowLeft } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { getTeacherHistoryCareer, type HistorySyllabus } from "@/api/syllabi"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { rememberSyllabusPreview } from "@/components/domain/syllabus/syllabusPreview"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientPagination } from "@/composables/useClientPagination"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { goBack } from "@/lib/goBack"
import { paths } from "@/lib/routes"
import { activateRow } from "@/lib/rowActivation"

const NO_SYLLABI: HistorySyllabus[] = []

const formatSavedAt = (value: string | null): string => (value ? formatDateDisplay(value, { dateStyle: "medium", timeStyle: "short" }) : "Sin guardados")

const activateWithKey = (event: KeyboardEvent<HTMLTableRowElement>, action: () => void): void => {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
  event.preventDefault()
  action()
}

function HistoryHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Asignatura</TableHead>
        <TableHead>Paralelos</TableHead>
        <TableHead className="text-center">Estado</TableHead>
        <TableHead>Último guardado</TableHead>
      </TableRow>
    </TableHeader>
  )
}

export default function TeacherHistoryCareerPage() {
  const router = useRouter()
  const { career } = useParams<{ career: string }>()
  const [careerName, setCareerName] = useState<string | null>(null)
  const [syllabi, setSyllabi] = useState<HistorySyllabus[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = syllabi === null && error === null
  const { items: pagedSyllabi, meta, setPage } = useClientPagination(syllabi ?? NO_SYLLABI, 20)
  const groups = useMemo(() => {
    const byPeriod = new Map<string, HistorySyllabus[]>()
    for (const syllabus of pagedSyllabi) byPeriod.set(syllabus.period, [...(byPeriod.get(syllabus.period) ?? []), syllabus])

    return [...byPeriod.entries()].map(([period, items]) => ({ period, items }))
  }, [pagedSyllabi])

  const fetchCareer = useCallback(
    (): Promise<void> =>
      getTeacherHistoryCareer(String(career)).then(
        (result) => {
          setCareerName(result.career.name)
          setSyllabi(result.syllabi)
        },
        (reason: unknown) => {
          if (reason instanceof ApiError && reason.status === 401) {
            router.replace(paths.login)
            return
          }
          if (reason instanceof ApiError && reason.status === 404) {
            router.replace(paths.teacher.history)
            return
          }
          setError(reason instanceof ApiError ? reason.message : "No se pudo cargar el historial de la carrera")
        },
      ),
    [career, router],
  )

  useEffect(() => {
    void fetchCareer()
  }, [fetchCareer])

  const load = (): void => {
    setError(null)
    void fetchCareer()
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
          {groups.map((group) => (
            <div key={group.period} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Período {group.period}</h2>
              <Table label={`Sílabos del período ${group.period}`}>
                <HistoryHeader />
                <TableBody>
                  {group.items.map((syllabus) => (
                    <TableRow
                      key={syllabus.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-label={`Abrir sílabo de ${syllabus.subject}`}
                      onClick={(event) => activateRow(event.nativeEvent, () => open(syllabus.id))}
                      onKeyDown={(event) => activateWithKey(event, () => open(syllabus.id))}
                    >
                      <TableCell>
                        {syllabus.subject}
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
              <HistoryHeader />
              <TableBody>
                <TableEmpty colSpan={4}>Todavía no tiene sílabos de períodos anteriores en esta carrera</TableEmpty>
              </TableBody>
            </Table>
          ) : null}
          <TablePagination meta={meta} label="Paginación del historial de la carrera" onPageChange={setPage} />
        </>
      )}
    </PageFrame>
  )
}
