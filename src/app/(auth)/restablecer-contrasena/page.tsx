"use client"

import { KeyRound } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Controller } from "react-hook-form"
import { resetForgottenPassword } from "@/api/session"
import { InputError } from "@/components/InputError"
import { PasswordInput } from "@/components/PasswordInput"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { applyApiErrors, fieldMessage, SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { paths } from "@/lib/routes"
import { newPasswordFormSchema, type NewPasswordFormValues } from "@/schemas/auth"
import { sessionState } from "@/state/session"

const singleValue = (values: string[]): string => (values.length === 1 ? values[0] ?? "" : "")

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = singleValue(searchParams.getAll("email"))
  const token = singleValue(searchParams.getAll("token"))
  const form = useSchemaForm(newPasswordFormSchema, { defaultValues: { password: "", password_confirmation: "" } })
  const { errors, isSubmitting: pending } = form.formState

  const submit = async ({ password, password_confirmation }: NewPasswordFormValues): Promise<void> => {
    if (!email || !token) {
      form.setError(SERVER_ERROR, { type: "client", message: "El enlace de recuperación está incompleto" })
      return
    }
    try {
      const result = await resetForgottenPassword(email, token, password, password_confirmation)
      form.reset()
      sessionState.clear()
      router.replace(`${paths.login}?status=${encodeURIComponent(result.message)}`)
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo restablecer la contraseña" })
    }
  }

  const error = serverMessage(errors)

  return (
    <AuthSplitLayout title="Restablecer contraseña" description="Ingrese su nueva contraseña">
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="grid gap-6">
          <Field data-invalid={Boolean(fieldMessage(errors, "email"))} className="gap-2">
            <Label htmlFor="reset-email" required>Correo electrónico</Label>
            <Input id="reset-email" type="email" value={email} autoComplete="username" spellCheck={false} className="mt-1 block w-full" placeholder="Ej. nombre@ueb.edu.ec" readOnly aria-required="true" />
            <InputError message={fieldMessage(errors, "email")} className="mt-2" />
          </Field>
          <Field data-invalid={Boolean(fieldMessage(errors, "password"))} className="gap-2">
            <Label htmlFor="new-password" required>Contraseña nueva</Label>
            <Controller
              name="password"
              control={form.control}
              render={({ field: { onChange, ...field }, fieldState }) => (
                <PasswordInput {...field} id="new-password" onValueChange={onChange} aria-required="true" autoComplete="new-password" className="mt-1 block w-full" placeholder="Contraseña nueva" aria-invalid={fieldState.invalid} />
              )}
            />
            <InputError message={fieldMessage(errors, "password")} />
          </Field>
          <Field data-invalid={Boolean(fieldMessage(errors, "password_confirmation"))} className="gap-2">
            <Label htmlFor="new-password-confirmation" required>Confirmar contraseña</Label>
            <Controller
              name="password_confirmation"
              control={form.control}
              render={({ field: { onChange, ...field }, fieldState }) => (
                <PasswordInput {...field} id="new-password-confirmation" onValueChange={onChange} aria-required="true" autoComplete="new-password" className="mt-1 block w-full" placeholder="Confirmar contraseña" aria-invalid={fieldState.invalid} />
              )}
            />
            <InputError message={fieldMessage(errors, "password_confirmation")} />
          </Field>
          {error ? <FeedbackAlert message={error} /> : null}
          <Button type="submit" className="mt-4 w-full" disabled={pending || !email || !token} data-test="reset-password-button">
            {pending ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" aria-hidden="true" />}
            Restablecer contraseña
          </Button>
        </div>
      </form>
    </AuthSplitLayout>
  )
}
