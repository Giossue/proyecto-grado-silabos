import { z } from "zod"
import { messages } from "./messages"
import { codePointLength, requiredText } from "./rules"

export const MISSING_CODE = "Ingrese un código de autenticación o de recuperación."
export const WRONG_PASSWORD = "La contraseña actual no es correcta."

const optionalCode = (label: string, max: number) =>
  z
    .custom<string | null | undefined>()
    .optional()
    .superRefine((value, context) => {
      if (value === undefined || value === null) return
      if (typeof value !== "string") context.addIssue({ code: "custom", message: messages.string(label) })
      if (codePointLength(String(value)) > max) context.addIssue({ code: "custom", message: messages.max(label, max) })
    })

function filled(value: unknown): boolean {
  if (typeof value === "boolean" || (typeof value === "object" && value !== null)) return true
  return value !== undefined && value !== null && String(value).trim() !== ""
}

const codes = {
  code: optionalCode("código", 32),
  recovery_code: optionalCode("código de recuperación", 128),
}

type WithCodes = { code?: unknown; recovery_code?: unknown }

const requireOneCode = <T extends z.ZodType<WithCodes>>(schema: T, required: boolean) =>
  schema.refine((data) => !required || filled(data.code) || filled(data.recovery_code), { path: ["code"], message: MISSING_CODE, when: () => true })

export const twoFactorChallengeSchema = requireOneCode(z.object(codes), true)

export type TwoFactorChallengeValues = z.input<typeof twoFactorChallengeSchema>

export function currentPasswordField(matches = true) {
  return requiredText(messages.required("contraseña actual"), messages.string("contraseña actual")).refine(() => matches, { message: WRONG_PASSWORD })
}

export function passwordConfirmationSchema(matches?: boolean) {
  return z.object({ current_password: currentPasswordField(matches) })
}

export type PasswordConfirmationValues = z.input<ReturnType<typeof passwordConfirmationSchema>>

export const twoFactorConfirmationSchema = z.object({
  code: requiredText(messages.required("código"), messages.string("código")).refine((value) => codePointLength(value) <= 32, { message: messages.max("código", 32) }),
})

export type TwoFactorConfirmationValues = z.input<typeof twoFactorConfirmationSchema>

export function twoFactorDisableSchema(options: { matches?: boolean; requireCode: boolean }) {
  return requireOneCode(z.object({ current_password: currentPasswordField(options.matches), ...codes }), options.requireCode)
}

export type TwoFactorDisableValues = z.input<ReturnType<typeof twoFactorDisableSchema>>
