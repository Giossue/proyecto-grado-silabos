import { librarySettingsBody, notificationSettingsBody, teacherAssistantSettingsBody } from "@silabos/shared/schemas/operationsApi"
import { createZodDto } from "nestjs-zod"

export class NotificationSettingsDto extends createZodDto(notificationSettingsBody) {}

export class LibrarySettingsDto extends createZodDto(librarySettingsBody) {}

export class TeacherAssistantSettingsDto extends createZodDto(teacherAssistantSettingsBody) {}
