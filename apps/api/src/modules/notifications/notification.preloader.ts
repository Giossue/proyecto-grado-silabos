import { Inject, Injectable } from "@nestjs/common"
import type { SessionPreloader } from "../../common/decorators/authenticated.options"
import type { SessionRequest } from "../../common/http/session-request"
import { jsonError } from "../../server/http/responses"
import { NotificationsRepository } from "./notifications.repository"

const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/
const MODEL = "App\\Modules\\Operations\\Infrastructure\\Persistence\\Models\\InternalNotification"

@Injectable()
export class NotificationPreloader implements SessionPreloader {
  constructor(@Inject(NotificationsRepository) private readonly notifications: NotificationsRepository) {}

  async load(_request: Request, _user: unknown, http: SessionRequest): Promise<Response | null> {
    const id = String(http.params.notification ?? "")
    const notification = UUID.test(id) ? await this.notifications.find(id) : null
    if (notification === null) return jsonError(404, `No query results for model [${MODEL}] ${id}`)
    http.preloaded = notification
    return null
  }
}
