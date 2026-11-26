"use client"

import { ArrowLeft, Pencil, UserPlus } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type Curriculum } from "@/api/career-academics"
import { AdminCareerBackLink, AdminCareerTabs } from "@/components/domain/academic/AdminCareerNavigation"
import { CurriculumActions } from "@/components/domain/academic/CurriculumActions"
import { CurriculumConfigurationDialog } from "@/components/domain/academic/curriculum/CurriculumConfigurationDialog"
import { MallaDialog } from "@/components/domain/academic/curriculum/MallaDialog"
import { MallaToolbar } from "@/components/domain/academic/curriculum/MallaToolbar"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { useAcademicCareerScope } from "@/composables/useAcademicCareerScope"
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

export function CoordinationAcademicStructurePage({ mode, careerId: adminCareerId = null }: { mode: AcademicStructureMode; careerId?: string | null }) {
  const router = useRouter()
  useAcademicCareerScope(adminCareerId)
  const scope = useQuery(coordinatorCareerQuery(adminCareerId))
  const careerId = typeof scope.data === "string" ? scope.data : null
  const mallasState = useQuery({ ...mallasQuery(adminCareerId), enabled: careerId !== null })
  const mallas = mallasState.data ?? null
  const [chosenMallaId, setChosenMallaId] = useState<string | null>(null)
  // The list comes vigente first, so the default is the vigente malla (or the first one when none is vigente).
  const selectedMalla = mallas?.find((malla) => malla.id === chosenMallaId) ?? mallas?.[0] ?? null
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
  const [configurationOpen, setConfigurationOpen] = useState(false)
  const [editingCurriculum, setEditingCurriculum] = useState(false)
  const [openingEditor, setOpeningEditor] = useState(false)
  const [mallaDialog, setMallaDialog] = useState<"create" | "edit" | null>(null)

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
    await Promise.all([reloadCurriculum(), reload(mallasState, "No se pudieron actualizar las mallas")])
  }

  const handleMallaSaved = async (notice: string, mallaId: string): Promise<void> => {
    toast.success(notice)
    setChosenMallaId(mallaId)
    await reload(mallasState, "No se pudieron actualizar las mallas")
    if (mallaId === curriculum?.curriculum.id) await reloadCurriculum()
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

  const ready = (curriculum || withoutMallas) && schedule && assignments
  const curriculumLocked = locked(curriculum)
  const careerName = curriculum?.career.name ?? null
  const title = editingCurriculum && curriculum ? `${curriculum.malla.name} de ${curriculum.career.name}` : adminCareerId && careerName ? `${pageTitles[mode]} de ${careerName}` : pageTitles[mode]

  return (
    <PageFrame
      title={title}
      description={adminCareerId ? adminDescriptions[mode] : pageDescriptions[mode]}
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
        ) : adminCareerId ? (
          <AdminCareerBackLink />
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
            <ImportSpreadsheetDialog
              title={`Importar materias a ${curriculum.malla.name}`}
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
      {adminCareerId && !editingCurriculum ? <AdminCareerTabs careerId={adminCareerId} current={mode} /> : null}
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
                <Button onClick={() => setMallaDialog("create")}>Nueva malla</Button>
              </EmptyContent>
            </Empty>
          ) : null}
          {mode === "curriculum" && curriculum ? (
            <>
              {!editingCurriculum && mallas && selectedMalla ? (
                <MallaToolbar
                  mallas={mallas}
                  selected={selectedMalla}
                  onSelect={setChosenMallaId}
                  onCreate={() => setMallaDialog("create")}
                  onEdit={() => setMallaDialog("edit")}
                />
              ) : null}
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
      {mode === "curriculum" ? (
        <MallaDialog
          open={mallaDialog !== null}
          onOpenChange={(open) => setMallaDialog(open ? mallaDialog : null)}
          malla={mallaDialog === "edit" ? selectedMalla : null}
          onSaved={(message, mallaId) => void handleMallaSaved(message, mallaId)}
        />
      ) : null}
      {mode === "teachers" ? (
        <ManagedUserDialog open={teacherOpen} onOpenChange={setTeacherOpen} teacherCareer={assignments?.career ?? null} showTrigger={false} onSaved={(message) => void handleAssignmentChanged(message)} />
      ) : null}
    </PageFrame>
  )
}
