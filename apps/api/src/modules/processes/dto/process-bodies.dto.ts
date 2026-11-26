import { deadlineExtensionBody, processCreationBody, redoConfirmationBody } from "@silabos/shared/schemas/operationsApi"
import { createZodDto } from "nestjs-zod"

export class ProcessCreationDto extends createZodDto(processCreationBody) {}

export class RedoConfirmationDto extends createZodDto(redoConfirmationBody) {}

export class DeadlineExtensionDto extends createZodDto(deadlineExtensionBody) {}
