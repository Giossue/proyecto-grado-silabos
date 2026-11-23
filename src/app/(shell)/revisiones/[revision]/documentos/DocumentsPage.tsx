"use client"

import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { downloadDocument, getDocuments, requestDocuments, type DocumentsPayload } from "@/api/documents"
import { getSession, type Session } from "@/api/session"
import { EmptyState } from "@/components/domain/EmptyState"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { attemptKey } from "@/lib/attemptKey"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { openPdfWindow, showInPdfWindow } from "@/lib/openPdf"
import { paths } from "@/lib/routes"

const PENDING = ["pendiente", "en_ejecucion", "procesando"]

export default function DocumentsPage() {
  const router = useRouter()
  const revisionId = String(useParams<{ revision: string }>().revision)
  const [data, setData] = useState<DocumentsPayload | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [retryKey] = useState(attemptKey)

  const latest = [...(data?.artifacts ?? [])].sort((left, right) => new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime())[0] ?? null
  const ready = latest?.estado === "completado" && latest.files !== null
  const pending = PENDING.includes(latest?.estado ?? "")
  const failed = latest?.estado === "fallido"
  const backHref = session?.active_role?.code === "coordinador" ? paths.coordination.review(revisionId) : paths.teacher.syllabus(data?.syllabus.id ?? "")
  const fileName = `silabo-${data?.syllabus.code ?? "asignatura"}.pdf`

  const fetchData = useCallback(
    (): Promise<void> =>
      getSession()
        .then(async (current) => {
          const payload = await getDocuments(revisionId)
          setSession(current)
          setData(payload)
        })
        .catch((reason: unknown) => {
          if (reason instanceof ApiError && reason.status === 401) {
            router.replace(paths.login)
            return
          }
          setLoadError(reason instanceof ApiError ? reason.message : "No se pudo cargar el PDF")
        })
        .finally(() => setLoading(false)),
    [revisionId, router],
  )

  const load = useCallback((): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    return fetchData()
  }, [fetchData])

  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  })

  useEffect(() => {
    void fetchData()
    const timer = window.setInterval(() => {
      if (pendingRef.current) void load()
    }, 4000)

    return () => clearInterval(timer)
  }, [fetchData, load])

  const fetchPdf = async (): Promise<string | null> => {
    if (!latest) return null
    setWorking(true)
    setActionError(null)
    try {
      return URL.createObjectURL(await downloadDocument(latest.id))
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudo abrir el PDF")
      return null
    } finally {
      setWorking(false)
    }
  }

  const view = async (): Promise<void> => {
    const tab = openPdfWindow()
    const url = await fetchPdf()
    if (!url) {
      tab?.close()
      return
    }
    showInPdfWindow(tab, url)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const retry = async (): Promise<void> => {
    setWorking(true)
    setActionError(null)
    try {
      await requestDocuments(revisionId, retryKey.use(revisionId))
      retryKey.reset()
      await load()
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudo reintentar")
    } finally {
      setWorking(false)
    }
  }

  const download = async (): Promise<void> => {
    const url = await fetchPdf()
    if (!url) return
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const firstLoad = !data && !loadError

  return (
    <PageFrame
      title="PDF del sílabo"
      description={data ? `${data.syllabus.subject} · ${data.syllabus.period}` : ""}
      size="narrow"
      loading={firstLoad}
      actionsSkeleton={firstLoad ? ["w-22", "w-36"] : []}
      eyebrow={
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" />
            Volver
          </Link>
        </Button>
      }
      actions={
        ready ? (
          <>
            <Button type="button" variant="outline" disabled={working} onClick={() => void view()}>
              Ver PDF
            </Button>
            <Button type="button" disabled={working} onClick={() => void download()}>
              {working ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden="true" />}
              Descargar PDF
            </Button>
          </>
        ) : null
      }
    >
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={() => void load()} />
      ) : loading && !data ? (
        <LoadingSkeleton variant="documents" />
      ) : data ? (
        <>
          {actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          {ready ? (
            <p className="text-sm text-muted-foreground">Aprobado el {formatDateDisplay(data.revision.approved_at, { dateStyle: "medium" })}</p>
          ) : pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner />
              Generando el PDF…
            </p>
          ) : failed ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo generar el PDF</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{latest?.error}</span>
                <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void retry()}>
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <EmptyState title="El PDF aún no está listo" />
          )}
        </>
      ) : null}
    </PageFrame>
  )
}
