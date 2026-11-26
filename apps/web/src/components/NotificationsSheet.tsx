"use client"

import { Bell, CalendarClock, CheckCheck, ClipboardCheck, FileText, Library, X, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { markAllNotificationsRead, markNotificationRead, type Notification } from "@/api/notifications"
import { ChoiceGroup } from "@/components/domain/ChoiceGroup"
import { EmptyState } from "@/components/domain/EmptyState"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useOpenNotification } from "@/composables/useOpenNotification"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { relativeTime } from "@/lib/relativeTime"
import { paths, roleNotifications } from "@/lib/routes"
import { withoutFinalPeriod } from "@/lib/utils"
import { notificationKeys, notificationPreviewQuery, unreadCountQuery, type NotificationStatus } from "@/queries/notifications"
import { sessionState, useSession } from "@/state/session"

type Status = NotificationStatus

const PREVIEW_LIMIT = 10
const statusOptions = [{ value: "all", label: "Todas" }, { value: "unread", label: "No leídas" }]
const LIBRARY_NOTICES = ["silabo.enviado", "silabo.reenviado_biblioteca", "coordinacion.aprobado"]

const iconFor = (tipo: string): LucideIcon => {
  if (LIBRARY_NOTICES.includes(tipo) || tipo.startsWith("biblioteca")) return Library
  if (tipo.startsWith("documento")) return FileText
  if (tipo.startsWith("proceso") || tipo.startsWith("convocatoria")) return CalendarClock
  if (tipo.startsWith("silabo")) return ClipboardCheck
  return Bell
}

const isNotificationsPath = (path: string): boolean =>
  (path.endsWith("/notificaciones") && !path.includes("/configuracion/")) || path === paths.notifications

export function NotificationsSheet() {
  const pathname = usePathname()
  const router = useRouter()
  const compact = useMediaQuery("(width < 40rem)")
  const { open: openDestination } = useOpenNotification()
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>("unread")
  const [actionError, setActionError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const countQuery = useQuery(unreadCountQuery())
  const preview = useQuery({ ...notificationPreviewQuery(queryClient, status), enabled: open })
  const unreadCount = countQuery.data ?? 0
  const items = (preview.data?.notifications.data ?? []).slice(0, PREVIEW_LIMIT)
  const loading = preview.isFetching
  const error = actionError ?? (preview.isError ? "No se pudieron cargar las notificaciones" : null)
  const hasActiveRole = session?.active_role != null
  const isNotificationsPage = isNotificationsPath(pathname)
  const wasNotificationsPage = useRef(isNotificationsPage)

  useEffect(() => {
    const previous = wasNotificationsPage.current
    wasNotificationsPage.current = isNotificationsPage
    if (previous && !isNotificationsPage) void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
  }, [isNotificationsPage, queryClient])

  const startPreview = (): void => {
    setActionError(null)
    queryClient.removeQueries({ queryKey: notificationKeys.previews() })
  }

  const openSheet = (): void => {
    startPreview()
    setStatus("unread")
    setOpen(true)
  }

  const openNotifications = (): void => {
    const role = sessionState.current.value?.active_role?.code
    if (compact && role) router.push(roleNotifications(role))
    else openSheet()
  }

  const updateStatus = (value: string): void => {
    if (value !== "all" && value !== "unread") return
    if (open) startPreview()
    setStatus(value)
  }

  const select = async (notification: Notification): Promise<void> => {
    const unread = notification.leido_en === null
    if (notification.has_destination) {
      setOpen(false)
      await openDestination(notification)
    } else if (unread) {
      const readAt = new Date().toISOString()
      queryClient.setQueryData(notificationKeys.preview(status), (current: typeof preview.data) =>
        current ? { ...current, notifications: { ...current.notifications, data: current.notifications.data.map((item) => (item.id === notification.id ? { ...item, leido_en: readAt } : item)) } } : current,
      )
      void markNotificationRead(notification.id).catch(() => undefined)
    }
    if (unread) queryClient.setQueryData<number>(notificationKeys.unreadCount(), (count = 0) => Math.max(0, count - 1))
  }

  const readAll = async (): Promise<void> => {
    setActionError(null)
    try {
      await markAllNotificationsRead()
    } catch {
      setActionError("No se pudieron marcar las notificaciones como leídas")
      return
    }
    await queryClient.invalidateQueries({ queryKey: notificationKeys.all })
  }

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={open || isNotificationsPage ? "secondary" : "ghost"}
              size="icon-sm"
              className="relative max-sm:h-12 max-sm:w-auto max-sm:min-w-16 max-sm:flex-col max-sm:gap-0.5 max-sm:px-3 max-sm:order-1 [&_svg]:max-sm:size-5"
              aria-label={unreadCount > 0 ? "Notificaciones sin leer" : "Notificaciones"}
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={openNotifications}
            >
              <Bell data-icon="inline-start" aria-hidden="true" />
              <span className="text-xs font-medium sm:hidden" aria-hidden="true">Notificaciones</span>
              {unreadCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute top-1 right-1 size-1.5 border-0 p-0 ring-1 ring-background max-sm:top-1.5 max-sm:right-4"
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notificaciones</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          onInteractOutside={() => setOpen(false)}
          className="top-0 right-0 left-auto h-dvh max-h-none w-full translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-r-0 duration-300 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md"
        >
          <div className="flex items-center justify-between gap-2 border-b px-6 py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <SheetTitle className="text-lg font-semibold">Notificaciones</SheetTitle>
              <SheetDescription>Avisos sobre sus sílabos y periodos académicos</SheetDescription>
            </div>
            <TooltipProvider delayDuration={150}>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Marcar todas como leídas" disabled={unreadCount === 0} onClick={() => void readAll()}>
                        <CheckCheck aria-hidden="true" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Marcar todas como leídas</TooltipContent>
                </Tooltip>
                <IconTooltip label="Cerrar notificaciones">
                  <SheetClose asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar notificaciones"><X aria-hidden="true" /></Button>
                  </SheetClose>
                </IconTooltip>
              </div>
            </TooltipProvider>
          </div>

          <ChoiceGroup value={status} options={statusOptions} label="Filtrar notificaciones" className="px-6 py-3" onValueChange={updateStatus} />

          <ScrollArea className="min-h-0 flex-1">
            <div aria-live="polite">
              {loading && items.length === 0 ? (
                <div role="status" aria-live="polite" aria-busy="true" aria-label="Cargando notificaciones">
                  <span className="sr-only">Cargando notificaciones…</span>
                  <div aria-hidden="true" className="flex flex-col divide-y border-t">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="flex items-start gap-3 px-6 py-4">
                        <Skeleton className="mt-0.5 size-5 shrink-0" />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex items-center justify-between gap-3">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-3 w-12 shrink-0" />
                          </div>
                          <Skeleton className="h-4 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : error ? (
                <FeedbackAlert message={error} className="mx-6" />
              ) : items.length === 0 ? (
                <EmptyState className="mx-6 my-1" title={status === "unread" ? "No tiene notificaciones sin leer en este período" : "No tiene notificaciones en este período"} />
              ) : (
                <ul className="flex flex-col divide-y border-t">
                  {items.map((notification) => {
                    const Icon = iconFor(notification.tipo)
                    return (
                      <li key={notification.id}>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none px-6 py-4 text-left font-normal"
                          onClick={() => void select(notification)}
                        >
                          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="text-sm font-medium">{notification.titulo}</span>
                              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                {relativeTime(notification.notificado_en)}
                                {notification.leido_en === null ? <span className="size-2 rounded-full bg-brand-accent" aria-label="Sin leer" /> : null}
                              </span>
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">{withoutFinalPeriod(notification.mensaje)}</span>
                            {notification.context ? <span className="mt-1 block text-xs text-muted-foreground">{notification.context}</span> : null}
                          </span>
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </ScrollArea>

          {hasActiveRole ? (
            <div className="border-t px-6 py-4">
              <Button asChild variant="secondary" className="w-full">
                <Link href={paths.notifications} onClick={() => setOpen(false)}>
                  Ver todas las notificaciones
                </Link>
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
