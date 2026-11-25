import { aiSettingsBody, librarySettingsBody, notificationSettingsBody } from "@silabos/shared/schemas/operationsApi"
import { createZodDto } from "nestjs-zod"

export class NotificationSettingsDto extends createZodDto(notificationSettingsBody) {}

export class AiSettingsDto extends createZodDto(aiSettingsBody) {}

export class LibrarySettingsDto extends createZodDto(librarySettingsBody) {}
