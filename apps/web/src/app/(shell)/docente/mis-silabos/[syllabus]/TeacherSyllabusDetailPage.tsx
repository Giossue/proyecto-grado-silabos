"use client"

import { SupportDocumentsButton } from "@/components/domain/academic/SupportDocumentsButton"
import { ArrowLeft, Copy, Eye, FileSignature, FileText, Send } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { ApiError } from "@/api/client"
import {
  copyTeacherSyllabus,
  getTeacherSigningStatement,
  saveTeacherField,
  startTeacherSyllabus,
  submitTeacherSyllabus,
  validateTeacherSyllabus,
  type SyllabusDetail,
  type SyllabusField,
} from "@/api/syllabi"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { UnsavedChangesDialog } from "@/components/domain/UnsavedChangesDialog"
import { freeTextPlain } from "@/components/domain/syllabus/freeTextRender"
import { ReviewCommentNotice } from "@/components/domain/syllabus/ReviewCommentNotice"
import { SignatureDialog, type StatementSigner } from "@/components/domain/syllabus/SignatureDialog"
import { SyllabusDocumentPreview } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { isSyllabusPreview } from "@/components/domain/syllabus/syllabusPreview"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import { useLeaveGuard } from "@/components/domain/syllabus/useLeaveGuard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useDiscardConfirmation } from "@/composables/useDiscardConfirmation"
import { attemptKey } from "@/lib/attemptKey"
import { ruleFailures } from "@silabos/shared/lib/blocks/rules"
import { blockAttrs, blockDefinition, templateRuntime } from "@/lib/blocks/runtime"
import { afterDialogExit, useShownWhileClosing } from "@/lib/dialogExit"
import { sheetPixels } from "@/lib/documentLayout"
import { responseDocument } from "@/lib/fieldResponses"
import { goBack } from "@/lib/goBack"
import { openRevisionPdf } from "@/lib/openPdf"
import { syllabusConditions, visibleSections as withoutHiddenParts } from "@/lib/responseConditions"
import { paths } from "@/lib/routes"
import { isTeacherField, teacherFormFields } from "@/lib/syllabusForm"
import { drawnInDocument, shownInCard } from "@silabos/shared/lib/teacherFormation"
import { nodesOfType, type DocumentNode } from "@silabos/shared/lib/templateDocument"
import { toast } from "@/lib/toast"
import { handleUnauthorized } from "@/lib/unauthorized"
import { teacherSyllabusQuery } from "@/queries/teacher"
import { scrollBehavior } from "@/lib/motion"

type ValidationResult = { field_id: string | null; code: string; severity: string; message: string }
type CopySource = { id: string; parallel: string }

const PAUSED_MESSAGE = "El periodo académico está en pausa. Podrá seguir editando cuando se reanude"
const EDITABLE_STATES = ["borrador", "correccion_solicitada"]
const NO_RESULTS: ValidationResult[] = []

function useTracked<T>(initial: T): [T, (value: T) => void, { readonly current: T }] {
  const [value, setValue] = useState(initial)
  const ref = useRef(initial)
  const set = useCallback((next: T): void => {
    ref.current = next
    setValue(next)
  }, [])

  return [value, set, ref]
}

const blockReasonOf = (syllabus: SyllabusDetail | null, local: string | null): string | null =>
  local ?? (syllabus?.editable === false ? (syllabus.edit_block_reason ?? "El sílabo no admite cambios en este momento") : null)

const startedOf = (syllabus: SyllabusDetail | null): boolean => syllabus !== null && (syllabus.state !== "sin_iniciar" || syllabus.iniciado_en !== null)

const editableOf = (syllabus: SyllabusDetail | null): boolean =>
  EDITABLE_STATES.includes(syllabus?.state ?? "") || (syllabus?.state === "sin_iniciar" && startedOf(syllabus))

const canEditOf = (syllabus: SyllabusDetail | null, local: string | null): boolean => editableOf(syllabus) && blockReasonOf(syllabus, local) === null

const canStartOf = (syllabus: SyllabusDetail | null, local: string | null): boolean =>
  syllabus?.state === "sin_iniciar" && !startedOf(syllabus) && blockReasonOf(syllabus, local) === null

const fieldsOf = (syllabus: SyllabusDetail | null): SyllabusField[] => (syllabus?.sections ?? []).flatMap((section) => section.fields)

const withField = (syllabus: SyllabusDetail, fieldId: string, patch: Partial<SyllabusField>): SyllabusDetail => ({
  ...syllabus,
  sections: syllabus.sections.map((section) =>
    section.fields.some((field) => field.id === fieldId)
      ? { ...section, fields: section.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)) }
      : section,
  ),
})

const blockingOf = (results: ValidationResult[]): ValidationResult[] => {
  const seen = new Set<string>()

  return results
    .filter((result) => result.severity === "error")
    .filter((result) => {
      const key = `${result.field_id ?? ""}|${result.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const isFieldEmpty = (field: SyllabusField): boolean => !field.value || freeTextPlain(field.value).trim() === ""

const blockIssueOf = (fields: SyllabusField[]): string => {
  for (const field of fields.filter(isTeacherField)) {
    for (const node of field.value ? nodesOfType(field.value, "documentBlock") : []) {
      const attrs = blockAttrs(node)
      const definition = blockDefinition(attrs.kind)
      const failure = definition ? ruleFailures(definition.rules, attrs.value, templateRuntime().variables, "submit")[0] : undefined
      if (failure) return failure.message
    }
  }

  return ""
}

const isSignatureFailure = (reason: unknown): boolean =>
  reason instanceof ApiError ? Object.keys(reason.errors).some((key) => key === "signature" || key.startsWith("signature")) : true

export default function TeacherSyllabusDetailPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const syllabusId = String(useParams<{ syllabus: string }>().syllabus)
  const { open: discardOpen, ask: askToDiscard, decide: decideDiscard } = useDiscardConfirmation()
  const [syllabus, setSyllabus, syllabusRef] = useTracked<SyllabusDetail | null>(null)
  const [localBlockReason, setLocalBlockReason, localBlockRef] = useTracked<string | null>(null)
  const [conflict, setConflict, conflictRef] = useTracked(false)
  const [previewing, setPreviewing] = useState(false)
  const [openingPdf, setOpeningPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>(NO_RESULTS)
  const [processingAction, setProcessingAction] = useState(false)
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [copySource, setCopySource] = useState<CopySource | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [editedHere, setEditedHere] = useState(false)
  const [chosenSectionId, setChosenSectionId] = useState<string | null>(null)
  const [previewHint] = useState(() => isSyllabusPreview(syllabusId))
  const [submitKey] = useState(attemptKey)
  const shownCopySource = useShownWhileClosing(copySource)
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const dirtyFields = useRef(new Set<string>())
  const cardFieldEdited = useRef(false)
  const pendingSave = useRef<Promise<void>>(Promise.resolve())
  const inFlight = useRef(0)

  const editBlockReason = blockReasonOf(syllabus, localBlockReason)
  const canEdit = canEditOf(syllabus, localBlockReason)
  const showBlockReason = editBlockReason !== null && (localBlockReason !== null || syllabus?.edit_blocked_by_convocation !== true)
  const pausedEdit = editBlockReason !== null && ["sin_iniciar", "borrador", "correccion_solicitada"].includes(syllabus?.state ?? "")
  const showEditor = canEdit || pausedEdit
  const canStart = canStartOf(syllabus, localBlockReason)
  const allFields = fieldsOf(syllabus)
  const reviewComments = (syllabus?.review_comments ?? []).toSorted(
    (left, right) => new Date(right.commented_at).getTime() - new Date(left.commented_at).getTime(),
  )
  const latestStage = reviewComments[0]?.stage
  const submitNote =
    latestStage === undefined
      ? "El sílabo pasa a revisión. Asegúrese de que esté completo"
      : `El sílabo pasa a revisión. Asegúrese de haber hecho los arreglos que pidió ${latestStage === "biblioteca" ? "Biblioteca" : "Coordinación"}`
  const unchangedSinceCorrection = syllabus?.unchanged_since_correction === true && !editedHere
  const mustSign = syllabus?.teacher_signature_required === true
  const submitLabel = mustSign ? "Firmar y enviar" : "Enviar"
  const emptyParts = allFields.filter((field) => field.required && isTeacherField(field)).filter(isFieldEmpty).length
  const blockIssue = blockIssueOf(allFields)
  const submitHint = emptyParts === 0 ? "" : emptyParts === 1 ? "Falta 1 campo por completar" : `Faltan ${emptyParts} campos por completar`
  const copySources = canEdit && (syllabus?.state === "borrador" || syllabus?.state === "sin_iniciar") ? (syllabus.copy_sources ?? []) : []
  const visibleSections = (syllabus?.sections ?? []).filter((section) => teacherFormFields(section.fields).length > 0)
  const activeSectionId = visibleSections.find((section) => section.id === chosenSectionId)?.id ?? visibleSections[0]?.id ?? ""
  const previewSections = useMemo(() => {
    const sections = (syllabus?.sections ?? []).map((section) => ({ ...section, fields: section.fields.filter(drawnInDocument) }))

    return withoutHiddenParts(sections, syllabusConditions(sections, (field) => (field.template ? responseDocument(field.template, field.value) : field.value)))
  }, [syllabus])
  const documentHeaderWidth = !syllabus
    ? previewHint
      ? sheetPixels(null).portrait
      : undefined
    : startedOf(syllabus) && !showEditor
      ? sheetPixels(syllabus.presentation.document).portrait
      : undefined
  const loading = (!syllabus || canStart) && !error

  const hasUnsavedChanges = (): boolean => dirtyFields.current.size > 0
  const canEditNow = (): boolean => canEditOf(syllabusRef.current, localBlockRef.current)

  const applyValidation = (results: ValidationResult[]): void => {
    setValidationResults(results)
  }

  const clearFieldValidation = (fieldId: string): void => {
    setValidationResults((current) => (current.some((result) => result.field_id === fieldId) ? current.filter((result) => result.field_id !== fieldId) : current))
  }

  const openPdf = async (revisionId: string): Promise<void> => {
    setOpeningPdf(true)
    const failure = await openRevisionPdf(revisionId)
    setOpeningPdf(false)
    if (failure) toast.error(failure)
  }

  const start = async (): Promise<void> => {
    if (!canStartOf(syllabusRef.current, localBlockRef.current)) return
    setError(null)
    try {
      setSyllabus((await startTeacherSyllabus(syllabusId)).syllabus)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 403) {
        setLocalBlockReason(PAUSED_MESSAGE)
        return
      }
      setError(reason instanceof ApiError ? reason.message : "No se pudo iniciar el borrador")
    }
  }

  const applyLoaded = async (next: SyllabusDetail): Promise<void> => {
    setSyllabus(next)
    applyValidation(next.validation?.results ?? NO_RESULTS)
    setConflict(false)
    setError(null)
    if (canStartOf(next, localBlockRef.current)) await start()
  }

  const loadFailed = (reason: unknown): void => {
    if (reason instanceof ApiError && reason.status === 401) {
      router.replace(paths.login)
      return
    }
    if (reason instanceof ApiError && reason.status === 404) {
      router.replace(paths.teacher.syllabi)
      return
    }
    setError(reason instanceof ApiError ? reason.message : "No se pudo cargar el sílabo")
  }

  const load = (): Promise<void> =>
    queryClient.fetchQuery({ ...teacherSyllabusQuery(syllabusId), staleTime: 0 })
      .then((response) => applyLoaded(response.syllabus))
      .catch(loadFailed)

  const handleSaveFailure = (reason: unknown): void => {
    setSaveFailed(true)
    if (reason instanceof ApiError && (reason.status === 401 || reason.status === 419)) {
      handleUnauthorized(router)
      setError("Su sesión caducó. Inicie sesión de nuevo para guardar los cambios pendientes")
      return
    }
    if (reason instanceof ApiError && reason.status === 409) {
      setConflict(true)
      setError("El borrador cambió en otra sesión. Recárguelo antes de continuar para evitar sobrescribir cambios")
      return
    }
    if (reason instanceof ApiError && reason.status === 403) {
      setLocalBlockReason(PAUSED_MESSAGE)
      return
    }
    setError(reason instanceof ApiError ? reason.message : "No se pudo guardar el cambio")
  }

  const queueSave = (markPending: () => void, operation: () => Promise<void>): void => {
    pendingSave.current = pendingSave.current.then(async () => {
      if (conflictRef.current || !canEditNow()) {
        markPending()
        return
      }
      try {
        await operation()
      } catch (reason) {
        markPending()
        handleSaveFailure(reason)
      }
    })
  }

  const saveField = (fieldId: string): void => {
    dirtyFields.current.delete(fieldId)
    const timer = saveTimers.current.get(fieldId)
    if (timer) clearTimeout(timer)
    saveTimers.current.delete(fieldId)
    queueSave(
      () => {
        dirtyFields.current.add(fieldId)
      },
      async () => {
        const current = syllabusRef.current
        if (!current) return
        const value = fieldsOf(current).find((field) => field.id === fieldId)?.value ?? null
        inFlight.current += 1
        try {
          const saved = await saveTeacherField(current.id, fieldId, current.version_bloqueo, value)
          const latest = syllabusRef.current
          if (latest) {
            const versioned = { ...latest, version_bloqueo: saved.version_bloqueo, state: saved.estado ?? latest.state }
            setSyllabus(dirtyFields.current.has(fieldId) ? versioned : withField(versioned, fieldId, { document: saved.document }))
          }
          if (!hasUnsavedChanges()) setSaveFailed(false)
        } finally {
          inFlight.current -= 1
        }
      },
    )
  }

  const scheduleSave = (fieldId: string): void => {
    if (!canEditNow() || conflictRef.current || !fieldsOf(syllabusRef.current).some((field) => field.id === fieldId)) return
    const previous = saveTimers.current.get(fieldId)
    if (previous) clearTimeout(previous)
    dirtyFields.current.add(fieldId)
    saveTimers.current.set(
      fieldId,
      setTimeout(() => saveField(fieldId), 700),
    )
  }

  const updateValue = (field: SyllabusField, value: DocumentNode): void => {
    const current = syllabusRef.current
    if (!current || !isTeacherField(field) || !canEditNow() || conflictRef.current) return
    setSyllabus(withField(current, field.id, { value }))
    if (shownInCard(field)) cardFieldEdited.current = true
    setEditedHere(true)
    clearFieldValidation(field.id)
    scheduleSave(field.id)
  }

  const flushAutosave = async (): Promise<boolean> => {
    if (canEditNow() && !conflictRef.current) {
      for (const fieldId of [...dirtyFields.current]) saveField(fieldId)
    }
    await pendingSave.current
    if (!hasUnsavedChanges()) setSaveFailed(false)

    return !conflictRef.current && !hasUnsavedChanges()
  }

  const confirmLeave = async (): Promise<boolean> => {
    if (!hasUnsavedChanges()) {
      await pendingSave.current
      if (!hasUnsavedChanges()) return true
    }
    if (await flushAutosave()) return true

    return askToDiscard()
  }

  const leave = async (go: () => void): Promise<void> => {
    if (hasUnsavedChanges() || inFlight.current > 0) {
      if (!(await confirmLeave())) return
    }
    go()
  }

  useLeaveGuard({
    needed: () => hasUnsavedChanges() || inFlight.current > 0,
    confirm: confirmLeave,
    navigate: (href) => router.push(href),
  })

  const openPreview = async (): Promise<void> => {
    if ((await flushAutosave()) && cardFieldEdited.current) {
      cardFieldEdited.current = false
      await load()
    }
    setPreviewing(true)
  }

  const retrySave = async (): Promise<void> => {
    setError(null)
    await flushAutosave()
  }

  const goToPart = (fieldId: string | null): void => {
    const sections = syllabusRef.current?.sections ?? []
    const owner = fieldId ? sections.find((section) => section.fields.some((field) => field.id === fieldId)) : null
    if (owner && canEditNow()) flushSync(() => setChosenSectionId(owner.id))
    const target = fieldId ? document.getElementById(`field-${fieldId}`) : null
    if (!target) return
    target.scrollIntoView({ behavior: scrollBehavior(), block: "center" })
    target.querySelector<HTMLElement>("input, textarea, button, [contenteditable='true']")?.focus({ preventScroll: true })
  }

  const showValidation = async (): Promise<void> => {
    const current = syllabusRef.current
    if (!current) return
    const { validation } = await validateTeacherSyllabus(current.id)
    flushSync(() => applyValidation(validation.results))
    const blocking = blockingOf(validation.results)
    const targets = new Set(fieldsOf(syllabusRef.current).map((field) => field.id))
    const failing = new Set(blocking.map((result) => result.field_id))
    goToPart([...targets].find((id) => failing.has(id)) ?? null)
    const orphans = blocking.filter((result) => !result.field_id || !targets.has(result.field_id))
    if (orphans.length) setError(orphans.map((result) => result.message).join(" "))
  }

  const submit = async (sign: StatementSigner | null = null): Promise<void> => {
    if (!syllabusRef.current) return
    try {
      setProcessingAction(true)
      setError(null)
      if (!(await flushAutosave())) {
        setSignOpen(false)
        return
      }
      const { id, version_bloqueo: version } = syllabusRef.current!
      let signature = null
      if (sign) {
        const statement = await getTeacherSigningStatement(id, version)
        if (statement.required) signature = sign(statement.statement)
      }
      setSyllabus((await submitTeacherSyllabus(id, version, submitKey.use(`${id}:${version}`), signature)).syllabus)
      submitKey.reset()
      setSignOpen(false)
      setValidationResults(NO_RESULTS)
      toast.success("Sílabo enviado correctamente")
      await afterDialogExit()
      router.push(paths.teacher.syllabi)
    } catch (reason) {
      if (sign && isSignatureFailure(reason)) throw reason
      setSignOpen(false)
      if (reason instanceof ApiError && reason.status === 409) setConflict(true)
      if (reason instanceof ApiError && reason.status === 422 && reason.errors.validation) {
        try {
          await showValidation()
          return
        } catch {}
      }
      if (reason instanceof ApiError && reason.status === 403) {
        setLocalBlockReason(PAUSED_MESSAGE)
        return
      }
      setError(reason instanceof ApiError ? reason.message : "No se pudo enviar el sílabo")
    } finally {
      setProcessingAction(false)
    }
  }

  const showFailingBlock = async (): Promise<void> => {
    try {
      if (await flushAutosave()) await showValidation()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo revisar el sílabo")
    }
  }

  const askSubmit = (): void => {
    if (blockIssue !== "") {
      void showFailingBlock()
      return
    }
    if (mustSign) setSignOpen(true)
    else setConfirmSubmitOpen(true)
  }

  const confirmSubmit = (): void => {
    setConfirmSubmitOpen(false)
    void submit()
  }

  const copyFromSource = async (): Promise<void> => {
    const source = copySource
    setCopySource(null)
    const current = syllabusRef.current
    if (!current || !source) return
    try {
      setProcessingAction(true)
      setError(null)
      if (!(await flushAutosave())) return
      setSyllabus((await copyTeacherSyllabus(current.id, source.id, syllabusRef.current!.version_bloqueo)).syllabus)
      setValidationResults(NO_RESULTS)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setConflict(true)
      if (reason instanceof ApiError && reason.status === 403) {
        setLocalBlockReason(PAUSED_MESSAGE)
        return
      }
      setError(reason instanceof ApiError ? reason.message : "No se pudo copiar el sílabo")
    } finally {
      setProcessingAction(false)
    }
  }

  const visibleValidationMessages = (fieldId: string): string[] =>
    validationResults.filter((result) => result.field_id === fieldId).map((result) => result.message)

  const loaded = useEffectEvent((next: SyllabusDetail) => applyLoaded(next))
  const notLoaded = useEffectEvent((reason: unknown) => loadFailed(reason))
  const warnBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges() && inFlight.current === 0) return
    event.preventDefault()
    event.returnValue = ""
  })

  useEffect(() => {
    const timers = saveTimers.current
    const onBeforeUnload = (event: BeforeUnloadEvent): void => warnBeforeUnload(event)
    window.addEventListener("beforeunload", onBeforeUnload)
    void queryClient.fetchQuery({ ...teacherSyllabusQuery(syllabusId), staleTime: 0 })
      .then((response) => loaded(response.syllabus))
      .catch((reason: unknown) => notLoaded(reason))

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [queryClient, syllabusId])

  return (
    <>
      <PageFrame
        title={syllabus?.subject ?? ""}
        description={syllabus?.period ?? ""}
        loading={loading}
        actionsSkeleton={loading && !previewHint ? ["w-9 lg:w-32", "w-24"] : []}
        headerClass="syllabus-editor-header"
        headerWidth={documentHeaderWidth}
        hideIcon
        eyebrow={
          <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => void leave(() => goBack(router, paths.teacher.syllabi))}>
            <ArrowLeft aria-hidden="true" />
            Volver a mis sílabos
          </Button>
        }
        titleBadge={syllabus ? <SyllabusStateBadge state={syllabus.state} /> : undefined}
        tools={
          <>
            {syllabus && syllabus.state !== "aprobado" ? <SupportDocumentsButton /> : null}
            {syllabus && showEditor ? (
              <Button
                type="button"
                variant={previewing ? "secondary" : "outline"}
                data-labeled-tool
                className="max-lg:size-9 max-lg:has-[>svg]:px-0"
                aria-label="Vista previa"
                aria-pressed={previewing}
                onClick={() => (previewing ? setPreviewing(false) : void openPreview())}
              >
                <Eye aria-hidden="true" />
                <span className="max-lg:sr-only">Vista previa</span>
              </Button>
            ) : null}
            {syllabus?.state === "aprobado" && syllabus.approved_revision_id ? (
              <Button
                type="button"
                variant="outline"
                data-labeled-tool
                className="max-lg:size-9 max-lg:has-[>svg]:px-0"
                aria-label="Ver PDF"
                disabled={openingPdf}
                onClick={() => void openPdf(syllabus.approved_revision_id!)}
              >
                {openingPdf ? <Spinner /> : <FileText aria-hidden="true" />}
                <span className="max-lg:sr-only">Ver PDF</span>
              </Button>
            ) : null}
          </>
        }
        actions={
          <>
            {saveFailed && canEdit ? (
              <span className="save-status flex items-center gap-2 text-sm text-destructive">
                Sin guardar
                <Button type="button" size="sm" variant="outline" disabled={conflict} onClick={() => void retrySave()}>
                  Reintentar
                </Button>
              </span>
            ) : null}
            {copySources.map((source) => (
              <Button key={source.id} type="button" variant="outline" disabled={processingAction || conflict} onClick={() => setCopySource(source)}>
                <Copy aria-hidden="true" />
                Copiar desde paralelo {source.parallel}
              </Button>
            ))}
            {syllabus && canEdit ? (
              <span data-tour="syllabus-submit" className="flex min-w-0 items-center">
                {submitHint ? (
                  <>
                    <IconTooltip label={submitHint}>
                      <span className="inline-flex" tabIndex={0} aria-describedby="submit-hint">
                        <Button disabled={processingAction || conflict || emptyParts > 0} onClick={askSubmit}>
                            {processingAction ? <Spinner /> : mustSign ? <FileSignature aria-hidden="true" /> : <Send aria-hidden="true" />}
                            {submitLabel}
                  </Button>
                      </span>
                    </IconTooltip>
                    <span id="submit-hint" className="sr-only">
                      {submitHint}
                    </span>
                  </>
                ) : (
                  <Button disabled={processingAction || conflict || emptyParts > 0} onClick={askSubmit}>
                    {processingAction ? <Spinner /> : mustSign ? <FileSignature aria-hidden="true" /> : <Send aria-hidden="true" />}
                    {submitLabel}
                  </Button>
                )}
              </span>
            ) : null}
          </>
        }
      >
        <span className="sr-only" role="status" aria-live="polite">
          {saveFailed && canEdit ? "Los últimos cambios no se guardaron" : ""}
        </span>
        {error ? (
          <Alert className="feedback error" variant="destructive">
            <AlertTitle>No se pudo continuar</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              {conflict ? (
                <Button type="button" variant="outline" onClick={() => void load()}>
                  Recargar borrador
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? <LoadingSkeleton variant={previewHint && !syllabus ? "preview" : "syllabus"} /> : null}

        {syllabus ? (
          <>
            {showBlockReason && !startedOf(syllabus) ? (
              <div className="edit-blocked">
                <ProcessLockAlert title="Edición no disponible" message={editBlockReason ?? undefined} hideAction />
              </div>
            ) : null}
            {startedOf(syllabus) || pausedEdit ? (
              <div className={pausedEdit ? "mx-auto flex w-full max-w-screen-2xl min-w-0 flex-col gap-8" : "mx-auto flex w-full max-w-screen-2xl min-w-0 flex-col gap-8 pb-16"}>
                {showBlockReason && editableOf(syllabus) ? (
                  <div className="edit-blocked">
                    <ProcessLockAlert title="Edición no disponible" message={editBlockReason ?? undefined} hideAction />
                  </div>
                ) : null}
                {syllabus.state === "correccion_solicitada" && reviewComments.length ? <ReviewCommentNotice comments={reviewComments} /> : null}
                {showEditor && !previewing ? (
                  <SyllabusTeacherForm
                    sections={syllabus.sections}
                    disabled={conflict || pausedEdit}
                    errors={visibleValidationMessages}
                    onValueChange={updateValue}
                    active={activeSectionId}
                    onActiveChange={setChosenSectionId}
                  />
                ) : (
                  <SyllabusDocumentPreview presentation={syllabus.presentation} sections={previewSections} />
                )}
              </div>
            ) : null}
          </>
        ) : null}

        <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Enviar a revisión?</DialogTitle>
              <DialogDescription>{submitNote}</DialogDescription>
            </DialogHeader>
            {unchangedSinceCorrection ? (
              <Alert className="unchanged-warning">
                <AlertDescription>No ha cambiado nada desde que pidieron la corrección</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={processingAction || conflict} onClick={confirmSubmit}>
                <Send data-icon="inline-start" aria-hidden="true" />
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <SignatureDialog open={signOpen} onOpenChange={setSignOpen} title="Firmar y enviar" confirmLabel="Firmar y enviar" run={(sign) => submit(sign)} />
        <Dialog
          open={copySource !== null}
          onOpenChange={(open) => {
            if (!open) setCopySource(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Copiar desde el paralelo {shownCopySource?.parallel}?</DialogTitle>
              <DialogDescription>
                Todo lo que escribió en este sílabo se reemplazará por lo del paralelo {shownCopySource?.parallel}. Cada paralelo se envía y se firma por separado
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCopySource(null)}>
                Cancelar
              </Button>
              <Button type="button" disabled={processingAction || conflict} onClick={() => void copyFromSource()}>
                <Copy data-icon="inline-start" aria-hidden="true" />
                Copiar contenido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
      <UnsavedChangesDialog
        open={discardOpen}
        title="Hay cambios sin guardar"
        description="No se pudieron guardar los últimos cambios. Si sale, perderá esos cambios"
        discardLabel="Salir y descartar cambios"
        onContinue={() => decideDiscard(false)}
        onDiscard={() => decideDiscard(true)}
        onOpenChange={(open) => {
          if (!open) decideDiscard(false)
        }}
      />
    </>
  )
}
