"use client"

import { ArrowLeft, Eye, PencilLine, Save } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useEffectEvent, useState } from "react"
import { ApiError } from "@/api/client"
import { getScheduledSubjects, getSubjectProfile, getSubjectProfilePreview, saveSubjectProfile, type ScheduledSubjects, type SubjectProfileField, type SubjectProfilePreview } from "@/api/career-academics"
import type { AdminCareer } from "@/components/domain/academic/AdminCareerNavigation"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { StatusBadge } from "@/components/domain/StatusBadge"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { SyllabusDocumentPreview } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { useLeaveGuard } from "@/components/domain/syllabus/useLeaveGuard"
import { UnsavedChangesDialog } from "@/components/domain/UnsavedChangesDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAcademicCareerScope } from "@/composables/useAcademicCareerScope"
import { sameCode, useCodeLookup } from "@/composables/useCodeLookup"
import { useDiscardConfirmation } from "@/composables/useDiscardConfirmation"
import { goBack } from "@/lib/goBack"
import { RESPONSE_NODE, careerFieldUndecided, responseAttrs, responseNeedsOptions } from "@silabos/shared/lib/responseKinds"
import { keepDocumentMarks, withoutDocumentMarks } from "@/lib/teacherEdits"
import { paths } from "@/lib/routes"
import { nodesOfType, type DocumentNode } from "@silabos/shared/lib/templateDocument"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { queryErrorMessage } from "@/lib/queryClient"
import { careerAcademicKeys, scheduledSubjectsQuery } from "@/queries/careerAcademics"

type Subject = ScheduledSubjects["options"]["activeSubjects"][number]
type Values = Record<string, DocumentNode | null>
type Loaded = { subjects: Subject[]; subjectName: string; fields: SubjectProfileField[]; values: Values; lockReason: string | null }

const GENERAL = "General"
const sectionOf = (field: SubjectProfileField): string => field.section?.trim() || GENERAL
const cycleLabel = (cycle: number): string => (cycle ? `Ciclo ${cycle}` : "Sin ciclo")
const valuesFrom = (fields: SubjectProfileField[], stored: Record<string, DocumentNode | null | undefined>): Values =>
  Object.fromEntries(fields.map((field) => [field.id, stored[field.id] ?? field.template ?? field.content ?? null]))

const blankOf = (field: SubjectProfileField): DocumentNode => (field.template ?? field.content) as DocumentNode

const PAGE_TITLE = "Proyecto de carrera"
// Wider than the usual page, so it starts further left without reaching the edge on large screens.
const FRAME_CLASS = "mx-auto w-full max-w-[90rem]"
const ACTIONS_SKELETON = ["w-32", "w-48"]
const profileSkeleton = <LoadingSkeleton variant="form" rows={1} sidebar />

const projectPath = (career: AdminCareer | null): string => (career ? paths.admin.careerProject(career.code) : paths.coordination.careerProject)

function BackToProject({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onClick}>
      <ArrowLeft aria-hidden="true" />
      Volver al proyecto de carrera
    </Button>
  )
}

/** The screen while the subject of the address is being found. */
export function SubjectProfilePending({ adminCareer, error, onRetry }: { adminCareer: AdminCareer | null; error: string | null; onRetry: () => void }) {
  const router = useRouter()

  return (
    <PageFrame
      title={PAGE_TITLE}
      description=""
      withoutDescription
      size="full"
      className={FRAME_CLASS}
      loading={!error}
      actionsSkeleton={error ? [] : ACTIONS_SKELETON}
      eyebrow={<BackToProject onClick={() => goBack(router, projectPath(adminCareer))} />}
    >
      {error ? <LoadErrorState message={error} onRetry={onRetry} /> : profileSkeleton}
    </PageFrame>
  )
}

const loadProfile = async (subjectId: string, careerId: string | null): Promise<Loaded> => {
  const [scheduled, profile] = await Promise.all([getScheduledSubjects(careerId), getSubjectProfile(subjectId)])
  const fields = profile.fields.toSorted((first, second) => (first.position ?? 0) - (second.position ?? 0))

  return {
    subjects: scheduled.options.activeSubjects
      .filter((subject) => subject.generates_syllabus !== false)
      .map((subject, order) => ({ subject, order }))
      .sort((first, second) => (first.subject.ciclo || Infinity) - (second.subject.ciclo || Infinity) || first.order - second.order)
      .map(({ subject }) => subject),
    subjectName: scheduled.options.activeSubjects.find((subject) => subject.id === subjectId)?.nombre ?? "",
    fields,
    values: valuesFrom(fields, profile.values),
    lockReason: profile.lock_reason ?? null,
  }
}

function SubjectProfile({ subjectId, adminCareer }: { subjectId: string; adminCareer: AdminCareer | null }) {
  const router = useRouter()
  const careerId = adminCareer?.id ?? null
  useAcademicCareerScope(careerId)
  const projectHref = projectPath(adminCareer)
  const subjectHref = ({ malla_code: malla, codigo_asignatura: code }: Subject): string =>
    adminCareer ? paths.admin.careerProjectSubject(adminCareer.code, malla, code) : paths.coordination.careerProjectSubject(malla, code)
  const queryClient = useQueryClient()
  const [data, setData] = useState<Loaded | null>(null)
  const [values, setValues] = useState<Values>({})
  const [loaded, setLoaded] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [view, setView] = useState<"editar" | "vista-previa">("editar")
  const [preview, setPreview] = useState<SubjectProfilePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const { open: discardOpen, ask: askToDiscard, decide: decideDiscard } = useDiscardConfirmation()

  const lockReason = data?.lockReason ?? null
  const subjects = data?.subjects ?? []
  const fields = data?.fields ?? []
  const byCycle = new Map<number, Subject[]>()
  for (const subject of subjects) byCycle.set(subject.ciclo, [...(byCycle.get(subject.ciclo) ?? []), subject])
  const subjectGroups = [...byCycle].map(([cycle, list]) => ({ cycle, list }))
  const changed = !loading && JSON.stringify(values) !== loaded
  const locked = Boolean(lockReason)
  const sections = [...new Set(fields.map(sectionOf))]
  const activeSection = chosen !== null && sections.includes(chosen) ? chosen : (sections[0] ?? "")
  const shownFields = fields.filter((field) => sectionOf(field) === activeSection)
  const missingOptions = (field: SubjectProfileField): boolean =>
    nodesOfType(values[field.id] ?? field.template ?? field.content, RESPONSE_NODE).some((node) => responseNeedsOptions(responseAttrs(node)))
  const undecided = (field: SubjectProfileField): boolean => careerFieldUndecided(blankOf(field), values[field.id] ?? blankOf(field))
  const sectionPending = (section: string): boolean => fields.some((field) => sectionOf(field) === section && (undecided(field) || missingOptions(field)))
  const canSave = !saving && !locked && fields.length > 0 && changed

  const fetchProfile = useCallback(async (): Promise<void> => {
    try {
      const next = await queryClient.fetchQuery({ queryKey: careerAcademicKeys.subjectProfile(subjectId), queryFn: () => loadProfile(subjectId, careerId), staleTime: 0 })
      setData(next)
      setValues(next.values)
      setLoaded(JSON.stringify(next.values))
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "No se pudo abrir el proyecto de carrera")
    } finally {
      setLoading(false)
    }
  }, [careerId, queryClient, subjectId])

  const warnBeforeUnload = useEffectEvent((event: BeforeUnloadEvent): void => {
    if (!changed) return
    event.preventDefault()
    event.returnValue = ""
  })

  useEffect(() => {
    curriculumEditorState.setOpen(true)
    const onBeforeUnload = (event: BeforeUnloadEvent): void => warnBeforeUnload(event)
    window.addEventListener("beforeunload", onBeforeUnload)

    return () => {
      curriculumEditorState.setOpen(false)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchProfile)
  }, [fetchProfile])

  const load = (): void => {
    setLoading(true)
    setLoadError(null)
    void fetchProfile()
  }

  const leave = async (go: () => void): Promise<void> => {
    if (changed && !(await askToDiscard())) return
    go()
  }

  useLeaveGuard({ needed: () => changed, confirm: askToDiscard, navigate: (href) => router.push(href) })

  const openSubject = (id: string): void => {
    const next = subjects.find((subject) => subject.id === id)
    if (next && id !== subjectId) void leave(() => router.push(subjectHref(next)))
  }

  const loadPreview = async (): Promise<void> => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      setPreview(await queryClient.fetchQuery({ queryKey: careerAcademicKeys.subjectProfilePreview(subjectId), queryFn: () => getSubjectProfilePreview(subjectId), staleTime: 0 }))
    } catch (reason) {
      setPreviewError(reason instanceof ApiError ? reason.message : "No se pudo armar la vista previa")
    } finally {
      setPreviewLoading(false)
    }
  }

  const toggleView = (): void => {
    const next = view === "vista-previa" ? "editar" : "vista-previa"
    setView(next)
    if (next === "vista-previa" && !preview && !previewLoading) void loadPreview()
  }

  const previewSections = (preview?.sections ?? []).map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const profileField = fields.find((item) => item.id === field.id)
      if (!profileField) return field
      const document = values[field.id] ?? profileField.template ?? profileField.content

      return { ...field, value: document, document } as typeof field
    }),
  }))

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const profile = await saveSubjectProfile(subjectId, values)
      const next = valuesFrom(fields, profile.values)
      setValues(next)
      setLoaded(JSON.stringify(next))
      setPreview(null)
      toast.success("Proyecto de carrera guardado")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo guardar el proyecto de carrera")
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageFrame
      title={data?.subjectName ? `Proyecto de carrera de ${data.subjectName}` : PAGE_TITLE}
      description=""
      withoutDescription
      size="full"
      className={FRAME_CLASS}
      loading={loading && !loadError}
      actionsSkeleton={loading ? ACTIONS_SKELETON : []}
      eyebrow={<BackToProject onClick={() => void leave(() => goBack(router, projectHref))} />}
      banner={lockReason ? <ProcessLockAlert banner message={lockReason} hideAction /> : null}
      actions={
        !loading && !loadError && fields.length > 0 ? (
          <>
            <Button type="button" variant={view === "vista-previa" ? "secondary" : "outline"} onClick={toggleView}>
              {view === "vista-previa" ? <PencilLine data-icon="inline-start" aria-hidden="true" /> : <Eye data-icon="inline-start" aria-hidden="true" />}
              {view === "vista-previa" ? "Volver a editar" : "Vista previa"}
            </Button>
            <Button type="button" disabled={!canSave} onClick={() => void save()}>
              {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
              Guardar información
            </Button>
          </>
        ) : null
      }
    >
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : loading ? (
        profileSkeleton
      ) : fields.length === 0 ? (
        <Alert>
          <AlertDescription>La plantilla no tiene campos que llene Coordinación. Pídale a Administración que los agregue</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className={cn("flex flex-col gap-6", view === "editar" && "md:min-h-96 md:flex-row md:items-start")}>
            {subjects.length > 1 || sections.length > 1 ? (
              <div className={cn("flex w-full shrink-0 flex-col gap-3 md:w-72", view === "editar" && "md:sticky md:top-4")}>
                {subjects.length > 1 ? (
                  <Select value={subjectId} onValueChange={openSubject}>
                    <SelectTrigger className="w-full" aria-label="Cambiar de materia">
                      <SelectValue placeholder="Cambiar de materia" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectGroups.map((group) => (
                        <SelectGroup key={group.cycle}>
                          <SelectLabel>{cycleLabel(group.cycle)}</SelectLabel>
                          {group.list.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.nombre}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {sections.length > 1 ? (
                  <Tabs value={activeSection} onValueChange={setChosen} orientation="vertical" className={cn("w-full", view !== "editar" && "hidden")}>
                    <TabsList className="h-auto w-full flex-col items-stretch justify-start gap-1" aria-label="Secciones del proyecto de carrera">
                      {sections.map((section) => (
                        <TabsTrigger key={section} value={section} className="h-auto flex-none justify-start border-b-0 border-l-2 py-2 text-left whitespace-normal">
                          {section}
                          {sectionPending(section) ? (
                            <>
                              <span className="ml-1 text-warning" aria-hidden="true">
                                ●
                              </span>
                              <span className="sr-only"> (con campos pendientes)</span>
                            </>
                          ) : null}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : null}
              </div>
            ) : null}
            {view === "vista-previa" ? (
              previewError ? (
                <Alert variant="destructive">
                  <AlertDescription>{previewError}</AlertDescription>
                </Alert>
              ) : previewLoading || !preview ? (
                <LoadingSkeleton variant="preview" />
              ) : (
                <SyllabusDocumentPreview presentation={preview.presentation} sections={previewSections} />
              )
            ) : null}
            <fieldset className={cn("flex min-w-0 flex-1 flex-col gap-7 rounded-md bg-card p-6 text-card-foreground shadow-surface ring-1 ring-surface-ring", view !== "editar" && "hidden")} disabled={locked}>
              {shownFields.map((field) => (
                <Field key={field.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <FieldLabel htmlFor={`ficha-${field.id}`} className={cn(!field.label.trim() && "sr-only")}>
                      {field.label.trim() || sectionOf(field)}
                    </FieldLabel>
                    {undecided(field) ? <StatusBadge label="Sin definir" tone="warning" /> : null}
                    {missingOptions(field) ? <StatusBadge label="Faltan opciones" tone="warning" /> : null}
                  </div>
                  <FieldResponseEditor
                    id={`ficha-${field.id}`}
                    template={field.template}
                    label={field.label.trim() || sectionOf(field)}
                    disabled={locked}
                    career
                    askFor="a Administración"
                    value={values[field.id] ? withoutDocumentMarks(values[field.id]!) : values[field.id]}
                    onValueChange={(next) => setValues((current) => ({ ...current, [field.id]: keepDocumentMarks(next, current[field.id], blankOf(field)) }))}
                  />
                </Field>
              ))}
            </fieldset>
          </div>
        </div>
      )}
      <UnsavedChangesDialog
        open={discardOpen}
        title="Hay cambios sin guardar"
        description="Los cambios del proyecto de carrera no se guardaron. Si sale, los perderá"
        discardLabel="Salir y descartar cambios"
        onContinue={() => decideDiscard(false)}
        onDiscard={() => decideDiscard(true)}
        onOpenChange={(open) => {
          if (!open) decideDiscard(false)
        }}
      />
    </PageFrame>
  )
}

export default function CoordinationSubjectProfilePage({ adminCareer = null }: { adminCareer?: AdminCareer | null }) {
  const params = useParams<{ malla?: string; subject?: string }>()
  const mallaCode = String(params?.malla ?? "")
  const subjectCode = String(params?.subject ?? "")
  const careerId = adminCareer?.id ?? null
  const subjects = useQuery(scheduledSubjectsQuery(careerId))
  // A subject code is only unique inside its malla.
  const subjectId = useCodeLookup(`${careerId ?? ""}/${mallaCode}/${subjectCode}`, subjects, (data) =>
    data.options.activeSubjects.find((subject) => sameCode(subject.malla_code, mallaCode) && sameCode(subject.codigo_asignatura, subjectCode))?.id,
  )

  if (subjectId === null) {
    return <SubjectProfilePending adminCareer={adminCareer} error={queryErrorMessage(subjects, "No se pudo abrir el proyecto de carrera")} onRetry={() => void subjects.refetch()} />
  }

  return <SubjectProfile key={subjectId} subjectId={subjectId} adminCareer={adminCareer} />
}
