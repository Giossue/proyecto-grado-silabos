import { signatureSchema } from "@silabos/shared/schemas/signature"
import { createZodDto } from "nestjs-zod"

export class LibrarySignatureDto extends createZodDto(signatureSchema) {}
