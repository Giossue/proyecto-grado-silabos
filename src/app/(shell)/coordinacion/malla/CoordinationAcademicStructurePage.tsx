"use client"

import { ArrowLeft, Pencil, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { ApiError } from "@/api/client"
import { getCurriculum, getScheduledSubjects, getTeacherAssignments, type Curriculum, type ScheduledSubjects, type TeacherAssignments } from "@/api/career-academics"
import { getSession } from "@/api/session"
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
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null)
  const [schedule, setSchedule] = useState<ScheduledSubjects | null>(null)
  const [assignments, setAssignments] = useState<TeacherAssignments | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const fetchAll = useCallback(async (): Promise<void> => {
    try {
      const session = await getSession()
      if (session.active_role?.code !== "coordinador" || !session.active_role.career_id) {
        router.replace(paths.dashboard)
        return
      }
      const [nextCurriculum, nextSchedule, nextAssignments] = await Promise.all([getCurriculum(session.active_role.career_id), getScheduledSubjects(), getTeacherAssignments()])
      setCurriculum(nextCurriculum)
      setSchedule(nextSchedule)
      setAssignments(nextAssignments)
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : "No se pudo cargar la estructura académica")
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (mode === "curriculum") removeLegacyBreakdownMode()
    void Promise.resolve().then(fetchAll)
  }, [fetchAll, mode])

  const load = (): void => {
    setLoading(true)
    setLoadError(null)
    void fetchAll()
  }

  const reloadSchedule = async (): Promise<void> => {
    try {
      setActionError(null)
      setSchedule(await getScheduledSubjects())
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudo actualizar la programación académica")
    }
  }

  const reloadAssignments = async (): Promise<void> => {
    try {
      setActionError(null)
      setAssignments(await getTeacherAssignments())
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudieron actualizar las asignaciones docentes")
    }
  }

  const reloadCurriculum = async (): Promise<void> => {
    try {
      const careerId = curriculum?.career.id
      if (!careerId) return
      setActionError(null)
      setCurriculum(await getCurriculum(careerId))
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudo actualizar la malla")
    }
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
    try {
      const current = await getCurriculum(careerId)
      setCurriculum(current)
      setEditingCurriculum(current.curriculum.editable && !current.curriculum.lock_reason)
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudo comprobar si la malla puede editarse")
    } finally {
      setOpeningEditor(false)
    }
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
