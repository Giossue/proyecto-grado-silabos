import { createZodDto } from "nestjs-zod"
import { z } from "zod"

export class MessageDto extends createZodDto(z.object({ message: z.string() })) {}

export class ValidationErrorDto extends createZodDto(z.object({ message: z.string(), errors: z.record(z.string(), z.array(z.string())) })) {}
