"use client"

import { CheckCheck, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { ApiError } from "@/api/client"
import { getNotifications, markAllNotificationsRead, markNotificationRead, type NotificationsResponse } from "@/api/notifications"
import { EmptyState } from "@/components/domain/EmptyState"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { TablePagination } from "@/components/domain/TablePagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useOpenNotification } from "@/composables/useOpenNotification"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { paths } from "@/lib/routes"
import { cn, withoutFinalPeriod } from "@/lib/utils"

type Status = "all" | "unread"

const formatDate = (value: string): string => formatDateDisplay(value, { dateStyle: "medium", timeStyle: "short" })

export default function NotificationsPage() {
  const router = useRouter()
  const { open, openingId } = useOpenNotification()
  const [result, setResult] = useState<NotificationsResponse | null>(null)
  const [status, setStatus] = useState<Status>("unread")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)

  const fetchPage = useCallback(
    (page: number, filter: Status): Promise<void> =>
      getNotifications(filter, page)
        .then(setResult, (reason: unknown) => {
          if (reason instanceof ApiError && reason.status === 401) {
            router.replace(paths.login)
            return
          }
          setError("No se pudieron cargar las notificaciones")
        })
        .finally(() => setLoading(false)),
    [router],
  )

  useEffect(() => {
    void fetchPage(1, "unread")
  }, [fetchPage])

  const load = (page = 1, filter: Status = status): Promise<void> => {
    setLoading(true)
    setError(null)
    return fetchPage(page, filter)
  }

  const filterBy = (filter: Status): void => {
    setStatus(filter)
    void load(1, filter)
  }

  const mutate = async (operation: () => Promise<unknown>, page = 1): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await operation()
      await load(page)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo actualizar la notificación")
    } finally {
      setPending(false)
    }
  }

  const read = (id: string): Promise<void> => mutate(() => markNotificationRead(id), result?.notifications.current_page ?? 1)
  const readAll = (): Promise<void> => mutate(() => markAllNotificationsRead())
  const firstLoad = !result && !error

  return (
    <PageFrame
      title="Notificaciones"
      description="Avisos del período en curso sobre sus sílabos y sus documentos"
      size="wide"
      loading={firstLoad}
      actionsSkeleton={firstLoad ? ["w-56"] : []}
      tools={
        result?.unread_count ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => void readAll()}>
            {pending ? <Spinner /> : <CheckCheck aria-hidden="true" />}
            Marcar todas como leídas
          </Button>
        ) : null
      }
    >
      {firstLoad ? (
        <div data-skeleton="notification-filters" className="flex gap-2" aria-hidden="true">
          <Skeleton className="h-9 w-18" />
          <Skeleton className="h-9 w-26" />
        </div>
      ) : (
        <nav className="flex gap-2" aria-label="Filtrar notificaciones">
          <Button variant={status === "all" ? "default" : "outline"} disabled={pending} onClick={() => filterBy("all")}>
            Todas
          </Button>
          <Button variant={status === "unread" ? "default" : "outline"} disabled={pending} onClick={() => filterBy("unread")}>
            No leídas
          </Button>
        </nav>
      )}
      {error ? <LoadErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !result ? (
        <LoadingSkeleton variant="notifications" />
      ) : result && result.notifications.data.length === 0 ? (
        <EmptyState data-tour="notifications-list" title="No existen notificaciones" />
      ) : result ? (
        <Card data-tour="notifications-list">
          <CardContent className="flex flex-col gap-3">
            {result.notifications.data.map((notification) => (
              <article key={notification.id} className={cn("rounded-md p-4 ring-1 ring-surface-ring", notification.leido_en === null && "bg-muted/40")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{notification.titulo}</h2>
                      {notification.leido_en === null ? <Badge variant="secondary">Nueva</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm">{withoutFinalPeriod(notification.mensaje)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(notification.notificado_en)}
                      {notification.context ? ` · ${notification.context}` : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!notification.leido_en ? (
                      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void read(notification.id)}>
                        Marcar leída
                      </Button>
                    ) : null}
                    {notification.has_destination ? (
                      <Button type="button" size="sm" disabled={openingId !== null} onClick={() => void open(notification)}>
                        {openingId === notification.id ? <Spinner data-icon="inline-start" /> : <ExternalLink data-icon="inline-start" aria-hidden="true" />}
                        Abrir
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {result && result.notifications.last_page > 1 ? (
        <TablePagination meta={result.notifications} label="Paginación de notificaciones" onPageChange={(page) => void load(page)} />
      ) : null}
    </PageFrame>
  )
}
