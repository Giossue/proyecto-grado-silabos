import { z } from "zod"
import { filterEmailShape } from "./email"
import { messages } from "./messages"
import { confirmedPassword, passwordConfirmation, passwordField, type PasswordStrength } from "./password"
import { codePointLength, isBlank, requiredText, requiredUuid, requiredValue } from "./rules"

const INVALID_EMAIL = "El campo correo electrónico debe ser un correo electrónico válido."

export const loginSchema = z.object({
  email: requiredText("Ingrese su correo electrónico.", "Ingrese un correo electrónico válido.").refine((value) => filterEmailShape(value.trim()) === "valid", {
    message: "Ingrese un correo electrónico válido.",
  }),
  password: requiredText("Ingrese su contraseña.", messages.string("contraseña")),
})

export type LoginValues = z.input<typeof loginSchema>

export const activeRoleSchema = z.object({
  role_assignment_id: requiredUuid("Seleccione un rol.", "El rol seleccionado no es válido."),
})

export const recoveryLinkSchema = z.object({
  email: requiredValue(messages.required("correo electrónico")).superRefine((value, context) => {
    if (typeof value !== "string") context.addIssue({ code: "custom", message: messages.string("correo electrónico") })
    else if (codePointLength(value.trim()) > 254) context.addIssue({ code: "custom", message: messages.max("correo electrónico", 254) })
    if (filterEmailShape(typeof value === "string" ? value.trim() : value) !== "valid") context.addIssue({ code: "custom", message: INVALID_EMAIL })
  }),
})

export type RecoveryLinkValues = z.input<typeof recoveryLinkSchema>

const resetEmail = z
  .string({ error: (issue) => (issue.input === undefined || issue.input === null ? messages.required("correo electrónico") : INVALID_EMAIL) })
  .refine((value) => value.trim() !== "", { message: messages.required("correo electrónico"), abort: true })
  .refine((value) => filterEmailShape(value) === "valid", { message: INVALID_EMAIL })

export function passwordResetSchema(strength?: PasswordStrength) {
  return confirmedPassword(
    z.object({
      email: resetEmail,
      token: requiredText(messages.required("enlace de activación"), messages.string("enlace de activación")),
      password: passwordField("contraseña", strength),
      password_confirmation: passwordConfirmation,
    }),
  )
}

export type PasswordResetValues = z.input<ReturnType<typeof passwordResetSchema>>

export function accountActivationSchema(strength?: PasswordStrength) {
  return confirmedPassword(
    z.object({
      token: requiredText(messages.required("enlace de activación"), messages.string("enlace de activación")).max(128, messages.max("enlace de activación", 128)),
      password: passwordField("contraseña", strength),
      password_confirmation: passwordConfirmation,
    }),
  )
}

export type AccountActivationValues = z.input<ReturnType<typeof accountActivationSchema>>

export function passwordUpdateSchema(options: { strength?: PasswordStrength; currentMatches?: boolean } = {}) {
  return confirmedPassword(
    z.object({
      current_password: requiredText(messages.required("contraseña actual"), messages.string("contraseña actual")).refine(() => options.currentMatches ?? true, {
        message: "La contraseña es incorrecta.",
      }),
      password: passwordField("contraseña", options.strength),
      password_confirmation: passwordConfirmation,
    }),
  ).refine((data) => data.current_password !== undefined && data.current_password !== data.password, {
    path: ["password"],
    message: "La contraseña nueva debe ser distinta de la actual.",
    when: (payload) => {
      const value = payload.value as { password?: unknown } | undefined
      return typeof value === "object" && value !== null && !isBlank(value.password)
    },
  })
}

export type PasswordUpdateValues = z.input<ReturnType<typeof passwordUpdateSchema>>

export const newPasswordFormSchema = z.object({
  password: passwordField("contraseña"),
  password_confirmation: z.string(),
})

export type NewPasswordFormValues = z.input<typeof newPasswordFormSchema>

export const passwordChangeFormSchema = z.object({
  current_password: requiredText(messages.required("contraseña actual"), messages.string("contraseña actual")),
  password: passwordField("contraseña"),
  password_confirmation: z.string(),
})

export type PasswordChangeFormValues = z.input<typeof passwordChangeFormSchema>
