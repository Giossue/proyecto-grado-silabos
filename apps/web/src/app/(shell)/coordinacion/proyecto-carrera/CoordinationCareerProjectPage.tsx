"use client"

import { BookOpen, ChevronDown, FileText, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { type ScheduledSubjects } from "@/api/career-academics"
import { AdminCareerBackLink, AdminCareerTabs, type AdminCareer } from "@/components/domain/academic/AdminCareerNavigation"
import { FichaImportDialog } from "@/components/domain/academic/FichaImportDialog"
import { IconTooltip } from "@/components/domain/IconTooltip"
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
import { useAcademicCareerScope } from "@/composables/useAcademicCareerScope"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { paths } from "@/lib/routes"
import { rowLinkClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { cn, withoutFinalPeriod } from "@/lib/utils"
import { queryErrorMessage } from "@/lib/queryClient"
import { coordinatorCareerQuery, scheduledSubjectsQuery } from "@/queries/careerAcademics"

// `malla_name` comes with each subject since careers can have several mallas (S8).
type Subject = ScheduledSubjects["options"]["activeSubjects"][number] & { malla_name?: string | null }

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

const PAGE_TITLE = "Proyecto de carrera por materia"
const SUBJECTS_DESCRIPTION = "Contenido de cada materia que se copia en sus sílabos"
const LOAD_ERROR = "No se pudo cargar el proyecto de carrera"

function TabsSkeleton() {
  return (
    <div data-skeleton="table-tabs" className="flex h-11 items-center gap-2" aria-hidden="true">
      {["w-16", "w-36"].map((width) => (
        <div key={width} className="flex h-full items-center gap-2 px-4">
          <Skeleton className="size-4" />
          <Skeleton className={cn("h-4", width)} />
        </div>
      ))}
    </div>
  )
}

const subjectsSkeleton = <LoadingSkeleton variant="accordion" rows={3} filters={2} />

/** Administration's screen while the career of the address is being found. */
export function AdminCareerProjectPending({ careerCode, error, onRetry }: { careerCode: string; error: string | null; onRetry: () => void }) {
  return (
    <PageFrame title={PAGE_TITLE} description={SUBJECTS_DESCRIPTION} size="wide" loading={!error} actionsSkeleton={error ? [] : ["w-44"]} eyebrow={<AdminCareerBackLink />}>
      <AdminCareerTabs careerCode={careerCode} current="project" />
      {error ? (
        <LoadErrorState message={error} onRetry={onRetry} />
      ) : (
        <div className="flex flex-col gap-4">
          <TabsSkeleton />
          {subjectsSkeleton}
        </div>
      )}
    </PageFrame>
  )
}

export default function CoordinationCareerProjectPage({ adminCareer = null }: { adminCareer?: AdminCareer | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const careerId = adminCareer?.id ?? null
  useAcademicCareerScope(careerId)
  const [tab, setTab] = useState(() => (careerId === null && searchParams.get("tab") === "documentos" ? "documentos" : "materias"))
  const [uploadOpen, setUploadOpen] = useState(false)
  const scope = useQuery(coordinatorCareerQuery(careerId))
  const query = useQuery({ ...scheduledSubjectsQuery(careerId), enabled: typeof scope.data === "string" })
  const data = query.data ?? null
  const loading = scope.isFetching || query.isFetching
  const loadError = queryErrorMessage(scope, LOAD_ERROR) ?? queryErrorMessage(query, LOAD_ERROR)

  const subjects = useMemo((): Subject[] => (data?.options.activeSubjects ?? []).filter((subject) => subject.generates_syllabus !== false), [data])
  const filter = useClientFilter(subjects, searchable, subjectFilters)
  const cycleOptions = [...new Set(subjects.map(cycleLabel))].sort(compareCycles)
  const severalMallas = new Set(subjects.map((subject) => subject.malla_name).filter(Boolean)).size > 1
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

  const saved = async (message = "Proyecto de carrera guardado"): Promise<void> => {
    toast.success(message)
    await load()
  }

  const documents = tab === "documentos"
  const profileLock = data?.career.profile_lock_reason ?? null
  const fichaImport = <FichaImportDialog disabled={Boolean(profileLock)} onApplied={(message) => void saved(message)} />
  const subjectHref = ({ malla_code: malla, codigo_asignatura: code }: Subject): string =>
    adminCareer ? paths.admin.careerProjectSubject(adminCareer.code, malla, code) : paths.coordination.careerProjectSubject(malla, code)
  const title = documents ? "Documentos de apoyo" : careerId && data ? `Proyecto de ${data.career.name}` : PAGE_TITLE

  return (
    <PageFrame
      title={title}
      eyebrow={careerId ? <AdminCareerBackLink /> : null}
      description={documents ? "Material de la carrera que sus docentes pueden consultar" : SUBJECTS_DESCRIPTION}
      size="wide"
      loading={!data && !loadError}
      actionsSkeleton={!data && !loadError ? [documents ? "w-40" : "w-44"] : []}
      banner={profileLock && !documents ? <ProcessLockAlert banner message={profileLock} hideAction /> : null}
      actions={
        documents ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Subir documento
          </Button>
        ) : (
          profileLock ? (
            <>
              <IconTooltip label={withoutFinalPeriod(profileLock)}>
                <span className="inline-flex" tabIndex={0} aria-describedby="ficha-import-lock">
                  {fichaImport}
                </span>
              </IconTooltip>
              <span id="ficha-import-lock" className="sr-only">
                {profileLock}
              </span>
            </>
          ) : (
            fichaImport
          )
        )
      }
    >
      {adminCareer ? <AdminCareerTabs careerCode={adminCareer.code} current="project" /> : null}
      <Tabs value={tab} onValueChange={changeTab} className="gap-4">
        {!data && !loadError ? (
          <TabsSkeleton />
        ) : careerId ? null : (
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
            subjectsSkeleton
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
                            <Card className="relative h-full cursor-pointer transition-colors hover:bg-accent/40 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
                              <CardHeader>
                                <CardTitle>
                                  <Link href={subjectHref(subject)} className={cn(rowLinkClass, "after:absolute after:inset-0 after:rounded-[inherit] focus-visible:ring-0")}>
                                    {subject.nombre}
                                  </Link>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="flex flex-wrap items-center gap-2">
                                {severalMallas && subject.malla_name ? <Badge variant="outline">{subject.malla_name}</Badge> : null}
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
        {careerId ? null : (
          <TabsContent value="documentos" className="flex flex-col gap-4">
            <SupportDocumentsPanel manages uploadOpen={uploadOpen} onUploadOpenChange={setUploadOpen} />
          </TabsContent>
        )}
      </Tabs>
    </PageFrame>
  )
}
