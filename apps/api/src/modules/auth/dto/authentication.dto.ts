import { accessibilitySchema, profileSchema, teacherFormationSchema } from "@silabos/shared/schemas/account"
import { accountActivationSchema, activeRoleSchema, loginSchema, passwordResetSchema, passwordUpdateSchema, recoveryLinkSchema } from "@silabos/shared/schemas/auth"
import { passwordConfirmationSchema, twoFactorChallengeSchema, twoFactorConfirmationSchema, twoFactorDisableSchema } from "@silabos/shared/schemas/twoFactor"
import { createZodDto } from "nestjs-zod"
import { documented } from "./documented"

export class LoginDto extends createZodDto(documented(loginSchema)) {}

export class ActiveRoleDto extends createZodDto(documented(activeRoleSchema)) {}

export class RecoveryLinkDto extends createZodDto(documented(recoveryLinkSchema)) {}

export class PasswordResetDto extends createZodDto(documented(passwordResetSchema())) {}

export class AccountActivationDto extends createZodDto(documented(accountActivationSchema())) {}

export class PasswordUpdateDto extends createZodDto(documented(passwordUpdateSchema())) {}

export class ProfileDto extends createZodDto(documented(profileSchema())) {}

export class AccessibilityDto extends createZodDto(documented(accessibilitySchema)) {}

export class TeacherFormationDto extends createZodDto(documented(teacherFormationSchema)) {}

export class PasswordConfirmationDto extends createZodDto(documented(passwordConfirmationSchema())) {}

export class TwoFactorConfirmationDto extends createZodDto(documented(twoFactorConfirmationSchema)) {}

export class TwoFactorChallengeDto extends createZodDto(documented(twoFactorChallengeSchema)) {}

export class TwoFactorDisableDto extends createZodDto(documented(twoFactorDisableSchema({ requireCode: false }))) {}
