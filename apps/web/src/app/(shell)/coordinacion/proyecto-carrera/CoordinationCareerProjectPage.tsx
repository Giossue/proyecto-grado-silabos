"use client"

import { BookOpen, ChevronDown, FileText, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { type ScheduledSubjects } from "@/api/career-academics"
import { AdminCareerBackLink, AdminCareerTabs, type AdminCareer } from "@/components/domain/academic/AdminCareerNavigation"
import { MallaToolbar, isOfMalla, openMallas, shownMalla } from "@/components/domain/academic/curriculum/MallaToolbar"
import { BulkFieldDialog, type BulkSubject } from "@/components/domain/academic/BulkFieldDialog"
import { SubjectSelectionBar } from "@/components/domain/academic/SubjectSelectionBar"
import { SupportDocumentsPanel } from "@/components/domain/academic/SupportDocumentsPanel"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { EmptyState } from "@/components/domain/EmptyState"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { MallaSelectorSkeleton } from "@/components/domain/loading/MallaSelectorSkeleton"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { CAREER_PROFILE_PAUSE_TO_EDIT } from "@silabos/shared/lib/careerProfileLock"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAcademicCareerScope } from "@/composables/useAcademicCareerScope"
import { useClientFilter, type ClientFilterDefinition } from "@/composables/useClientFilter"
import { sameCode } from "@/composables/useCodeLookup"
import { paths } from "@/lib/routes"
import { rowLinkClass } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { queryErrorMessage } from "@/lib/queryClient"
import { coordinatorCareerQuery, mallasQuery, scheduledSubjectsQuery } from "@/queries/careerAcademics"

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
const cycleSelectionLabel = (cycle: string): string => (cycle === "Sin ciclo" ? "Seleccionar las materias sin ciclo" : `Seleccionar las materias del ciclo ${cycle}`)

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

const subjectsSkeleton = (
  <div className="flex min-w-0 flex-col gap-4">
    <MallaSelectorSkeleton />
    <LoadingSkeleton variant="accordion" rows={3} filters={2} selectable />
  </div>
)

/** Administration's screen while the career of the address is being found. */
export function AdminCareerProjectPending({ careerCode, error, onRetry }: { careerCode: string; error: string | null; onRetry: () => void }) {
  return (
    <PageFrame title={PAGE_TITLE} description={SUBJECTS_DESCRIPTION} size="wide" loading={!error} actionsSkeleton={[]} eyebrow={<AdminCareerBackLink />}>
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
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set())
  const [filling, setFilling] = useState<BulkSubject[]>([])
  const [fillOpen, setFillOpen] = useState(false)
  const scope = useQuery(coordinatorCareerQuery(careerId))
  const query = useQuery({ ...scheduledSubjectsQuery(careerId), enabled: typeof scope.data === "string" })
  const data = query.data ?? null
  const mallasState = useQuery({ ...mallasQuery(careerId), enabled: typeof scope.data === "string" })
  const loading = scope.isFetching || query.isFetching || mallasState.isFetching
  const loadError = queryErrorMessage(scope, LOAD_ERROR) ?? queryErrorMessage(query, LOAD_ERROR)
  const subjectsError = loadError ?? queryErrorMessage(mallasState, LOAD_ERROR)
  const subjectsReady = data !== null && mallasState.data !== undefined

  const addressMalla = searchParams.get("malla")
  const [chosenMalla, setChosenMalla] = useState({ address: addressMalla, code: addressMalla })
  if (chosenMalla.address !== addressMalla) setChosenMalla({ address: addressMalla, code: addressMalla })
  const mallas = openMallas(mallasState.data ?? [])
  const malla = shownMalla(mallas, mallas.find((item) => sameCode(item.code, chosenMalla.code ?? ""))?.id ?? null)

  const subjects = useMemo(
    (): Subject[] => (data?.options.activeSubjects ?? []).filter((subject) => malla !== null && isOfMalla(subject, malla) && subject.generates_syllabus !== false),
    [data, malla],
  )
  const filter = useClientFilter(subjects, searchable, subjectFilters)
  const cycleOptions = [...new Set(subjects.map(cycleLabel))].sort(compareCycles)
  const byCycle = new Map<string, Subject[]>()
  for (const subject of filter.items) byCycle.set(cycleLabel(subject), [...(byCycle.get(cycleLabel(subject)) ?? []), subject])
  const groups = [...byCycle].sort(([left], [right]) => compareCycles(left, right)).map(([cycle, list]) => ({ cycle, list }))
  useEffect(() => {
    if (scope.data === null) router.replace(paths.dashboard)
  }, [scope.data, router])

  const load = (): Promise<void> => Promise.all([scope.refetch(), query.refetch(), mallasState.refetch()]).then(() => undefined)

  const replaceAddress = (name: string, value: string | null): void => {
    const query = new URLSearchParams(searchParams.toString())
    if (value === null) query.delete(name)
    else query.set(name, value)
    const search = query.toString()
    const base = adminCareer ? paths.admin.careerProject(adminCareer.code) : paths.coordination.careerProject
    router.replace(search ? `${base}?${search}` : base)
  }

  const changeTab = (value: string): void => {
    setTab(value)
    replaceAddress("tab", value === "documentos" ? value : null)
  }

  const chooseMalla = (mallaId: string): void => {
    const next = mallas.find((item) => item.id === mallaId)
    if (!next) return
    setChosenMalla({ address: addressMalla, code: next.code })
    setMarked(new Set())
    filter.clear()
    replaceAddress("malla", next.code.toLowerCase())
  }

  const saved = async (message = "Proyecto de carrera guardado"): Promise<void> => {
    toast.success(message)
    await load()
  }

  const documents = tab === "documentos"
  const profileLock = data?.career.profile_lock_reason ?? null
  const selectable = !profileLock
  const selected = subjects.filter((subject) => marked.has(subject.id))
  const selectionOf = (list: Subject[]): boolean | "indeterminate" => {
    const count = list.filter((subject) => marked.has(subject.id)).length
    return count === 0 ? false : count === list.length ? true : "indeterminate"
  }
  const select = (list: Subject[], value: boolean): void => {
    setMarked((previous) => {
      const next = new Set(previous)
      for (const subject of list) {
        if (value) next.add(subject.id)
        else next.delete(subject.id)
      }
      return next
    })
  }
  const openFill = (): void => {
    setFilling(selected.map((subject) => ({ id: subject.id, name: subject.nombre, code: subject.codigo_asignatura })))
    setFillOpen(true)
  }
  const filled = (message: string): void => {
    setMarked(new Set())
    void saved(message)
  }
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
      actionsSkeleton={!data && !loadError && documents ? ["w-40"] : []}
      banner={profileLock && !documents ? <ProcessLockAlert banner message={profileLock} hideAction={profileLock !== CAREER_PROFILE_PAUSE_TO_EDIT} /> : null}
      actions={
        documents ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Subir documento
          </Button>
        ) : null
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
        {!documents && subjectsReady && !subjectsError && malla ? <MallaToolbar className="max-sm:max-w-none" mallas={mallas} selected={malla} onSelect={chooseMalla} /> : null}
        <TabsContent value="materias" className="flex flex-col gap-4">
          {subjectsError ? (
            <LoadErrorState message={subjectsError} onRetry={() => void load()} />
          ) : subjectsReady ? (
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

              {selectable && filter.items.length ? (
                <div data-tour="career-select" className="flex w-fit items-center gap-3 px-4">
                  <Checkbox id="career-project-select-all" aria-label="Seleccionar todas las materias que se ven" checked={selectionOf(filter.items)} onCheckedChange={(value) => select(filter.items, value === true)} />
                  <FieldLabel htmlFor="career-project-select-all" className="font-normal">
                    {filter.active ? "Seleccionar las que se ven" : "Seleccionar todas"}
                  </FieldLabel>
                </div>
              ) : null}

              <div data-tour="career-subjects" className="flex flex-col gap-2">
                {!groups.length ? (
                  <EmptyState title={filter.active ? "Ninguna materia coincide con la búsqueda" : malla ? "La malla todavía no tiene materias" : "La carrera no tiene mallas vigentes"} />
                ) : null}
                {groups.map((group) => (
                  <Collapsible key={`${malla?.id}-${group.cycle}-${filter.active}`} defaultOpen={filter.active} className="group/cycle rounded-md bg-card ring-1 ring-surface-ring">
                    <div className="flex items-center">
                    {selectable ? <Checkbox className="ml-4" aria-label={cycleSelectionLabel(group.cycle)} checked={selectionOf(group.list)} onCheckedChange={(value) => select(group.list, value === true)} /> : null}
                    <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left font-semibold">
                      <span className="flex-1">{group.cycle === "Sin ciclo" ? group.cycle : `Ciclo ${group.cycle}`}</span>
                      <Badge variant={completeCount(group.list) === group.list.length ? "success" : "warning"} aria-label={`${completeCount(group.list)} de ${group.list.length} asignaturas completas`}>
                        {completeCount(group.list)}/{group.list.length}
                      </Badge>
                      <ChevronDown className="size-4 transition-transform group-data-[state=open]/cycle:rotate-180" aria-hidden="true" />
                    </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="border-t bg-muted/60 p-3">
                      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={group.cycle === "Sin ciclo" ? "Materias sin ciclo" : `Materias del ciclo ${group.cycle}`}>
                        {group.list.map((subject) => (
                          <li key={subject.id}>
                            <Card className={cn("relative h-full cursor-pointer transition-colors hover:bg-accent/40 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50", selectable && marked.has(subject.id) && "bg-accent/40 ring-2 ring-primary")}>
                              {selectable ? (
                                <Checkbox className="absolute top-4 right-4 z-10 bg-card" aria-label={`Seleccionar ${subject.nombre}`} checked={marked.has(subject.id)} onCheckedChange={(value) => select([subject], value === true)} />
                              ) : null}
                              <CardHeader className={cn(selectable && "pr-12")}>
                                <CardTitle>
                                  <Link href={subjectHref(subject)} className={cn(rowLinkClass, "after:absolute after:inset-0 after:rounded-[inherit] focus-visible:ring-0")}>
                                    {subject.nombre}
                                  </Link>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="flex flex-wrap items-center gap-2">
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
              {selectable && selected.length ? <SubjectSelectionBar count={selected.length} onFill={openFill} onClear={() => setMarked(new Set())} /> : null}
            </div>
          ) : loading ? (
            subjectsSkeleton
          ) : null}
        </TabsContent>
        {careerId ? null : (
          <TabsContent value="documentos" className="flex flex-col gap-4">
            <SupportDocumentsPanel manages uploadOpen={uploadOpen} onUploadOpenChange={setUploadOpen} />
          </TabsContent>
        )}
      </Tabs>
      <BulkFieldDialog open={fillOpen} onOpenChange={setFillOpen} subjects={filling} onApplied={filled} />
    </PageFrame>
  )
}
