"use client"

import { Bot, FileText, Pencil, RotateCcw, UserPen, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import type { SyllabusDetail, SyllabusField } from "@/api/syllabi"
import { getTemplate, getTemplateTeacherPreview, previewTemplateDraft } from "@/api/template"
import { applyTemplateAssistantProposal, discardTemplateAssistantProposal, getTemplateAssistantProposal } from "@/api/templateAssistant"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { UnsavedChangesDialog } from "@/components/domain/UnsavedChangesDialog"
import { TemplateAssistant } from "@/components/domain/ai/TemplateAssistant"
import { TemplateVisualBuilder, type TemplateVisualBuilderHandle } from "@/components/domain/configuration/TemplateVisualBuilder"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import { useLeaveGuard } from "@/components/domain/syllabus/useLeaveGuard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useDiscardConfirmation } from "@/composables/useDiscardConfirmation"
import { paths } from "@/lib/routes"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { toast } from "@/lib/toast"
import { errorMessage, failedQuery } from "@/lib/queryClient"
import { adminTemplateQuery, templateKeys } from "@/queries/template"

const SHEET_WIDTH = 794

const apiFailure = (reason: unknown, fallback: string): string => (reason instanceof ApiError ? (Object.values(reason.errors).flat()[0] ?? reason.message) : fallback)

export default function AdminTemplatePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const query = useQuery(adminTemplateQuery())
  const payload = query.data ?? null
  const loading = query.data === undefined && !failedQuery(query)
  const loadError = query.data === undefined && failedQuery(query) ? errorMessage(query.error, "No se pudo cargar la plantilla") : null
  const [actionError, setActionError] = useState<string | null>(null)
  const template = payload?.template ?? null
  const [teacherView, setTeacherView] = useState(false)
  const [teacherSections, setTeacherSections] = useState<SyllabusDetail["sections"] | null>(null)
  const [teacherError, setTeacherError] = useState<string | null>(null)
  const [teacherSection, setTeacherSection] = useState("")
  const [unsaved, setUnsaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const builder = useRef<TemplateVisualBuilderHandle>(null)
  const unsavedRef = useRef(false)
  const { open: discardOpen, ask: askToDiscard, decide: decideDiscard } = useDiscardConfirmation()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantLoaded, setAssistantLoaded] = useState(false)
  const [assistantRefresh, setAssistantRefresh] = useState(0)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [draftVersion, setDraftVersion] = useState("")

  useEffect(() => {
    unsavedRef.current = unsaved
  }, [unsaved])

  useEffect(() => {
    if (query.data === null) router.replace(paths.dashboard)
  }, [query.data, router])

  const retry = (): void => {
    void query.refetch()
  }

  const reloadFromMutation = useCallback((): void => {
    queryClient.fetchQuery({ queryKey: templateKeys.current(), queryFn: getTemplate, staleTime: 0 }).catch((reason: unknown) => setActionError(errorMessage(reason, "No se pudo cargar la plantilla")))
  }, [queryClient])

  const changeEditing = useCallback((value: boolean): void => {
    setEditing(value)
    setTeacherView(false)
  }, [])

  const toggleTeacherView = async (): Promise<void> => {
    const next = !teacherView
    setTeacherView(next)
    if (!next || !template) return
    setTeacherSections(null)
    setTeacherError(null)
    try {
      const draft = editing ? builder.current?.payload() : undefined
      const sections = draft ? (await previewTemplateDraft(template.id, draft)).sections : (await getTemplateTeacherPreview(template.id)).sections
      setTeacherSections(sections)
    } catch (reason) {
      setTeacherError(reason instanceof ApiError ? reason.message : "No se pudo armar la vista del docente")
    }
  }

  const tryValue = (field: SyllabusField, value: DocumentNode): void => {
    setTeacherSections((current) => (current ?? []).map((section) => ({ ...section, fields: section.fields.map((item) => (item.id === field.id ? { ...item, value } : item)) })))
  }

  const toggleAssistant = (): void => {
    setAssistantLoaded(true)
    setAssistantOpen((open) => !open)
  }
  const draftSnapshot = useCallback(() => builder.current?.snapshot() ?? { sections: [], version: "" }, [])

  const applyProposal = async (id: string): Promise<void> => {
    if (deciding) return
    setDeciding(id)
    try {
      const proposal = await getTemplateAssistantProposal(id)
      if (proposal.draft_version !== (builder.current?.draftVersion ?? draftVersion)) {
        toast.error("El borrador cambió. Pida la propuesta de nuevo")
        return
      }
      await applyTemplateAssistantProposal(id)
      builder.current?.applyProposal(proposal)
      toast.success("Cambios aplicados. Guárdelos con «Guardar»")
    } catch (reason) {
      toast.error(apiFailure(reason, "No se pudo aplicar la propuesta"))
    } finally {
      setDeciding(null)
      setAssistantRefresh((value) => value + 1)
    }
  }

  const discardProposal = async (id: string): Promise<void> => {
    if (deciding) return
    setDeciding(id)
    try {
      await discardTemplateAssistantProposal(id)
    } catch (reason) {
      toast.error(apiFailure(reason, "No se pudo descartar la propuesta"))
    } finally {
      setDeciding(null)
      setAssistantRefresh((value) => value + 1)
    }
  }

  useLeaveGuard({
    needed: () => unsavedRef.current,
    confirm: askToDiscard,
    navigate: (href) => router.push(href),
  })

  useEffect(() => {
    const changed = (): void => reloadFromMutation()
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!unsavedRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("silabos:template-changed", changed)
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => {
      window.removeEventListener("silabos:template-changed", changed)
      window.removeEventListener("beforeunload", warnBeforeUnload)
    }
  }, [reloadFromMutation])

  // El texto dice qué hace el botón; por eso no lleva aria-pressed, que exige un nombre fijo.
  const TeacherToggleIcon = !teacherView ? UserPen : editing ? Pencil : FileText
  const teacherToggle = (
    <Button
      type="button"
      variant="outline"
      size={editing ? "sm" : "default"}
      data-draft-teacher-view={editing || undefined}
      onClick={() => void toggleTeacherView()}
    >
      <TeacherToggleIcon data-icon="inline-start" aria-hidden="true" />
      <span>{!teacherView ? "Ver como docente" : editing ? "Volver a editar" : "Volver a la plantilla"}</span>
    </Button>
  )

  const banner =
    payload?.templateChangedDuringPause || payload?.processLock ? (
      <>
        {payload?.templateChangedDuringPause ? (
          <ProcessLockAlert
            banner
            icon={RotateCcw}
            title="Plantilla modificada durante la pausa"
            message="Al reanudar el proceso, los sílabos de este período se adaptan a la plantilla: se conserva lo escrito y los enviados o aprobados vuelven a borrador"
            hideAction
          />
        ) : null}
        {payload?.processLock ? <ProcessLockAlert banner lock={payload.processLockDetail} /> : null}
      </>
    ) : undefined

  const teacherContent = teacherView ? (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {teacherError ? (
        <Alert variant="destructive">
          <AlertDescription>{teacherError}</AlertDescription>
        </Alert>
      ) : !teacherSections ? (
        <LoadingSkeleton variant="syllabus" />
      ) : (
        <>
          <Alert>
            <AlertDescription>
              {editing
                ? "Vista de prueba del borrador sin guardar: así verá el formulario el docente. Lo que escriba aquí no se guarda"
                : "Vista de prueba: así verá el formulario el docente. Lo que escriba aquí no se guarda"}
            </AlertDescription>
          </Alert>
          <SyllabusTeacherForm
            sections={teacherSections}
            active={teacherSection}
            onActiveChange={setTeacherSection}
            onValueChange={tryValue}
          />
        </>
      )}
    </div>
  ) : null

  return (
    <>
      {loading ? (
        <PageFrame title="Plantilla de sílabo" description="El formato del sílabo: secciones y campos" size="wide" headerWidth={SHEET_WIDTH} loading actionsSkeleton={["w-44", "w-22"]}>
          <LoadingSkeleton variant="template" />
        </PageFrame>
      ) : loadError ? (
        <PageFrame title="Plantilla de sílabo" description="Hoja base de la plantilla institucional">
          <LoadErrorState message={loadError} onRetry={retry} />
        </PageFrame>
      ) : template ? (
        <PageFrame
          title="Plantilla de sílabo"
          description="El formato del sílabo: secciones y campos"
          size="wide"
          headerWidth={SHEET_WIDTH}
          headerClass={editing ? "hidden" : undefined}
          className={editing ? "max-w-none" : undefined}
          banner={editing ? undefined : banner}
          actions={
            !editing ? (
              <>
                {teacherToggle}
                {!teacherView ? (
                  <Button type="button" data-tour="template-edit" disabled={Boolean(payload?.processLock)} onClick={() => builder.current?.askEdit()}>
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Editar
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        >
          <div className="mx-auto flex flex-col gap-4 empty:hidden" style={{ width: `${SHEET_WIDTH}px`, maxWidth: "100%" }}>
            {actionError ? (
              <Alert variant="destructive">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {editing ? null : teacherContent}
          <div className="contents" style={teacherView && !editing ? { display: "none" } : undefined}>
            <TemplateVisualBuilder
              ref={builder}
              template={template}
              processLock={payload?.processLock}
              logos={payload?.logos}
              variables={payload?.variables}
              presets={payload?.presets}
              blockDesigns={payload?.blockDesigns}
              onChanged={reloadFromMutation}
              onDirty={setUnsaved}
              onEditing={changeEditing}
              onDraftVersionChange={setDraftVersion}
              teacherAction={editing ? teacherToggle : undefined}
              notice={editing ? banner : undefined}
              replacement={editing ? teacherContent : undefined}
            />
          </div>
          {editing ? (
            <>
              {assistantLoaded ? (
                <aside
                  className="fixed right-6 bottom-24 scroll-lock-offset z-40 h-[min(var(--layout-assistant-height),calc(100dvh-7rem))] w-(--layout-syllabus-aside-width) max-w-[calc(100vw-2rem)] max-sm:inset-x-4 max-sm:top-20 max-sm:right-4 max-sm:h-auto max-sm:w-auto"
                  style={assistantOpen ? undefined : { display: "none" }}
                  aria-label="Asistente de plantilla"
                >
                  <TemplateAssistant refresh={assistantRefresh} draftVersion={draftVersion} snapshot={draftSnapshot} busy={deciding} onApply={(id) => void applyProposal(id)} onDiscard={(id) => void discardProposal(id)} />
                </aside>
              ) : null}
              <Button type="button" data-tour="template-assistant" className="fixed right-6 bottom-6 scroll-lock-offset z-40 h-12 rounded-full px-5 shadow-menu transition-[color,background-color,box-shadow]" aria-expanded={assistantOpen} onClick={toggleAssistant}>
                {assistantOpen ? <X data-icon="inline-start" aria-hidden="true" /> : <Bot data-icon="inline-start" aria-hidden="true" />}
                {assistantOpen ? "Cerrar asistente" : "Asistente"}
              </Button>
            </>
          ) : null}
          <UnsavedChangesDialog
            open={discardOpen}
            title="Hay cambios sin guardar"
            description="Los cambios de la plantilla no se guardaron. Si sale, los perderá"
            discardLabel="Salir y descartar cambios"
            onContinue={() => decideDiscard(false)}
            onDiscard={() => decideDiscard(true)}
            onOpenChange={(open) => {
              if (!open) decideDiscard(false)
            }}
          />
        </PageFrame>
      ) : null}
    </>
  )
}
