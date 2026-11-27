import { aiReadPermissionBody } from "@silabos/shared/schemas/template"
import { createZodDto } from "nestjs-zod"

export class AiReadPermissionDto extends createZodDto(aiReadPermissionBody) {}
