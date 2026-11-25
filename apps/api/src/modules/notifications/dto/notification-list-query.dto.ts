import { notificationListQuerySchema } from "@silabos/shared/schemas/notifications"
import { createZodDto } from "nestjs-zod"

export class NotificationListQueryDto extends createZodDto(notificationListQuerySchema) {}
