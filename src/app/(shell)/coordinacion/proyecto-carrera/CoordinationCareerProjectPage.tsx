"use client"

import { BookOpen, ChevronDown, FileText, Plus } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { type ScheduledSubjects } from "@/api/career-academics"
import { FichaImportDialog } from "@/components/domain/academic/FichaImportDialog"
import { SupportDocumentsPanel } from "@/components/domain/academic/SupportDocumentsPanel"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { EmptyState } from "@/components/domain/EmptyState"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { queryErrorMessage } from "@/lib/queryClient"
import { coordinatorCareerQuery, scheduledSubjectsQuery } from "@/queries/careerAcademics"

type Subject = ScheduledSubjects["options"]["activeSubjects"][number]

const statusOf = (subject: Subject): string =>
  subject.profile_complete ? "Completa" : subject.profile_total ? `${subject.profile_filled ?? 0} de ${subject.profile_total} campos` : "Incompleta"
const cycleLabel = (subject: Subject): string => (subject.ciclo ? String(subject.ciclo) : "Sin ciclo")
const searchable = (subject: Subject) => [subject.nombre]
const subjectFilters: Record<string, ClientFilterDefinition<Subject>> = {
  ciclo: { matches: (subject, value) => cycleLabel(subject) === value },
  estado: { matches: (subject, value) => (value === "complete" ? Boolean(subject.profile_complete) : !subject.profile_complete) },
}
const compareCycles = (left: string, right: string): number => left.localeCompare(right, "es", { numeric: true })
const completeCount = (list: Subject[]): number => list.filter((subject) => subject.profile_complete).length

export default function CoordinationCareerProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(() => (searchParams.get("tab") === "documentos" ? "documentos" : "materias"))
  const [uploadOpen, setUploadOpen] = useState(false)
  const scope = useQuery(coordinatorCareerQuery())
  const query = useQuery({ ...scheduledSubjectsQuery(), enabled: typeof scope.data === "string" })
  const data = query.data ?? null
  const loading = scope.isFetching || query.isFetching
  const loadError = queryErrorMessage(scope, "No se pudo cargar el proyecto de carrera") ?? queryErrorMessage(query, "No se pudo cargar el proyecto de carrera")

  const subjects = useMemo(() => (data?.options.activeSubjects ?? []).filter((subject) => subject.generates_syllabus !== false), [data])
  const filter = useClientFilter(subjects, searchable, subjectFilters)
  const cycleOptions = [...new Set(subjects.map(cycleLabel))].sort(compareCycles)
  const byCycle = new Map<string, Subject[]>()
  for (const subject of filter.items) byCycle.set(cycleLabel(subject), [...(byCycle.get(cycleLabel(subject)) ?? []), subject])
  const groups = [...byCycle].sort(([left], [right]) => compareCycles(left, right)).map(([cycle, list]) => ({ cycle, list }))

  useEffect(() => {
    if (scope.data === null) router.replace(paths.dashboard)
  }, [scope.data, router])

  const load = (): Promise<void> => Promise.all([scope.refetch(), query.refetch()]).then(() => undefined)

  const changeTab = (value: string): void => {
    setTab(value)
    const query = new URLSearchParams(searchParams.toString())
    if (value === "documentos") query.set("tab", "documentos")
    else query.delete("tab")
    const search = query.toString()
    router.replace(search ? `${paths.coordination.careerProject}?${search}` : paths.coordination.careerProject)
  }

  const open = (subject: Subject): void => router.push(paths.coordination.careerProjectSubject(subject.id))

  const openFromKeyboard = (event: KeyboardEvent<HTMLDivElement>, subject: Subject): void => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    open(subject)
  }

  const saved = async (message = "Proyecto de carrera guardado"): Promise<void> => {
    toast.success(message)
    await load()
  }

  const documents = tab === "documentos"

  return (
    <PageFrame
      title={documents ? "Documentos de apoyo" : "Proyecto de carrera por materia"}
      description={documents ? "Material de la carrera que sus docentes pueden consultar" : "Contenido de cada materia que se copia en sus sílabos"}
      size="wide"
      loading={!data && !loadError}
      actionsSkeleton={!data && !loadError ? [documents ? "w-40" : "w-44"] : []}
      banner={data?.career.lock_reason && !documents ? <ProcessLockAlert banner lock={data.career.lock} /> : null}
      actions={
        documents ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Subir documento
          </Button>
        ) : (
          <FichaImportDialog disabled={Boolean(data?.career.lock_reason)} onApplied={(message) => void saved(message)} />
        )
      }
    >
      <Tabs value={tab} onValueChange={changeTab} className="gap-4">
        {!data && !loadError ? (
          <div data-skeleton="table-tabs" className="flex h-11 items-center gap-2" aria-hidden="true">
            {["w-16", "w-36"].map((width) => (
              <div key={width} className="flex h-full items-center gap-2 px-4">
                <Skeleton className="size-4" />
                <Skeleton className={cn("h-4", width)} />
              </div>
            ))}
          </div>
        ) : (
          <TabsList className="h-11 justify-start" aria-label="Vistas del proyecto de carrera">
            <TabsTrigger value="materias" className="flex-none gap-2 px-4 data-[state=active]:font-semibold">
              <BookOpen aria-hidden="true" />
              Materias
            </TabsTrigger>
            <TabsTrigger value="documentos" className="flex-none gap-2 px-4 data-[state=active]:font-semibold">
              <FileText aria-hidden="true" />
              Documentos de apoyo
            </TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="materias" className="flex flex-col gap-4">
          {loadError ? (
            <LoadErrorState message={loadError} onRetry={() => void load()} />
          ) : loading && !data ? (
            <LoadingSkeleton variant="accordion" rows={3} filters={2} />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <ClientFilterBar
                filter={filter}
                inputId="career-project-search"
                label="Buscar por materia"
                placeholder="Buscar por materia"
                filters={
                  <>
                    <Field>
                      <FieldLabel htmlFor="career-project-cycle" className="sr-only">
                        Ciclo
                      </FieldLabel>
                      <Select value={filter.values.ciclo} onValueChange={(value) => filter.setValue("ciclo", value)}>
                        <SelectTrigger id="career-project-cycle">
                          <SelectValue placeholder="Todos los ciclos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="all">Todos los ciclos</SelectItem>
                            {cycleOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="career-project-state" className="sr-only">
                        Estado del proyecto de carrera
                      </FieldLabel>
                      <Select value={filter.values.estado} onValueChange={(value) => filter.setValue("estado", value)}>
                        <SelectTrigger id="career-project-state">
                          <SelectValue placeholder="Todos los estados" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="all">Todos los estados</SelectItem>
                            <SelectItem value="complete">Completas</SelectItem>
                            <SelectItem value="incomplete">Incompletas</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                }
              />

              <div data-tour="career-subjects" className="flex flex-col gap-2">
                {!groups.length ? <EmptyState title={filter.active ? "Ninguna materia coincide con la búsqueda" : "La malla todavía no tiene materias"} /> : null}
                {groups.map((group) => (
                  <Collapsible key={`${group.cycle}-${filter.active}`} defaultOpen={filter.active} className="group/cycle rounded-md bg-card ring-1 ring-surface-ring">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold">
                      <span className="flex-1">{group.cycle === "Sin ciclo" ? group.cycle : `Ciclo ${group.cycle}`}</span>
                      <Badge variant={completeCount(group.list) === group.list.length ? "success" : "warning"} aria-label={`${completeCount(group.list)} de ${group.list.length} asignaturas completas`}>
                        {completeCount(group.list)}/{group.list.length}
                      </Badge>
                      <ChevronDown className="size-4 transition-transform group-data-[state=open]/cycle:rotate-180" aria-hidden="true" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t bg-muted/60 p-3">
                      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={group.cycle === "Sin ciclo" ? "Materias sin ciclo" : `Materias del ciclo ${group.cycle}`}>
                        {group.list.map((subject) => (
                          <li key={subject.id}>
                            <Card
                              className="h-full cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
                              tabIndex={0}
                              aria-label={`Abrir el proyecto de carrera de ${subject.nombre}`}
                              onClick={() => open(subject)}
                              onKeyDown={(event) => openFromKeyboard(event, subject)}
                            >
                              <CardHeader>
                                <CardTitle>{subject.nombre}</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <StatusBadge label={statusOf(subject)} tone={subject.profile_complete ? "success" : "warning"} />
                              </CardContent>
                            </Card>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="documentos" className="flex flex-col gap-4">
          <SupportDocumentsPanel manages uploadOpen={uploadOpen} onUploadOpenChange={setUploadOpen} />
        </TabsContent>
      </Tabs>
    </PageFrame>
  )
}
