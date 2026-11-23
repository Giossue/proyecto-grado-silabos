import "server-only"
import { requireSession, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { lengthAwarePaginator, resolveCurrentPage } from "../laravel/pagination"
import { hasArrayParameter, laravelQuery, laravelRequestUrl } from "../laravel/request"
import { laravelJson, validationError } from "../laravel/responses"
import { contextLabel, resolveDestination, type DestinationLookups } from "./notificationDestination"
import { createDestinationLookups, createNotificationRepository } from "./notificationQueries"

export type { DestinationLookups } from "./notificationDestination"

export type NotificationRecord = {
  id: string
  type: string
  title: string
  message: string
  resourceType: string | null
  resourceId: string | null
  readAt: string | null
  notifiedAt: string
}

export interface NotificationRepository {
  page(userId: string, options: { page: number; perPage: number; onlyUnread: boolean }): Promise<{ total: number; items: NotificationRecord[] }>
  unreadCount(userId: string): Promise<number>
}

export type NotificationDeps = {
  bridge: BridgeDeps
  notifications: NotificationRepository
  lookups: DestinationLookups
}

const PER_PAGE = 20
const STATUSES = ["all", "unread"]
const NOT_A_STRING = "El campo estado debe ser una cadena de texto."
const NOT_ALLOWED = "El valor seleccionado en estado no es válido."

export function defaultNotificationDeps(): NotificationDeps {
  return { bridge: defaultBridgeDeps(), notifications: createNotificationRepository(), lookups: createDestinationLookups() }
}

export async function listNotifications(request: Request, deps: NotificationDeps = defaultNotificationDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "optional" }, deps.bridge)
  if (session instanceof Response) return session

  const url = new URL(request.url)
  const query = laravelQuery(url)
  if (hasArrayParameter(url, "status")) return validationError({ status: [NOT_A_STRING, NOT_ALLOWED] })
  const requested = query.get("status") ?? null
  if (requested !== null && !STATUSES.includes(requested)) return validationError({ status: [NOT_ALLOWED] })
  const status = requested ?? "all"

  const currentPage = resolveCurrentPage(query.get("page") ?? null)
  const { total, items } = await deps.notifications.page(session.user.id, { page: currentPage, perPage: PER_PAGE, onlyUnread: status === "unread" })
  const data = []
  for (const notification of items) {
    const destination = await resolveDestination(notification, session.user.id, session.activeRole, session.eligibleRoles, deps.lookups)
    data.push({
      id: notification.id,
      tipo: notification.type,
      titulo: notification.title,
      mensaje: notification.message,
      leido_en: notification.readAt,
      notificado_en: notification.notifiedAt,
      has_destination: destination !== null,
      context: contextLabel(destination?.assignment ?? null),
    })
  }

  return laravelJson({
    filters: { status },
    notifications: lengthAwarePaginator({ items: data, total, perPage: PER_PAGE, currentPage, path: laravelRequestUrl(request), query }),
    unread_count: await deps.notifications.unreadCount(session.user.id),
  })
}
