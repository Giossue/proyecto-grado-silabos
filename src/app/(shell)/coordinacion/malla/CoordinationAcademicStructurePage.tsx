"use client"

import { ArrowLeft, Pencil, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type Curriculum } from "@/api/career-academics"
import { CurriculumActions } from "@/components/domain/academic/CurriculumActions"
import { CurriculumCanvas } from "@/components/domain/academic/curriculum/CurriculumCanvas"
import { CurriculumConfigurationDialog } from "@/components/domain/academic/curriculum/CurriculumConfigurationDialog"
import { ScheduledSubjectsTab } from "@/components/domain/academic/ScheduledSubjectsTab"
import { TeacherAssignmentsPanel } from "@/components/domain/academic/TeacherAssignmentsPanel"
import { ManagedUserDialog } from "@/components/domain/identity/ManagedUserDialog"
import { ImportSpreadsheetDialog } from "@/components/domain/ImportSpreadsheetDialog"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { errorMessage, failedQuery } from "@/lib/queryClient"
import { coordinatorCareerQuery, curriculumQuery, scheduledSubjectsQuery, teacherAssignmentsQuery } from "@/queries/careerAcademics"

export type AcademicStructureMode = "curriculum" | "schedule" | "teachers"

const pageTitles: Record<AcademicStructureMode, string> = { curriculum: "Malla", schedule: "Materias y asignaciones", teachers: "Docentes" }
const pageDescriptions: Record<AcademicStructureMode, string> = {
  curriculum: "Malla curricular de su carrera",
  schedule: "Materias, paralelos y docentes de su carrera",
  teachers: "Docentes de su carrera",
}
const actionSkeletons: Record<AcademicStructureMode, string[]> = { teachers: ["w-44", "w-36"], curriculum: ["w-44", "w-32"], schedule: [] }
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

const locked = (current: Curriculum | null): boolean => Boolean(current && (!current.curriculum.editable || current.curriculum.lock_reason))

const removeLegacyBreakdownMode = (): void => {
  const url = new URL(window.location.href)
  if (url.searchParams.get("modo") !== "desglose") return
  url.searchParams.delete("modo")
  window.history.replaceState(window.history.state, "", url)
}

export function CoordinationAcademicStructurePage({ mode }: { mode: AcademicStructureMode }) {
  const router = useRouter()
  const scope = useQuery(coordinatorCareerQuery())
  const careerId = typeof scope.data === "string" ? scope.data : null
  const curriculumState = useQuery({ ...curriculumQuery(careerId ?? ""), enabled: careerId !== null })
  const scheduleState = useQuery({ ...scheduledSubjectsQuery(), enabled: careerId !== null })
  const assignmentsState = useQuery({ ...teacherAssignmentsQuery(), enabled: careerId !== null })
  const curriculum = curriculumState.data ?? null
  const schedule = scheduleState.data ?? null
  const assignments = assignmentsState.data ?? null
  const initialStates = [scope, curriculumState, scheduleState, assignmentsState]
  const failedInitial = initialStates.find((state) => failedQuery(state) && state.data === undefined)
  const loadError = failedInitial ? errorMessage(failedInitial.error, "No se pudo cargar la estructura académica") : null
  const loading = initialStates.some((state) => state.data === undefined && (state.isPending || state.isFetching))
  const [actionError, setActionError] = useState<string | null>(null)
  const [teacherOpen, setTeacherOpen] = useState(false)
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [editingCurriculum, setEditingCurriculum] = useState(false)
  const [openingEditor, setOpeningEditor] = useState(false)

  const [seenCurriculum, setSeenCurriculum] = useState(curriculum)
  if (seenCurriculum !== curriculum) {
    setSeenCurriculum(curriculum)
    if (locked(curriculum)) {
      setEditingCurriculum(false)
      setConfigurationOpen(false)
    }
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
    await reloadCurriculum()
  }

  const openCurriculumEditor = async (): Promise<void> => {
    const careerId = curriculum?.career.id
    if (!careerId || openingEditor) return
    setOpeningEditor(true)
    setActionError(null)
    const result = await curriculumState.refetch()
    const current = result.data
    if (result.isError || !current) setActionError(errorMessage(result.error, "No se pudo comprobar si la malla puede editarse"))
    else setEditingCurriculum(current.curriculum.editable && !current.curriculum.lock_reason)
    setOpeningEditor(false)
  }

  const closeCurriculumEditor = (): void => {
    setConfigurationOpen(false)
    setEditingCurriculum(false)
  }

  const ready = curriculum && schedule && assignments
  const curriculumLocked = locked(curriculum)

  return (
    <PageFrame
      title={editingCurriculum && curriculum ? `Malla de ${curriculum.career.name}` : pageTitles[mode]}
      description={pageDescriptions[mode]}
      size={mode === "curriculum" ? "full" : "wide"}
      loading={!ready && !loadError}
      actionsSkeleton={loading && !loadError ? actionSkeletons[mode] : []}
      banner={mode === "curriculum" && curriculum?.curriculum.lock_reason ? <ProcessLockAlert banner lock={curriculum.curriculum.lock} /> : null}
      eyebrow={
        mode === "curriculum" && editingCurriculum ? (
          <Button variant="link" size="sm" className="h-auto px-0" data-tour="curriculum-back" onClick={closeCurriculumEditor}>
            <ArrowLeft aria-hidden="true" />
            Volver a la vista
          </Button>
        ) : null
      }
      actions={
        <>
          {mode === "curriculum" && editingCurriculum && curriculum ? <CurriculumActions curriculum={curriculum.curriculum} onConfigure={() => setConfigurationOpen(true)} /> : null}
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
            <ImportSpreadsheetDialog title="Importar malla" kind="curriculum" templateName="plantilla-malla.xlsx" columns={curriculumColumns} onImported={(message) => void handleCurriculumChanged(message)} />
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
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {ready ? (
        <>
          {mode === "curriculum" ? (
            <>
              <CurriculumCanvas
                career={curriculum.career}
                modalityOptions={curriculum.modalityOptions}
                curriculum={curriculum.curriculum}
                fixedFields={curriculum.fixedFields}
                fixedFieldTotals={curriculum.fixedFieldTotals}
                subjects={curriculum.subjects}
                requirements={curriculum.requirements}
                organizationUnits={curriculum.organizationUnitOptions}
                editing={editingCurriculum}
                onChanged={(message) => void handleCurriculumChanged(message)}
              />
              <CurriculumConfigurationDialog open={configurationOpen} onOpenChange={setConfigurationOpen} curriculum={curriculum.curriculum} onSaved={(message) => void handleCurriculumChanged(message)} />
            </>
          ) : null}
          {mode === "schedule" ? (
            <ScheduledSubjectsTab
              data={schedule}
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
      {mode === "teachers" ? (
        <ManagedUserDialog open={teacherOpen} onOpenChange={setTeacherOpen} teacherCareer={assignments?.career ?? null} showTrigger={false} onSaved={(message) => void handleAssignmentChanged(message)} />
      ) : null}
    </PageFrame>
  )
}
