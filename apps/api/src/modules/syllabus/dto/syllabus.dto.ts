import { signatureSchema } from "@silabos/shared/schemas/signature"
import { changeRequestSchema, convocationSchema, draftFieldSchema, idempotencySchema, lockVersionSchema, submissionSchema } from "@silabos/shared/schemas/syllabus"
import { createZodDto } from "nestjs-zod"

export class ConvocationDto extends createZodDto(convocationSchema()) {}
export class ChangeRequestDto extends createZodDto(changeRequestSchema) {}
export class SignatureDto extends createZodDto(signatureSchema) {}
export class LockVersionDto extends createZodDto(lockVersionSchema) {}
export class DraftFieldDto extends createZodDto(draftFieldSchema) {}
export class SubmissionDto extends createZodDto(submissionSchema) {}
export class IdempotencyDto extends createZodDto(idempotencySchema) {}
