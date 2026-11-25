"use client"

import { ArrowLeft, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useEffectEvent, useState } from "react"
import { ApiError } from "@/api/client"
import { getScheduledSubjects, getSubjectProfile, getSubjectProfilePreview, saveSubjectProfile, type ScheduledSubjects, type SubjectProfileField, type SubjectProfilePreview } from "@/api/career-academics"
import { IconTooltip } from "@/components/domain/IconTooltip"
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
import { useDiscardConfirmation } from "@/composables/useDiscardConfirmation"
import { goBack } from "@/lib/goBack"
import { RESPONSE_NODE, responseAttrs, responseNeedsOptions } from "@/lib/responseKinds"
import { paths } from "@/lib/routes"
import { nodesOfType, type DocumentNode } from "@/lib/templateDocument"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { careerAcademicKeys } from "@/queries/careerAcademics"

type Subject = ScheduledSubjects["options"]["activeSubjects"][number]
type Values = Record<string, DocumentNode | null>
type Loaded = { career: ScheduledSubjects["career"]; subjects: Subject[]; subjectName: string; fields: SubjectProfileField[]; values: Values }

const GENERAL = "General"
const sectionOf = (field: SubjectProfileField): string => field.section?.trim() || GENERAL
const cycleLabel = (cycle: number): string => (cycle ? `Ciclo ${cycle}` : "Sin ciclo")
const valuesFrom = (fields: SubjectProfileField[], stored: Record<string, DocumentNode | null | undefined>): Values =>
  Object.fromEntries(fields.map((field) => [field.id, stored[field.id] ?? field.template ?? field.content ?? null]))

const loadProfile = async (subjectId: string): Promise<Loaded> => {
  const [scheduled, profile] = await Promise.all([getScheduledSubjects(), getSubjectProfile(subjectId)])
  const fields = profile.fields.toSorted((first, second) => (first.position ?? 0) - (second.position ?? 0))

  return {
    career: scheduled.career,
    subjects: scheduled.options.activeSubjects
      .filter((subject) => subject.generates_syllabus !== false)
      .map((subject, order) => ({ subject, order }))
      .sort((first, second) => (first.subject.ciclo || Infinity) - (second.subject.ciclo || Infinity) || first.order - second.order)
      .map(({ subject }) => subject),
    subjectName: scheduled.options.activeSubjects.find((subject) => subject.id === subjectId)?.nombre ?? "",
    fields,
    values: valuesFrom(fields, profile.values),
  }
}

function SubjectProfile({ subjectId }: { subjectId: string }) {
  const router = useRouter()
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

  const career = data?.career ?? null
  const subjects = data?.subjects ?? []
  const fields = data?.fields ?? []
  const subjectIndex = subjects.findIndex((subject) => subject.id === subjectId)
  const previousSubject = subjectIndex > 0 ? subjects[subjectIndex - 1] : null
  const nextSubject = subjectIndex >= 0 ? (subjects[subjectIndex + 1] ?? null) : null
  const byCycle = new Map<number, Subject[]>()
  for (const subject of subjects) byCycle.set(subject.ciclo, [...(byCycle.get(subject.ciclo) ?? []), subject])
  const subjectGroups = [...byCycle].map(([cycle, list]) => ({ cycle, list }))
  const changed = !loading && JSON.stringify(values) !== loaded
  const locked = Boolean(career?.lock_reason)
  const sections = [...new Set(fields.map(sectionOf))]
  const activeSection = chosen !== null && sections.includes(chosen) ? chosen : (sections[0] ?? "")
  const shownFields = fields.filter((field) => sectionOf(field) === activeSection)
  const missingOptions = (field: SubjectProfileField): boolean =>
    nodesOfType(values[field.id] ?? field.template ?? field.content, RESPONSE_NODE).some((node) => responseNeedsOptions(responseAttrs(node)))
  const sectionMissing = (section: string): boolean => fields.some((field) => sectionOf(field) === section && missingOptions(field))
  const canSave = !saving && !locked && fields.length > 0 && changed

  const fetchProfile = useCallback(async (): Promise<void> => {
    try {
      const next = await queryClient.fetchQuery({ queryKey: careerAcademicKeys.subjectProfile(subjectId), queryFn: () => loadProfile(subjectId), staleTime: 0 })
      setData(next)
      setValues(next.values)
      setLoaded(JSON.stringify(next.values))
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "No se pudo abrir el proyecto de carrera")
    } finally {
      setLoading(false)
    }
  }, [queryClient, subjectId])

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
    if (id !== "" && id !== subjectId) void leave(() => router.push(paths.coordination.careerProjectSubject(id)))
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
      title={data?.subjectName ? `Proyecto de carrera de ${data.subjectName}` : "Proyecto de carrera"}
      description="Lo que escriba le llega fijo al docente. Un campo que deje vacío lo escribe el docente"
      size="wide"
      loading={loading && !loadError}
      actionsSkeleton={loading ? ["w-9", "w-52"] : []}
      eyebrow={
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => void leave(() => goBack(router, paths.coordination.careerProject))}>
          <ArrowLeft aria-hidden="true" />
          Volver al proyecto de carrera
        </Button>
      }
      banner={locked && career?.lock ? <ProcessLockAlert banner lock={career.lock} /> : null}
      actions={
        !loading && !loadError && fields.length > 0 ? (
          <>
            {subjects.length > 1 ? (
              <div className="flex items-center gap-1">
                <IconTooltip label="Materia anterior">
                  <Button type="button" variant="ghost" size="icon" aria-label="Materia anterior" disabled={!previousSubject} onClick={() => previousSubject && openSubject(previousSubject.id)}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                </IconTooltip>
                <Select value={subjectId} onValueChange={openSubject}>
                  <SelectTrigger className="w-56" aria-label="Cambiar de materia">
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
                <IconTooltip label="Materia siguiente">
                  <Button type="button" variant="ghost" size="icon" aria-label="Materia siguiente" disabled={!nextSubject} onClick={() => nextSubject && openSubject(nextSubject.id)}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </IconTooltip>
              </div>
            ) : null}
            <IconTooltip label={view === "vista-previa" ? "Volver a editar" : "Vista previa"}>
              <Button type="button" variant={view === "vista-previa" ? "secondary" : "ghost"} size="icon" aria-label="Vista previa" aria-pressed={view === "vista-previa"} onClick={toggleView}>
                <Eye aria-hidden="true" />
              </Button>
            </IconTooltip>
            <Button type="button" disabled={!canSave} onClick={() => void save()}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Guardar proyecto de carrera
            </Button>
          </>
        ) : null
      }
    >
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : loading ? (
        <LoadingSkeleton variant="form" rows={4} sidebar />
      ) : fields.length === 0 ? (
        <Alert>
          <AlertDescription>La plantilla no tiene campos de Carrera. Pídale a Administración que los agregue</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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
          <div className={cn("flex flex-col gap-6 md:min-h-96 md:flex-row md:items-start", view !== "editar" && "hidden")}>
            {sections.length > 1 ? (
              <Tabs value={activeSection} onValueChange={setChosen} orientation="vertical" className="w-full shrink-0 md:sticky md:top-4 md:w-72">
                <TabsList className="h-auto w-full flex-col items-stretch justify-start gap-1" aria-label="Secciones del proyecto de carrera">
                  {sections.map((section) => (
                    <TabsTrigger key={section} value={section} className="h-auto flex-none justify-start border-b-0 border-l-2 py-2 text-left whitespace-normal">
                      {section}
                      {sectionMissing(section) ? (
                        <>
                          <span className="ml-1 text-warning" aria-hidden="true">
                            ●
                          </span>
                          <span className="sr-only"> (con espacios sin opciones)</span>
                        </>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : null}
            <fieldset className="flex min-w-0 flex-1 flex-col gap-7 rounded-md bg-card p-6 text-card-foreground shadow-surface ring-1 ring-surface-ring" disabled={locked}>
              {shownFields.map((field) => (
                <Field key={field.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <FieldLabel htmlFor={`ficha-${field.id}`} className={cn(!field.label.trim() && "sr-only")}>
                      {field.label.trim() || sectionOf(field)}
                    </FieldLabel>
                    {missingOptions(field) ? <StatusBadge label="Faltan opciones" tone="warning" /> : null}
                  </div>
                  <FieldResponseEditor
                    id={`ficha-${field.id}`}
                    template={field.template}
                    label={field.label.trim() || sectionOf(field)}
                    disabled={locked}
                    career
                    askFor="a Administración"
                    value={values[field.id]}
                    onValueChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
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

export default function CoordinationSubjectProfilePage() {
  const params = useParams<{ subject?: string }>()
  const subjectId = String(params?.subject ?? "")

  return <SubjectProfile key={subjectId} subjectId={subjectId} />
}
