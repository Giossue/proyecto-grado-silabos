import { profileSchema } from "@silabos/shared/schemas/account"
import { accountActivationSchema, activeRoleSchema, loginSchema, passwordResetSchema, recoveryLinkSchema } from "@silabos/shared/schemas/auth"
import { createZodDto } from "nestjs-zod"
import { documented } from "./documented"

export class LoginDto extends createZodDto(documented(loginSchema)) {}

export class ActiveRoleDto extends createZodDto(documented(activeRoleSchema)) {}

export class RecoveryLinkDto extends createZodDto(documented(recoveryLinkSchema)) {}

export class PasswordResetDto extends createZodDto(documented(passwordResetSchema())) {}

export class AccountActivationDto extends createZodDto(documented(accountActivationSchema())) {}

export class ProfileDto extends createZodDto(documented(profileSchema())) {}
