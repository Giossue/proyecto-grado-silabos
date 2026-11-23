"use client"

import { ArrowLeft, FileSignature, FileText, MessageSquareText, Send, UserCheck } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { commentLibraryReview, getLibraryReview, verifyLibraryReview, type LibraryReviewDetail } from "@/api/library"
import { EmptyState } from "@/components/domain/EmptyState"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { StatusBadge, type StatusTone } from "@/components/domain/StatusBadge"
import { FreeTextContent } from "@/components/domain/syllabus/FreeTextContent"
import { SignatureDialog, type StatementSigner } from "@/components/domain/syllabus/SignatureDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { afterDialogExit } from "@/lib/dialogExit"
import { goBack } from "@/lib/goBack"
import { libraryStatus, libraryStatusLabel, libraryStatusTone } from "@/lib/libraryStates"
import { openRevisionPdf } from "@/lib/openPdf"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"

type LibraryAction = "return" | "sign" | "send"

const OTHER_REASON = "otro"

const cameFrom = (listPath: string): boolean => {
  let back = false
  goBack({ back: () => { back = true }, push: () => undefined }, listPath)

  return back
}

export default function LibraryReviewDetailPage() {
  const router = useRouter()
  const revisionId = String(useParams<{ revision: string }>().revision)
  const [review, setReview] = useState<LibraryReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [returnOpen, setReturnOpen] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [reasonErrors, setReasonErrors] = useState<string[]>([])
  const [otherReason, setOtherReason] = useState("")
  const [otherErrors, setOtherErrors] = useState<string[]>([])
  const [returnError, setReturnError] = useState("")
  const [sending, setSending] = useState(false)
  const [sendingOn, setSendingOn] = useState(false)
  const [openingPdf, setOpeningPdf] = useState(false)
  const [takeoverFor, setTakeoverFor] = useState<LibraryAction | null>(null)
  const [shownRevision, setShownRevision] = useState(revisionId)

  if (shownRevision !== revisionId) {
    setShownRevision(revisionId)
    setLoading(true)
    setLoadError("")
  }

  const fromHistory = cameFrom(paths.library.history)
  const otherSelected = selectedReasons.includes(OTHER_REASON)
  const canSign = Boolean(review?.can_verify && review.signing_statement)
  const canSendWithoutSigning = Boolean(review?.can_verify && !review.signing_statement)
  const canReturn = selectedReasons.length > 0 && (!otherSelected || otherReason.trim().length >= 5)
  const fields = (review?.sections ?? []).flatMap((section) => section.fields.map((field) => ({ ...field, title: field.label.trim() || section.title })))
  const outcomeBadge: { label: string; tone: StatusTone } | null =
    review === null || review.outcome === null ? null : { label: libraryStatusLabel(libraryStatus(review)), tone: libraryStatusTone(libraryStatus(review)) }

  const fetchReview = useCallback(
    (id: string): Promise<void> =>
      getLibraryReview(id)
        .then((result) => setReview(result.review))
        .catch((failure: unknown) => setLoadError(failure instanceof ApiError ? failure.message : "No se pudo cargar la bibliografía"))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    void fetchReview(revisionId)
  }, [fetchReview, revisionId])

  const load = (): void => {
    setLoading(true)
    setLoadError("")
    void fetchReview(revisionId)
  }

  const openPdf = async (): Promise<void> => {
    if (!review) return
    setOpeningPdf(true)
    const failure = await openRevisionPdf(review.revision_id)
    setOpeningPdf(false)
    if (failure) toast.error(failure)
  }

  const toggleReason = (code: string, checked: boolean | "indeterminate"): void => {
    setSelectedReasons((current) => (checked === true ? [...current, code] : current.filter((item) => item !== code)))
  }

  const openReturn = (): void => {
    setReasonErrors([])
    setOtherErrors([])
    setReturnError("")
    setReturnOpen(true)
  }

  const sendWithoutSigning = async (): Promise<void> => {
    if (!review) return
    setSendingOn(true)
    try {
      const result = await verifyLibraryReview(review.revision_id, null)
      toast.success(result.message)
      router.replace(paths.library.reviews)
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : "No se pudo enviar a coordinación")
    } finally {
      setSendingOn(false)
    }
  }

  const run = (action: LibraryAction): void => {
    if (action === "return") openReturn()
    else if (action === "sign") setSignOpen(true)
    else void sendWithoutSigning()
  }

  const act = (action: LibraryAction): void => {
    if (review?.assigned_to_other) {
      setTakeoverFor(action)
      return
    }
    run(action)
  }

  const confirmTakeover = (): void => {
    const action = takeoverFor
    setTakeoverFor(null)
    if (action !== null) run(action)
  }

  const sendReturn = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!review) return
    setReasonErrors([])
    setOtherErrors([])
    setReturnError("")
    if (selectedReasons.length === 0) {
      setReasonErrors(["Elija al menos un motivo"])
      return
    }
    if (otherSelected && otherReason.trim().length < 5) {
      setOtherErrors(["Escriba el otro motivo (mínimo 5 caracteres)"])
      return
    }
    setSending(true)
    try {
      const result = await commentLibraryReview(review.revision_id, {
        reasons: selectedReasons,
        ...(otherSelected ? { other: otherReason.trim() } : {}),
      })
      setReturnOpen(false)
      toast.success(result.message)
      await afterDialogExit()
      router.replace(paths.library.reviews)
    } catch (failure) {
      if (failure instanceof ApiError) {
        setReasonErrors(failure.errors.reasons ?? failure.errors["reasons.0"] ?? [])
        setOtherErrors(failure.errors.other ?? [])
        setReturnError(failure.message)
      } else {
        setReturnError("No se pudo devolver el sílabo")
      }
    } finally {
      setSending(false)
    }
  }

  const approve = async (sign: StatementSigner): Promise<void> => {
    if (!review?.signing_statement) return
    const result = await verifyLibraryReview(review.revision_id, sign(review.signing_statement))
    setSignOpen(false)
    toast.success(result.message)
    await afterDialogExit()
    router.replace(paths.library.reviews)
  }

  const backLink = (
    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => goBack(router, fromHistory ? paths.library.history : paths.library.reviews)}>
      <ArrowLeft aria-hidden="true" />
      {fromHistory ? "Volver al historial" : "Volver a revisiones"}
    </Button>
  )

  if (review && !loadError) {
    return (
      <PageFrame
        title={review.subject}
        description={`${review.career} · ${review.teachers.join(", ")}`}
        hideIcon
        size="narrow"
        eyebrow={backLink}
        titleBadge={
          outcomeBadge ? (
            <>
              <StatusBadge label={outcomeBadge.label} tone={outcomeBadge.tone} />
              {review.outcome === "reemplazado" ? <span className="text-sm text-muted-foreground">Hay un envío más reciente · solo consulta</span> : null}
            </>
          ) : null
        }
        tools={
          review.approved_at ? (
            <IconTooltip label="Ver PDF">
              <Button type="button" variant="ghost" size="icon" aria-label="Ver PDF" disabled={openingPdf} onClick={() => void openPdf()}>
                {openingPdf ? <Spinner /> : <FileText aria-hidden="true" />}
              </Button>
            </IconTooltip>
          ) : null
        }
        actions={
          <>
            {review.can_comment ? (
              <Button type="button" variant="outline" onClick={() => act("return")}>
                Devolver al docente
              </Button>
            ) : null}
            {canSign ? (
              <Button type="button" onClick={() => act("sign")}>
                <FileSignature data-icon="inline-start" aria-hidden="true" />
                Firmar y enviar a coordinación
              </Button>
            ) : null}
            {canSendWithoutSigning ? (
              <Button type="button" disabled={sendingOn} onClick={() => act("send")}>
                {sendingOn ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden="true" />}
                Enviar a coordinación
              </Button>
            ) : null}
          </>
        }
      >
        {review.assigned_to_other ? (
          <Alert>
            <AlertDescription>Lo atiende {review.responsible}, que lo revisó antes</AlertDescription>
          </Alert>
        ) : null}

        {fields.length ? (
          <article className="flex flex-col gap-6 rounded-md bg-card px-6 py-6 text-card-foreground shadow-surface ring-1 ring-surface-ring" aria-label="Bibliografía">
            {fields.map((field) => (
              <section key={field.key} className="flex min-w-0 flex-col gap-2">
                <h2 className="text-base font-semibold">{field.title}</h2>
                <FreeTextContent value={field.document ?? field.value} emptyText="Sin completar" />
              </section>
            ))}
          </article>
        ) : (
          <EmptyState title="Este sílabo no tiene bibliografía" />
        )}

        <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Devolver al docente</DialogTitle>
              <DialogDescription>Marque los motivos para avisar al docente y que lo corrija</DialogDescription>
            </DialogHeader>
            <form id="library-comment-form" className="flex flex-col gap-4" onSubmit={(event) => void sendReturn(event)}>
              <Field data-invalid={reasonErrors.length > 0}>
                <FieldLabel required>Motivos</FieldLabel>
                <div className="flex flex-col gap-3" role="group" aria-label="Motivos de la devolución">
                  {review.comment_reasons.map((reason) => (
                    <div key={reason.code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`library-reason-${reason.code}`}
                        checked={selectedReasons.includes(reason.code)}
                        onCheckedChange={(checked) => toggleReason(reason.code, checked)}
                      />
                      <label htmlFor={`library-reason-${reason.code}`}>{reason.label}</label>
                    </div>
                  ))}
                </div>
                <FieldError errors={reasonErrors} />
              </Field>
              {otherSelected ? (
                <Field data-invalid={otherErrors.length > 0}>
                  <FieldLabel htmlFor="library-other-reason" required>
                    Otro motivo
                  </FieldLabel>
                  <Textarea
                    id="library-other-reason"
                    value={otherReason}
                    rows={3}
                    maxLength={1000}
                    placeholder="Ej. Falta la edición 2020 del libro de Pressman"
                    onChange={(event) => setOtherReason(event.target.value)}
                  />
                  <FieldError errors={otherErrors} />
                </Field>
              ) : null}
              {returnError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{returnError}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={sending}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={sending || !canReturn}>
                  {sending ? <Spinner data-icon="inline-start" /> : <MessageSquareText data-icon="inline-start" aria-hidden="true" />}
                  Devolver al docente
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={takeoverFor !== null}
          onOpenChange={(value) => {
            if (!value) setTakeoverFor(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lo atiende {review.responsible}</DialogTitle>
              <DialogDescription>{review.responsible} revisó este sílabo antes y es quien lo atiende. ¿Quiere continuar usted?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTakeoverFor(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmTakeover}>
                <UserCheck data-icon="inline-start" aria-hidden="true" />
                Continuar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <SignatureDialog open={signOpen} onOpenChange={setSignOpen} title="Firmar y enviar a coordinación" confirmLabel="Firmar y enviar" run={approve} />
      </PageFrame>
    )
  }

  if (loadError) return <LoadErrorState message={loadError} onRetry={load} />

  if (loading) {
    return (
      <PageFrame title="" description="" loading actionsSkeleton={["w-44", "w-40"]} hideIcon size="narrow" eyebrow={backLink}>
        <LoadingSkeleton variant="review" reviewStage="library" />
      </PageFrame>
    )
  }

  return null
}
