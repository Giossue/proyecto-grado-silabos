import { Inject, Injectable } from "@nestjs/common"
import type { EmailPreferencesInput, NotificationListQuery } from "@silabos/shared/schemas/notifications"
import type { PageLinks } from "../../common/decorators/query-input.decorator"
import { ResponseException } from "../../common/exceptions/response.exception"
import type { AppSession, BridgeDeps } from "../../server/auth/types"
import { lengthAwarePaginator, resolveCurrentPage } from "../../server/http/pagination"
import { forbidden } from "../../server/http/responses"
import { emailOptionsFor } from "../../server/operations/emailNoticeCatalog"
import { contextLabel, resolveDestination } from "../../server/operations/notificationDestination"
import type { StoredNotification } from "../../server/operations/notifications"
import { AUTH_BRIDGE } from "../auth/auth.tokens"
import { NotificationDestinationsRepository } from "./notification-destinations.repository"
import { NotificationsRepository } from "./notifications.repository"

export const NOTIFICATIONS_PER_PAGE = 20
export const NO_SCREEN = "Este aviso ya no tiene una pantalla disponible para sus roles actuales."

function storedPreferences(current: unknown): Record<string, unknown> {
  if (current === null || current === undefined) return {}
  if (typeof current === "object") return { ...(current as Record<string, unknown>) }
  return { "0": current }
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NotificationsRepository) private readonly notifications: NotificationsRepository,
    @Inject(NotificationDestinationsRepository) private readonly destinations: NotificationDestinationsRepository,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
  ) {}

  async list(session: AppSession, query: NotificationListQuery, links: PageLinks) {
    const currentPage = resolveCurrentPage(query.page)
    const { total, items } = await this.notifications.page(session.user.id, { page: currentPage, perPage: NOTIFICATIONS_PER_PAGE, onlyUnread: query.status === "unread" })
    const data = []
    for (const notification of items) {
      const destination = await resolveDestination(notification, session.user.id, session.activeRole, session.eligibleRoles, this.destinations)
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
    return {
      filters: { status: query.status },
      notifications: lengthAwarePaginator({ items: data, total, perPage: NOTIFICATIONS_PER_PAGE, currentPage, path: links.path, query: links.query }),
      unread_count: await this.notifications.unreadCount(session.user.id),
    }
  }

  async markAllRead(session: AppSession) {
    await this.notifications.markAllRead(session.user.id, this.bridge.now())
    return { message: "Todas las notificaciones quedaron marcadas como leídas." }
  }

  async markRead(session: AppSession, notification: StoredNotification) {
    this.assertOwner(session, notification)
    if (notification.readAt === null) await this.notifications.markRead(notification.id, this.bridge.now())
    return { message: "Notificación marcada como leída." }
  }

  async open(session: AppSession, notification: StoredNotification) {
    this.assertOwner(session, notification)
    if (notification.readAt === null) await this.notifications.markRead(notification.id, this.bridge.now())
    const destination = await resolveDestination(notification, session.user.id, session.activeRole, session.eligibleRoles, this.destinations)
    if (destination === null) return { path: null, role_changed: false, message: NO_SCREEN }
    const target = destination.assignment
    const changed = target !== null && target.id !== session.activeRole?.id
    if (changed) await this.bridge.sessions.setActiveRole(session.session, target.id)
    return { path: destination.path, role_changed: changed }
  }

  async roles(userId: string): Promise<string[]> {
    return (await this.bridge.store.effectiveRoleAssignments(userId)).map((assignment) => assignment.role)
  }

  async emailPreferences(session: AppSession) {
    return { options: emailOptionsFor(await this.roles(session.user.id), session.user.emailPreferences) }
  }

  async updateEmailPreferences(session: AppSession, roles: string[], input: EmailPreferencesInput) {
    const requested = Object.fromEntries(Object.entries(input.preferences as Record<string, unknown>).map(([key, item]) => [key, item === true || item === 1 || item === "1"]))
    const preferences = { ...storedPreferences(session.user.emailPreferences), ...requested }
    await this.notifications.saveEmailPreferences(session.user.id, preferences)
    return { options: emailOptionsFor(roles, preferences) }
  }

  private assertOwner(session: AppSession, notification: StoredNotification): void {
    if (notification.userId !== session.user.id) throw new ResponseException(forbidden())
  }
}
