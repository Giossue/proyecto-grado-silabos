import { requireSession, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { lengthAwarePaginator, resolveCurrentPage } from "../http/pagination"
import { hasArrayParameter, queryParams, requestUrl } from "../http/request"
import { jsonError, apiJson, validationError } from "../http/responses"
import { contextLabel, resolveDestination, type DestinationLookups } from "./notificationDestination"
import { createDestinationLookups, createNotificationRepository, createNotificationWriteRepository } from "./notificationQueries"

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

export type StoredNotification = {
  id: string
  userId: string
  type: string
  resourceType: string | null
  resourceId: string | null
  readAt: string | null
}

export interface NotificationWriteRepository {
  find(id: string): Promise<StoredNotification | null>
  markRead(id: string, at: number): Promise<void>
  markAllRead(userId: string, at: number): Promise<void>
}

export type NotificationWriteDeps = {
  bridge: BridgeDeps
  notifications: NotificationWriteRepository
  lookups: DestinationLookups
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
  const query = queryParams(url)
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

  return apiJson({
    filters: { status },
    notifications: lengthAwarePaginator({ items: data, total, perPage: PER_PAGE, currentPage, path: requestUrl(request), query }),
    unread_count: await deps.notifications.unreadCount(session.user.id),
  })
}

const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/
const MODEL = "App\\Modules\\Operations\\Infrastructure\\Persistence\\Models\\InternalNotification"
const FORBIDDEN = "No tiene permiso para hacer esto."
const NO_SCREEN = "Este aviso ya no tiene una pantalla disponible para sus roles actuales."

export function defaultNotificationWriteDeps(): NotificationWriteDeps {
  return { bridge: defaultBridgeDeps(), notifications: createNotificationWriteRepository(), lookups: createDestinationLookups() }
}

export async function markAllNotificationsRead(request: Request, deps: NotificationWriteDeps = defaultNotificationWriteDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true }, deps.bridge)
  if (session instanceof Response) return session
  await deps.notifications.markAllRead(session.user.id, deps.bridge.now())
  return apiJson({ message: "Todas las notificaciones quedaron marcadas como leídas." })
}

type OwnedNotification = { session: AppSession; notification: StoredNotification }

function notificationRequirements(id: string, deps: NotificationWriteDeps, activeRole: "optional" | undefined, found: (notification: StoredNotification) => void) {
  return {
    verified: true,
    activeRole,
    afterAuthentication: async () => {
      const notification = UUID.test(id) ? await deps.notifications.find(id) : null
      if (notification) found(notification)
      return notification ? null : jsonError(404, `No query results for model [${MODEL}] ${id}`)
    },
  }
}

async function ownedNotification(
  request: Request,
  id: string,
  deps: NotificationWriteDeps,
  activeRole: "optional" | undefined,
): Promise<OwnedNotification | Response> {
  let notification: StoredNotification | null = null
  const session = await requireSession(request, notificationRequirements(id, deps, activeRole, (value) => (notification = value)), deps.bridge)
  if (session instanceof Response) return session
  const found = notification as StoredNotification | null
  if (found === null || found.userId !== session.user.id) return apiJson({ message: FORBIDDEN }, 403)
  return { session, notification: found }
}

export async function markNotificationRead(
  request: Request,
  id: string,
  deps: NotificationWriteDeps = defaultNotificationWriteDeps(),
): Promise<Response> {
  const owned = await ownedNotification(request, id, deps, undefined)
  if (owned instanceof Response) return owned
  if (owned.notification.readAt === null) await deps.notifications.markRead(owned.notification.id, deps.bridge.now())
  return apiJson({ message: "Notificación marcada como leída." })
}

export async function openNotification(
  request: Request,
  id: string,
  deps: NotificationWriteDeps = defaultNotificationWriteDeps(),
): Promise<Response> {
  let found: StoredNotification | null = null
  const requirements = notificationRequirements(id, deps, "optional", (value) => (found = value))
  const session = await requireSession(request, requirements, deps.bridge)
  if (session instanceof Response) return session
  const notification = found as StoredNotification | null
  if (notification === null || notification.userId !== session.user.id) return apiJson({ message: FORBIDDEN }, 403)
  if (notification.readAt === null) await deps.notifications.markRead(notification.id, deps.bridge.now())
  const destination = await resolveDestination(notification, session.user.id, session.activeRole, session.eligibleRoles, deps.lookups)
  if (destination === null) return apiJson({ path: null, role_changed: false, message: NO_SCREEN })
  const target = destination.assignment
  const changed = target !== null && target.id !== session.activeRole?.id
  if (changed) await deps.bridge.sessions.setActiveRole(session.session, target.id)
  return apiJson({ path: destination.path, role_changed: changed })
}
