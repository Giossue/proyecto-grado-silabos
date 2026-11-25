import { z } from "zod"
import { messages } from "./messages"
import { isBlank, requiredText } from "./rules"

export const PASSWORD_CONFIRMATION_MESSAGE = "La confirmación de contraseña no coincide."

export type PasswordStrength = (value: string) => string[] | Promise<string[]>

export function passwordField(label: string, strength?: PasswordStrength) {
  const base = requiredText(messages.required(label), messages.string(label))
  if (strength === undefined) return base
  return base.superRefine(async (value, context) => {
    for (const message of await strength(value)) context.addIssue({ code: "custom", message })
  })
}

export const passwordConfirmation = z.custom<string | null>().optional()

type WithPassword = { password?: unknown; password_confirmation?: unknown }

export function confirmedPassword<T extends z.ZodType<WithPassword>>(schema: T) {
  return schema.refine((data) => data.password_confirmation === data.password, {
    path: ["password"],
    message: PASSWORD_CONFIRMATION_MESSAGE,
    when: (payload) => {
      const value = payload.value as WithPassword | undefined
      return typeof value === "object" && value !== null && !isBlank(value.password)
    },
  })
}
