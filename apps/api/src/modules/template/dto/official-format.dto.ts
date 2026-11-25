import { officialFormatSchema } from "@silabos/shared/schemas/template"
import { createZodDto } from "nestjs-zod"

export class OfficialFormatDto extends createZodDto(officialFormatSchema) {}
