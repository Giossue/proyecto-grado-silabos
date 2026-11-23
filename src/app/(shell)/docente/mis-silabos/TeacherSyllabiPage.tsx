"use client"

import { History } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { getTeacherSyllabi, type SyllabiResponse } from "@/api/syllabi"
import { EmptyState } from "@/components/domain/EmptyState"
import { FilterToolbar } from "@/components/domain/FilterToolbar"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLatestRequest } from "@/lib/latestRequest"
import { paths } from "@/lib/routes"
import { useSignal } from "@/lib/signal"
import { rememberSyllabusPreview } from "@/components/domain/syllabus/syllabusPreview"
import { SYLLABUS_STATE_OPTIONS } from "@/lib/syllabusStates"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { deadlineState } from "@/state/deadline"

type Filters = { q: string; state: string }

const SENT_STATES = ["en_revision", "aprobado"]

export default function TeacherSyllabiPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deadline = useSignal(deadlineState.deadline)
  const requests = useLatestRequest()
  const [initial] = useState(() => {
    const query = queryOf(searchParams)
    return { filters: { q: queryText(query.q), state: queryText(query.state) || "all" }, page: queryPage(query.page) }
  })
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [result, setResult] = useState<SyllabiResponse | null>(null)
  const [period, setPeriod] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filtersActive = filters.q !== "" || filters.state !== "all"

  const fetchSyllabi = useCallback(
    (page: number, current: Filters): Promise<void> => {
      const ticket = requests.begin()

      return getTeacherSyllabi({ q: current.q, state: current.state, page }).then(
        (response) => {
          if (!requests.isCurrent(ticket)) return
          setResult(response)
          const periods = [...new Set(response.syllabi.data.map((syllabus) => syllabus.period))]
          if (periods.length === 1) setPeriod(periods[0]!)
          syncFilters(router, { q: current.q, state: current.state }, page)
        },
        (reason: unknown) => {
          if (!requests.isCurrent(ticket)) return
          if (reason instanceof ApiError && reason.status === 401) {
            router.replace(paths.login)
            return
          }
          setError(reason instanceof ApiError ? reason.message : "No se pudieron cargar sus sílabos")
        },
      )
    },
    [requests, router],
  )

  useEffect(() => {
    void fetchSyllabi(initial.page, initial.filters)
  }, [fetchSyllabi, initial])

  const load = (page = 1, current: Filters = filters): Promise<void> => {
    setError(null)
    return fetchSyllabi(page, current)
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void load()
  }

  const clearFilters = (): void => {
    const cleared = { q: "", state: "all" }
    setFilters(cleared)
    void load(1, cleared)
  }

  const emptyCopy = (): { title: string; description?: string } => {
    if (result?.filters.q || result?.filters.state) return { title: "Ningún sílabo coincide con la búsqueda" }
    if (deadline?.state === "paused") return { title: "No tiene sílabos asignados" }
    if (result?.convocation_open === false) return { title: "Todavía no hay una convocatoria abierta", description: "Cuando Coordinación la abra, aquí verá sus sílabos" }
    return { title: "No tiene sílabos asignados" }
  }

  const openSyllabus = (id: string, state: string): void => {
    rememberSyllabusPreview(id, SENT_STATES.includes(state))
    router.push(paths.teacher.syllabus(id))
  }

  const openWithKey = (event: KeyboardEvent<HTMLDivElement>, id: string, state: string): void => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    openSyllabus(id, state)
  }

  const firstLoad = !result && !error

  return (
    <PageFrame
      title={period ? `Sílabos - Período ${period}` : "Mis sílabos"}
      description="Los sílabos de las materias que usted dicta"
      size="wide"
      loading={firstLoad}
      actionsSkeleton={firstLoad ? ["w-9"] : []}
      tools={
        <IconTooltip label="Historial">
          <Button asChild variant="ghost" size="icon">
            <Link href={paths.teacher.history} aria-label="Historial">
              <History aria-hidden="true" />
            </Link>
          </Button>
        </IconTooltip>
      }
    >
      {error ? <LoadErrorState message={error} onRetry={() => void load()} /> : null}
      {result ? (
        <form onSubmit={submit}>
          <FilterToolbar
            active={filtersActive}
            onClear={clearFilters}
            search={
              <Field>
                <FieldLabel htmlFor="syllabi-search" className="sr-only">
                  Buscar por asignatura o código
                </FieldLabel>
                <Input
                  id="syllabi-search"
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
                <FieldLabel htmlFor="syllabi-state" className="sr-only">
                  Estado
                </FieldLabel>
                <Select value={filters.state} name="state" onValueChange={(state) => setFilters((current) => ({ ...current, state }))}>
                  <SelectTrigger id="syllabi-state">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {SYLLABUS_STATE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            }
          />
        </form>
      ) : null}
      {firstLoad ? (
        <LoadingSkeleton variant="syllabus-cards" rows={3} />
      ) : result && result.syllabi.data.length === 0 ? (
        <EmptyState {...emptyCopy()} />
      ) : result ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Mis sílabos">
          {result.syllabi.data.map((syllabus) => (
            <li key={syllabus.id}>
              <Card
                className="h-full cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
                tabIndex={0}
                aria-label={`Abrir sílabo de ${syllabus.subject}`}
                onClick={() => openSyllabus(syllabus.id, syllabus.state)}
                onKeyDown={(event) => openWithKey(event, syllabus.id, syllabus.state)}
              >
                <CardHeader>
                  <CardTitle>{syllabus.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {syllabus.parallels.length === 1 ? "Paralelo" : "Paralelos"}: {syllabus.parallels.join(", ")}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 text-sm">
                  <SyllabusStateBadge state={syllabus.state} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {result && result.syllabi.data.length > 0 ? (
        <TablePagination meta={result.syllabi} label="Paginación de mis sílabos" onPageChange={(page) => void load(page)} />
      ) : null}
    </PageFrame>
  )
}
