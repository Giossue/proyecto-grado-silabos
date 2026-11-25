import { emailPreferencesSchema } from "@silabos/shared/schemas/notifications"
import { createZodDto } from "nestjs-zod"
import { validationContextValue } from "../../../common/context/validation-context"
import { EMAIL_NOTICE_TYPES } from "../email-notice-scope.interceptor"

export class EmailPreferencesDto extends createZodDto(emailPreferencesSchema(() => validationContextValue<string[]>(EMAIL_NOTICE_TYPES) ?? null)) {}
