"use client"

import { ArrowLeft, Pencil, PencilLine, Save, Undo2, UserPlus } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react"
import { type Curriculum } from "@/api/career-academics"
import type { BoardInset } from "@/components/domain/academic/curriculum/CurriculumCanvas"
import { AdminCareerBackLink, AdminCareerTabs, type AdminCareer } from "@/components/domain/academic/AdminCareerNavigation"
import { MallaDialog } from "@/components/domain/academic/curriculum/MallaDialog"
import { MallaToolbar, mallaLabel, shownMalla } from "@/components/domain/academic/curriculum/MallaToolbar"
import { useCurriculumDraft } from "@/components/domain/academic/curriculum/useCurriculumDraft"
import { ScheduledSubjectsTab } from "@/components/domain/academic/ScheduledSubjectsTab"
import { TeacherAssignmentsPanel } from "@/components/domain/academic/TeacherAssignmentsPanel"
import { ManagedUserDialog } from "@/components/domain/identity/ManagedUserDialog"
import { ImportSpreadsheetDialog } from "@/components/domain/ImportSpreadsheetDialog"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { useLeaveGuard } from "@/components/domain/syllabus/useLeaveGuard"
import { UnsavedChangesDialog } from "@/components/domain/UnsavedChangesDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { useAcademicCareerScope } from "@/composables/useAcademicCareerScope"
import { useDiscardConfirmation } from "@/composables/useDiscardConfirmation"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { errorMessage, failedQuery } from "@/lib/queryClient"

const CurriculumCanvas = dynamic(() => import("@/components/domain/academic/curriculum/CurriculumCanvas").then((module) => module.CurriculumCanvas), {
  loading: () => <LoadingSkeleton variant="academic-structure" mode="curriculum" />,
})
import { coordinatorCareerQuery, curriculumQuery, mallasQuery, scheduledSubjectsQuery, teacherAssignmentsQuery } from "@/queries/careerAcademics"

export type AcademicStructureMode = "curriculum" | "schedule" | "teachers"

const pageTitles: Record<AcademicStructureMode, string> = { curriculum: "Malla", schedule: "Materias y asignaciones", teachers: "Docentes" }
const pageDescriptions: Record<AcademicStructureMode, string> = {
  curriculum: "Malla curricular de su carrera",
  schedule: "Materias, paralelos y docentes de su carrera",
  teachers: "Docentes de su carrera",
}
const adminDescriptions: Record<AcademicStructureMode, string> = {
  curriculum: "Malla curricular de la carrera",
  schedule: "Materias, paralelos y docentes de la carrera",
  teachers: "Docentes de la carrera",
}
const actionSkeletons: Record<AcademicStructureMode, string[]> = { teachers: ["w-44", "w-36"], curriculum: ["w-48", "w-32"], schedule: [] }
const teacherColumns = [
  { key: "nombre", label: "Nombre" },
  { key: "correo", label: "Correo" },
]
const curriculumColumns = [
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Materia" },
  { key: "ciclo", label: "Ciclo" },
  { key: "unidad", label: "Unidad" },
  { key: "genera_silabo", label: "Genera sílabo" },
]

const NO_SUBJECTS: Curriculum["subjects"] = []
const NO_REQUIREMENTS: Curriculum["requirements"] = []

const locked = (current: Curriculum | null): boolean => Boolean(current && (!current.curriculum.editable || current.curriculum.lock_reason))

const removeLegacyBreakdownMode = (): void => {
  const url = new URL(window.location.href)
  if (url.searchParams.get("modo") !== "desglose") return
  url.searchParams.delete("modo")
  window.history.replaceState(window.history.state, "", url)
}

/** Administration's screen while the career of the address is being found. */
export function AdminCareerStructurePending({ mode, careerCode, error, onRetry }: { mode: AcademicStructureMode; careerCode: string; error: string | null; onRetry: () => void }) {
  return (
    <PageFrame
      title={pageTitles[mode]}
      description={adminDescriptions[mode]}
      size="wide"
      loading={!error}
      actionsSkeleton={error ? [] : actionSkeletons[mode]}
      eyebrow={<AdminCareerBackLink />}
    >
      <div data-career-tabs>
        <AdminCareerTabs careerCode={careerCode} current={mode} />
      </div>
      {error ? <LoadErrorState message={error} onRetry={onRetry} /> : <LoadingSkeleton variant="academic-structure" mode={mode} />}
    </PageFrame>
  )
}

export function CoordinationAcademicStructurePage({ mode, adminCareer = null }: { mode: AcademicStructureMode; adminCareer?: AdminCareer | null }) {
  const router = useRouter()
  const adminCareerId = adminCareer?.id ?? null
  useAcademicCareerScope(adminCareerId)
  const scope = useQuery(coordinatorCareerQuery(adminCareerId))
  const careerId = typeof scope.data === "string" ? scope.data : null
  const mallasState = useQuery({ ...mallasQuery(adminCareerId), enabled: careerId !== null })
  const mallas = mallasState.data ?? null
  const [chosenMallaId, setChosenMallaId] = useState<string | null>(null)
  const selectedMalla = shownMalla(mallas ?? [], chosenMallaId)
  const withoutMallas = mallas !== null && mallas.length === 0
  const curriculumState = useQuery({ ...curriculumQuery(selectedMalla?.id ?? "", adminCareerId), enabled: selectedMalla !== null })
  const scheduleState = useQuery({ ...scheduledSubjectsQuery(adminCareerId), enabled: careerId !== null })
  const assignmentsState = useQuery({ ...teacherAssignmentsQuery(adminCareerId), enabled: careerId !== null })
  const curriculum = curriculumState.data ?? null
  const schedule = scheduleState.data ?? null
  const assignments = assignmentsState.data ?? null
  const initialStates = withoutMallas ? [scope, mallasState, scheduleState, assignmentsState] : [scope, mallasState, curriculumState, scheduleState, assignmentsState]
  const failedInitial = initialStates.find((state) => failedQuery(state) && state.data === undefined)
  const loadError = failedInitial ? errorMessage(failedInitial.error, "No se pudo cargar la estructura académica") : null
  const loading = initialStates.some((state) => state.data === undefined && (state.isPending || state.isFetching))
  const [actionError, setActionError] = useState<string | null>(null)
  const [teacherOpen, setTeacherOpen] = useState(false)
  const [editingCurriculum, setEditingCurriculum] = useState(false)
  const [openingEditor, setOpeningEditor] = useState(false)
  const [createMallaOpen, setCreateMallaOpen] = useState(false)
  const [editMallaOpen, setEditMallaOpen] = useState(false)
  const [boardInset, setBoardInset] = useState<BoardInset | null>(null)

  const [seenCurriculum, setSeenCurriculum] = useState(curriculum)
  if (seenCurriculum !== curriculum) {
    setSeenCurriculum(curriculum)
    if (locked(curriculum)) setEditingCurriculum(false)
  }

  useEffect(() => {
    curriculumEditorState.setOpen(editingCurriculum)
  }, [editingCurriculum])

  useEffect(() => () => curriculumEditorState.setOpen(false), [])

  useEffect(() => {
    if (scope.data === null) router.replace(paths.dashboard)
  }, [router, scope.data])

  useEffect(() => {
    if (mode === "curriculum") removeLegacyBreakdownMode()
  }, [mode])

  const load = (): void => {
    void Promise.all(initialStates.filter((state) => state.data === undefined).map((state) => state.refetch()))
  }

  const reload = async (state: { refetch: () => Promise<{ isError: boolean; error: unknown }> }, fallback: string): Promise<void> => {
    setActionError(null)
    const result = await state.refetch()
    if (result.isError) setActionError(errorMessage(result.error, fallback))
  }

  const reloadSchedule = (): Promise<void> => reload(scheduleState, "No se pudo actualizar la programación académica")

  const reloadAssignments = (): Promise<void> => reload(assignmentsState, "No se pudieron actualizar las asignaciones docentes")

  const reloadCurriculum = async (): Promise<void> => {
    if (!curriculum?.career.id) return
    await reload(curriculumState, "No se pudo actualizar la malla")
  }

  const handleScheduleChanged = async (notice: string): Promise<void> => {
    toast.success(notice)
    await Promise.all([reloadSchedule(), reloadAssignments()])
  }

  const handleAssignmentChanged = async (notice: string): Promise<void> => {
    toast.success(notice)
    await Promise.all([reloadAssignments(), reloadSchedule()])
  }

  const handleCurriculumChanged = async (notice: string): Promise<void> => {
    toast.success(notice)
    await Promise.all([reloadCurriculum(), reload(mallasState, "No se pudieron actualizar las mallas")])
  }

  const draft = useCurriculumDraft({
    curriculumId: curriculum?.curriculum.id ?? "",
    subjects: curriculum?.subjects ?? NO_SUBJECTS,
    requirements: curriculum?.requirements ?? NO_REQUIREMENTS,
    onSaved: handleCurriculumChanged,
    onFailed: reloadCurriculum,
  })
  // Whatever closes the editor, a lock included, drops what was not saved.
  if (!editingCurriculum && draft.dirty) draft.discard()
  const { open: discardOpen, ask: askToDiscard, decide: decideDiscard } = useDiscardConfirmation()
  useLeaveGuard({ needed: () => draft.dirty, confirm: askToDiscard, navigate: (href) => router.push(href) })

  const switchMalla = async (mallaId: string): Promise<void> => {
    if (mallaId === selectedMalla?.id) return
    if (draft.dirty) {
      if (!(await askToDiscard())) return
      draft.discard()
    }
    setChosenMallaId(mallaId)
  }

  const latestSwitchMalla = useRef(switchMalla)
  useEffect(() => {
    latestSwitchMalla.current = switchMalla
  })

  const handleMallaSaved = async (notice: string, mallaId: string): Promise<void> => {
    toast.success(notice)
    await reload(mallasState, "No se pudieron actualizar las mallas")
    if (mallaId === curriculum?.curriculum.id) await reloadCurriculum()
    else await latestSwitchMalla.current(mallaId)
  }

  const warnBeforeUnload = useEffectEvent((event: BeforeUnloadEvent): void => {
    if (!draft.dirty) return
    event.preventDefault()
    event.returnValue = ""
  })

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => warnBeforeUnload(event)
    window.addEventListener("beforeunload", onBeforeUnload)

    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  const leaveEditor = async (): Promise<void> => {
    if (draft.dirty && !(await askToDiscard())) return
    setEditingCurriculum(false)
  }

  const openCurriculumEditor = async (): Promise<void> => {
    const careerId = curriculum?.career.id
    if (!careerId || openingEditor) return
    setOpeningEditor(true)
    setActionError(null)
    const result = await curriculumState.refetch()
    const current = result.data
    if (result.isError || !current) setActionError(errorMessage(result.error, "No se pudo comprobar si la malla puede editarse"))
    else {
      setChosenMallaId(current.curriculum.id)
      setEditingCurriculum(current.curriculum.editable && !current.curriculum.lock_reason)
    }
    setOpeningEditor(false)
  }

  const ready = (curriculum || withoutMallas) && schedule && assignments
  const curriculumLocked = locked(curriculum)
  const careerName = curriculum?.career.name ?? null
  // The schedule names the career too, which covers a career that has no malla yet.
  const describedCareer = careerName ?? schedule?.career?.name
  const coordinationDescription = mode === "curriculum" && describedCareer ? `Malla curricular de ${describedCareer}` : pageDescriptions[mode]
  // Everything above the malla, Administration's tabs included, shares the board's edges.
  const alignedInset = mode === "curriculum" && !withoutMallas ? boardInset : null
  // Only the drawn malla knows its edges: until then the header and tabs stay hidden instead of showing out of place.
  const drawsBoard = mode === "curriculum" && !withoutMallas && (curriculum !== null || boardInset !== null)
  const awaitingBoard = drawsBoard && !loadError && boardInset === null
  const title = editingCurriculum && curriculum ? `${mallaLabel(curriculum.malla)} de ${curriculum.career.name}` : adminCareerId && careerName ? `${pageTitles[mode]} de ${careerName}` : pageTitles[mode]

  return (
    <PageFrame
      title={title}
      description={adminCareerId ? adminDescriptions[mode] : coordinationDescription}
      size={drawsBoard ? "full" : "wide"}
      titleInset={alignedInset?.left}
      actionsInset={alignedInset?.right}
      awaitingInsets={awaitingBoard}
      loading={!ready && !loadError}
      actionsSkeleton={loading && !loadError ? actionSkeletons[mode] : []}
      banner={mode === "curriculum" && curriculum?.curriculum.lock_reason ? <ProcessLockAlert banner lock={curriculum.curriculum.lock} /> : null}
      eyebrow={
        mode === "curriculum" && editingCurriculum ? (
          <Button variant="link" size="sm" className="h-auto px-0" data-tour="curriculum-back" disabled={draft.saving} onClick={() => void leaveEditor()}>
            <ArrowLeft aria-hidden="true" />
            Volver a la vista
          </Button>
        ) : adminCareerId ? (
          <AdminCareerBackLink />
        ) : null
      }
      actions={
        <>
          {mode === "curriculum" && editingCurriculum && selectedMalla ? (
            <Button variant="outline" data-tour="curriculum-data" onClick={() => setEditMallaOpen(true)}>
              <PencilLine data-icon="inline-start" aria-hidden="true" />
              Editar malla
            </Button>
          ) : null}
          {mode === "curriculum" && editingCurriculum && draft.dirty ? (
            <Button variant="outline" disabled={draft.saving} onClick={draft.discard}>
              <Undo2 data-icon="inline-start" aria-hidden="true" />
              Descartar
            </Button>
          ) : null}
          {mode === "curriculum" && editingCurriculum ? (
            <Button data-tour="curriculum-save" disabled={!draft.dirty || draft.saving} onClick={() => void draft.save()}>
              {draft.saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
              {draft.saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          ) : null}
          {mode === "teachers" && assignments?.canCreateTeacher ? (
            <ImportSpreadsheetDialog title="Importar docentes" kind="teachers" templateName="plantilla-docentes.xlsx" columns={teacherColumns} onImported={(message) => void handleAssignmentChanged(message)} />
          ) : null}
          {mode === "teachers" && assignments?.canCreateTeacher ? (
            <Button onClick={() => setTeacherOpen(true)}>
              <UserPlus data-icon="inline-start" aria-hidden="true" />
              Crear docente
            </Button>
          ) : null}
          {mode === "curriculum" && !editingCurriculum && curriculum && !curriculumLocked ? (
            <ImportSpreadsheetDialog
              title={`Importar materias a ${mallaLabel(curriculum.malla)}`}
              kind="curriculum"
              templateName="plantilla-malla.xlsx"
              columns={curriculumColumns}
              extra={{ malla_id: curriculum.curriculum.id }}
              onImported={(message) => void handleCurriculumChanged(message)}
            />
          ) : null}
          {mode === "curriculum" && !editingCurriculum && curriculum ? (
            <Button disabled={openingEditor || curriculumLocked} onClick={() => void openCurriculumEditor()}>
              {openingEditor ? <Spinner data-icon="inline-start" /> : <Pencil data-icon="inline-start" aria-hidden="true" />}
              {openingEditor ? "Comprobando…" : "Editar malla"}
            </Button>
          ) : null}
        </>
      }
    >
      {adminCareer && !editingCurriculum ? (
        <div
          data-career-tabs
          className={cn(alignedInset && "lg:pr-(--page-actions-inset) lg:pl-(--page-title-inset)", awaitingBoard && "lg:invisible")}
          style={alignedInset ? ({ "--page-title-inset": `${alignedInset.left}px`, "--page-actions-inset": `${alignedInset.right}px` } as CSSProperties) : undefined}
        >
          <AdminCareerTabs careerCode={adminCareer.code} current={mode} />
        </div>
      ) : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {ready ? (
        <>
          {mode === "curriculum" && withoutMallas ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>La carrera no tiene mallas</EmptyTitle>
                <EmptyDescription>Cree la primera malla para registrar sus materias</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setCreateMallaOpen(true)}>Nueva malla</Button>
              </EmptyContent>
            </Empty>
          ) : null}
          {mode === "curriculum" && curriculum ? (
            <CurriculumCanvas
              header={
                mallas && selectedMalla ? (
                  <MallaToolbar mallas={mallas} selected={selectedMalla} disabled={draft.saving} onSelect={(mallaId) => void switchMalla(mallaId)} onCreate={() => setCreateMallaOpen(true)} />
                ) : null
              }
              career={curriculum.career}
              modalityOptions={curriculum.modalityOptions}
              curriculum={curriculum.curriculum}
              fixedFields={curriculum.fixedFields}
              fixedFieldTotals={curriculum.fixedFieldTotals}
              subjects={curriculum.subjects}
              requirements={curriculum.requirements}
              organizationUnits={curriculum.organizationUnitOptions}
              editing={editingCurriculum}
              draft={draft}
              onChanged={(message) => void handleCurriculumChanged(message)}
              onBoardInset={setBoardInset}
            />
          ) : null}
          {mode === "schedule" ? (
            <ScheduledSubjectsTab
              data={schedule}
              mallas={mallas ?? []}
              assignments={assignments.teacherAssignments}
              teacherUsers={assignments.options.teacherUsers}
              onChanged={(message) => void handleScheduleChanged(message)}
              onFailed={setActionError}
            />
          ) : null}
          {mode === "teachers" ? <TeacherAssignmentsPanel data={assignments} onChanged={(message) => void handleAssignmentChanged(message)} /> : null}
        </>
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : loading ? (
        <LoadingSkeleton variant="academic-structure" mode={mode} />
      ) : null}
      {mode === "curriculum" ? (
        <>
          <MallaDialog open={createMallaOpen} onOpenChange={setCreateMallaOpen} malla={null} onSaved={(message, mallaId) => void handleMallaSaved(message, mallaId)} />
          {selectedMalla ? (
            <MallaDialog open={editMallaOpen} onOpenChange={setEditMallaOpen} malla={selectedMalla} onSaved={(message, mallaId) => void handleMallaSaved(message, mallaId)} />
          ) : null}
        </>
      ) : null}
      {mode === "curriculum" ? (
        <UnsavedChangesDialog
          open={discardOpen}
          title="Hay cambios sin guardar"
          description="Los cambios de la malla no se guardaron. Si sale, los perderá"
          discardLabel="Salir y descartar cambios"
          onContinue={() => decideDiscard(false)}
          onDiscard={() => decideDiscard(true)}
          onOpenChange={(open) => {
            if (!open) decideDiscard(false)
          }}
        />
      ) : null}
      {mode === "teachers" ? (
        <ManagedUserDialog open={teacherOpen} onOpenChange={setTeacherOpen} teacherCareer={assignments?.career ?? null} showTrigger={false} onSaved={(message) => void handleAssignmentChanged(message)} />
      ) : null}
    </PageFrame>
  )
}
