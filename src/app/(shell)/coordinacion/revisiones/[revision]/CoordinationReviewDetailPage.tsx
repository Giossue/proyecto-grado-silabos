"use client"

import { ArrowLeft, CheckCheck, FileSignature, FileText, GitCompareArrows, Highlighter, History, MoreHorizontal, RotateCcw, Undo2 } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ApiError } from "@/api/client"
import { approveReview, compareReviews, getReview, requestCorrection, reviewStageLabel, type ReviewDetail } from "@/api/reviews"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { PageFrame } from "@/components/domain/PageFrame"
import { ProcessLockAlert } from "@/components/domain/ProcessLockAlert"
import { SyllabusStateBadge } from "@/components/domain/SyllabusStateBadge"
import { ChangeMarks } from "@/components/domain/syllabus/ChangeMarks"
import { ReviewCommentNotice } from "@/components/domain/syllabus/ReviewCommentNotice"
import { SignatureDialog, type StatementSigner } from "@/components/domain/syllabus/SignatureDialog"
import { SyllabusDocumentPreview, type PreviewSection } from "@/components/domain/syllabus/SyllabusDocumentPreview"
import { SyllabusRestartDialog } from "@/components/domain/syllabus/SyllabusRestartDialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { afterDialogExit } from "@/lib/dialogExit"
import { sheetPixels } from "@/lib/documentLayout"
import { goBack } from "@/lib/goBack"
import { openRevisionPdf } from "@/lib/openPdf"
import { reviewAreaPaths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { errorMessages, useSchemaForm } from "@/lib/forms"
import { changeRequestSchema } from "@/schemas/syllabus"
import { useDeadline } from "@/state/deadline"

const NO_CHANGES: ReadonlySet<string> = new Set()
const DEFAULT_SHEET_WIDTH = sheetPixels(null).portrait

const cameFrom = (listPath: string): boolean => {
  let back = false
  goBack({ back: () => { back = true }, push: () => undefined }, listPath)

  return back
}

const toPreview = (detail: ReviewDetail | null): PreviewSection[] =>
  (detail?.revision.snapshot.sections ?? []).map((section) => ({
    id: section.key,
    title: section.title,
    orientation: section.orientation,
    fields: section.fields.map((field) => ({ ...field, id: field.id ?? field.key })),
  }))

export default function CoordinationReviewDetailPage() {
  const router = useRouter()
  const revisionId = String(useParams<{ revision: string }>().revision)
  const area = reviewAreaPaths()
  const { deadline } = useDeadline()
  const [data, setData] = useState<ReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const correctionForm = useSchemaForm(changeRequestSchema, { defaultValues: { justification: "" } })
  const correcting = correctionForm.formState.isSubmitting
  const correctionJustification = String(correctionForm.watch("justification") ?? "")
  const correctionErrors = errorMessages(correctionForm.formState.errors.justification) ?? []
  const [comparing, setComparing] = useState(false)
  const [highlight, setHighlight] = useState(true)
  const [currentSection, setCurrentSection] = useState<HTMLElement | null>(null)
  const [changedFields, setChangedFields] = useState<ReadonlySet<string>>(NO_CHANGES)
  const [previousDetail, setPreviousDetail] = useState<ReviewDetail | null>(null)
  const [openingPdf, setOpeningPdf] = useState(false)
  const [approving, setApproving] = useState(false)
  const [shownRevision, setShownRevision] = useState(revisionId)
  const [attempt, setAttempt] = useState(0)

  if (shownRevision !== revisionId) {
    setShownRevision(revisionId)
    setComparing(false)
    setLoading(true)
    setLoadError("")
  }

  const fromHistory = cameFrom(area.periodHistory)

  useEffect(() => {
    void getReview(revisionId)
      .then((detail) => setData(detail))
      .catch((failure: unknown) => setLoadError(failure instanceof ApiError ? failure.message : "No se pudo cargar la revisión"))
      .finally(() => setLoading(false))
  }, [revisionId, attempt])

  const load = (): void => {
    setLoading(true)
    setLoadError("")
    setAttempt((value) => value + 1)
  }

  const canReviewCurrent = Boolean(data?.can_decide && data.revision.is_current && data.syllabus.state === "en_revision")
  const canSign = canReviewCurrent && Boolean(data?.signing_statement)
  const canApproveWithoutSigning = canReviewCurrent && !data?.signing_statement
  const sheetWidth = data ? sheetPixels(data.presentation.document).portrait : 0
  const stageLabel = reviewStageLabel(data?.syllabus.stage)
  const statusNotes: string[] = []
  if (data) {
    if (!data.revision.is_current) statusNotes.push(`Versión ${data.revision.number} (anterior) · solo consulta`)
    if (data.syllabus.state === "en_revision" && stageLabel) statusNotes.push(stageLabel)
    if (data.correction_request?.stage === "biblioteca") statusNotes.push("Corrección solicitada por biblioteca")
  }
  const request = data?.correction_request
  const correctionComments =
    data && request && request.justification !== null
      ? [{ stage: request.stage ?? "coordinacion", comment: request.justification, commented_at: request.requested_at, commented_by: request.requested_by ?? "", revision_number: data.revision.number }]
      : null
  const currentIndex = data ? data.history.findIndex((item) => item.id === data.revision.id) : -1
  const previousRevision = data && currentIndex > 0 ? data.history[currentIndex - 1]! : null
  const showChanges = Boolean(previousRevision && data?.syllabus.state === "en_revision" && data.revision.is_current)
  const canReset = Boolean(data?.reset.allowed && data.revision.is_current)
  const approvedCurrent = data?.history.find((item) => item.id === data.revision.id && item.approved_at) ?? null
  const previewSections = useMemo(() => toPreview(data), [data])
  const previousSections = useMemo(() => toPreview(previousDetail), [previousDetail])

  const toggleCompare = async (): Promise<void> => {
    if (comparing) {
      setComparing(false)
      return
    }
    if (!data || !previousRevision || !showChanges) return
    try {
      const [before, result] = await Promise.all([getReview(previousRevision.id), compareReviews(previousRevision.id, data.revision.id)])
      setPreviousDetail(before)
      setChangedFields(new Set(result.comparison.changes.map((change) => `${change.section_key}.${change.field_key}`)))
      setHighlight(true)
      setComparing(true)
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "No se pudo comparar con la versión anterior")
    }
  }

  const openPdf = async (id: string): Promise<void> => {
    setOpeningPdf(true)
    const failure = await openRevisionPdf(id)
    setOpeningPdf(false)
    if (failure) toast.error(failure)
  }

  const restarted = async (message: string): Promise<void> => {
    const leaves = Boolean(data?.reset.erases_history)
    toast.success(message)
    await afterDialogExit()
    if (leaves) router.replace(area.reviews)
    else load()
  }

  const openCorrection = (): void => {
    correctionForm.clearErrors()
    setCorrectionOpen(true)
  }

  const submitCorrection = async (): Promise<void> => {
    if (!data) return
    try {
      const result = await requestCorrection(data.revision.id, { justification: correctionJustification })
      setCorrectionOpen(false)
      toast.success(result.message)
      await afterDialogExit()
      router.replace(area.reviews)
    } catch (failure) {
      const fieldErrors = failure instanceof ApiError ? [...(failure.errors.justification ?? []), ...(failure.errors.revision ?? [])] : []
      const shown = fieldErrors.length ? fieldErrors : [failure instanceof ApiError ? failure.message : "No se pudo solicitar la corrección"]
      correctionForm.setError("justification", { type: "server", message: shown[0], types: Object.fromEntries(shown.map((text, index) => [`server${index}`, text])) })
    }
  }

  const approve = async (sign: StatementSigner): Promise<void> => {
    if (!data?.signing_statement) return
    const result = await approveReview(data.revision.id, sign(data.signing_statement))
    setSignOpen(false)
    toast.success(result.message)
    await afterDialogExit()
    router.replace(area.reviews)
  }

  const approveWithoutSigning = async (): Promise<void> => {
    if (!data) return
    setApproving(true)
    try {
      const result = await approveReview(data.revision.id, null)
      toast.success(result.message)
      router.replace(area.reviews)
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "No se pudo aprobar el sílabo")
    } finally {
      setApproving(false)
    }
  }

  const backLink = (
    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => goBack(router, fromHistory ? area.periodHistory : area.reviews)}>
      <ArrowLeft aria-hidden="true" />
      {fromHistory ? "Volver al historial" : "Volver a la cola"}
    </Button>
  )

  const closedBanner =
    data?.convocation_closed && deadline?.state !== "closed" ? (
      <ProcessLockAlert banner title="Convocatoria finalizada" message="Este sílabo queda solo para consulta" hideAction />
    ) : null

  if (data && !loadError) {
    return (
      <>
        {closedBanner}
        <PageFrame
          headerClass="syllabus-editor-header"
          headerWidth={sheetWidth}
          hideIcon
          title={data.syllabus.subject}
          description={`${data.syllabus.period} · ${data.syllabus.teachers.join(", ")}`}
          eyebrow={backLink}
          titleBadge={
            <>
              <SyllabusStateBadge state={data.syllabus.state} />
              {statusNotes.map((note) => (
                <span key={note} className="text-sm text-muted-foreground">
                  {note}
                </span>
              ))}
            </>
          }
          tools={
            <>
              {approvedCurrent ? (
                <IconTooltip label="Ver PDF">
                  <Button type="button" variant="ghost" size="icon" aria-label="Ver PDF" disabled={openingPdf} onClick={() => void openPdf(data.revision.id)}>
                    {openingPdf ? <Spinner /> : <FileText aria-hidden="true" />}
                  </Button>
                </IconTooltip>
              ) : null}
              <IconTooltip label="Historial">
                <Button asChild type="button" variant="ghost" size="icon" aria-label="Historial">
                  <Link href={area.history(data.revision.id)}>
                    <History aria-hidden="true" />
                  </Link>
                </Button>
              </IconTooltip>
              {showChanges && previousRevision ? (
                <>
                  <IconTooltip label={comparing ? "Cerrar la comparación" : "Comparar con la versión anterior"}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Comparar con la versión anterior"
                      aria-pressed={comparing}
                      className={comparing ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => void toggleCompare()}
                    >
                      <GitCompareArrows aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                  {comparing ? (
                    <IconTooltip label={changedFields.size === 0 ? "No hay cambios que resaltar" : highlight ? "Quitar el resaltado" : "Resaltar los cambios"}>
                      <span className="inline-flex" tabIndex={changedFields.size === 0 ? 0 : undefined}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Resaltar cambios"
                          aria-pressed={highlight}
                          disabled={changedFields.size === 0}
                          className={highlight && changedFields.size > 0 ? "bg-accent text-accent-foreground" : ""}
                          onClick={() => setHighlight((value) => !value)}
                        >
                          <Highlighter aria-hidden="true" />
                        </Button>
                      </span>
                    </IconTooltip>
                  ) : null}
                </>
              ) : null}
              {canReset ? (
                <MenuTooltip label="Más">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="Más">
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => setRestartOpen(true)}>
                          <RotateCcw data-icon="inline-start" aria-hidden="true" />
                          Reiniciar sílabo
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </MenuTooltip>
              ) : null}
            </>
          }
          actions={
            <>
              {canReviewCurrent ? (
                <Button type="button" variant="outline" onClick={openCorrection}>
                  Solicitar corrección
                </Button>
              ) : null}
              {canSign ? (
                <Button type="button" onClick={() => setSignOpen(true)}>
                  <FileSignature data-icon="inline-start" aria-hidden="true" />
                  Firmar y aprobar
                </Button>
              ) : null}
              {canApproveWithoutSigning ? (
                <Button type="button" disabled={approving} onClick={() => void approveWithoutSigning()}>
                  {approving ? <Spinner data-icon="inline-start" /> : <CheckCheck data-icon="inline-start" aria-hidden="true" />}
                  Aprobar
                </Button>
              ) : null}
            </>
          }
        >
          {correctionComments ? (
            <div className="mx-auto w-full" style={{ maxWidth: `${sheetWidth}px` }}>
              <ReviewCommentNotice comments={correctionComments} />
            </div>
          ) : null}

          {comparing && previousDetail ? (
            <div
              key="compare"
              className="mx-auto grid w-full grid-cols-2 items-start gap-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none"
              style={{ maxWidth: `${sheetWidth * 2 + 24}px` }}
            >
              <section className="flex min-w-0 flex-col gap-2" aria-label="Versión anterior">
                <h2 className="text-sm font-medium text-muted-foreground">Versión {previousDetail.revision.number} · anterior</h2>
                <SyllabusDocumentPreview presentation={previousDetail.presentation} sections={previousSections} />
              </section>
              <section ref={setCurrentSection} className="flex min-w-0 flex-col gap-2" aria-label="Versión actual">
                <h2 className="text-sm font-medium text-muted-foreground">Versión {data.revision.number} · actual</h2>
                <SyllabusDocumentPreview presentation={data.presentation} sections={previewSections} changed={highlight ? changedFields : NO_CHANGES} />
              </section>
              <ChangeMarks root={currentSection} />
            </div>
          ) : (
            <SyllabusDocumentPreview key="single" presentation={data.presentation} sections={previewSections} />
          )}

          {canReset ? (
            <SyllabusRestartDialog
              open={restartOpen}
              onOpenChange={setRestartOpen}
              syllabusId={data.syllabus.id}
              subject={data.syllabus.subject}
              impact={data.reset}
              onSaved={(message) => void restarted(message)}
            />
          ) : null}

          <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Solicitar corrección</DialogTitle>
                <DialogDescription>El sílabo vuelve al docente con su comentario</DialogDescription>
              </DialogHeader>
              <form id="correction-form" className="flex flex-col gap-4" noValidate onSubmit={correctionForm.handleSubmit(submitCorrection)}>
                <Field data-invalid={correctionErrors.length > 0}>
                  <FieldLabel htmlFor="correction-justification" required>
                    Comentario para el docente
                  </FieldLabel>
                  <Textarea
                    id="correction-justification"
                    value={correctionJustification}
                    rows={4}
                    aria-required="true"
                    placeholder="Ej. Revise los resultados de aprendizaje de la unidad 2"
                    onChange={(event) => correctionForm.setValue("justification", event.target.value)}
                  />
                  <FieldError errors={correctionErrors} />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={correcting}>
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="destructive" disabled={correcting || correctionJustification.trim() === ""}>
                    {correcting ? <Spinner data-icon="inline-start" /> : <Undo2 data-icon="inline-start" aria-hidden="true" />}
                    Solicitar corrección
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <SignatureDialog open={signOpen} onOpenChange={setSignOpen} title="Firmar y aprobar" confirmLabel="Firmar y aprobar" run={approve} />
        </PageFrame>
      </>
    )
  }

  if (loadError) {
    return (
      <>
        {closedBanner}
        <LoadErrorState message={loadError} onRetry={load} />
      </>
    )
  }

  if (loading) {
    return (
      <PageFrame title="" description="" loading actionsSkeleton={["w-9", "w-44", "w-64"]} headerClass="syllabus-editor-header" headerWidth={DEFAULT_SHEET_WIDTH} hideIcon eyebrow={backLink}>
        <LoadingSkeleton variant="preview" />
      </PageFrame>
    )
  }

  return null
}
