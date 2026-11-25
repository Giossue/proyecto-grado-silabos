"use client"

import { UserCheck } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef } from "react"
import { Controller } from "react-hook-form"
import { activateAccount, logout } from "@/api/session"
import { InputError } from "@/components/InputError"
import { PasswordInput } from "@/components/PasswordInput"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useFormIncomplete } from "@/composables/useFormIncomplete"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { clearIntendedRoute } from "@/lib/intended-route"
import { applyApiErrors, fieldMessage, SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { paths } from "@/lib/routes"
import { newPasswordFormSchema, type NewPasswordFormValues } from "@/schemas/auth"
import { sessionState } from "@/state/session"

export default function ActivateAccountPage() {
  const router = useRouter()
  const tokens = useSearchParams().getAll("token")
  const token = tokens.length === 1 ? tokens[0] ?? "" : ""
  const form = useSchemaForm(newPasswordFormSchema, { defaultValues: { password: "", password_confirmation: "" } })
  const { errors, isSubmitting: pending } = form.formState
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)

  const submit = async ({ password, password_confirmation }: NewPasswordFormValues): Promise<void> => {
    if (!token) {
      form.setError(SERVER_ERROR, { type: "client", message: "El enlace de activación está incompleto" })
      return
    }
    try {
      const result = await activateAccount(token, password, password_confirmation)
      if (sessionState.current.value) {
        await logout().catch(() => undefined)
        sessionState.clear()
      }
      clearIntendedRoute()
      router.replace(`${paths.login}?status=${encodeURIComponent(result.message)}`)
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo activar la cuenta" })
    }
  }

  const error = serverMessage(errors)

  return (
    <AuthSplitLayout title="Activar cuenta" description="Verifique su correo y defina una contraseña para ingresar al sistema">
      <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
        <div className="grid gap-2">
          <Label htmlFor="activation-password" required>Contraseña</Label>
          <Controller
            name="password"
            control={form.control}
            render={({ field: { onChange, ...field }, fieldState }) => (
              <PasswordInput {...field} id="activation-password" onValueChange={onChange} autoComplete="new-password" aria-required="true" aria-invalid={fieldState.invalid} />
            )}
          />
          <InputError message={fieldMessage(errors, "password")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activation-password-confirmation" required>Confirmar contraseña</Label>
          <Controller
            name="password_confirmation"
            control={form.control}
            render={({ field: { onChange, ...field }, fieldState }) => (
              <PasswordInput {...field} id="activation-password-confirmation" onValueChange={onChange} autoComplete="new-password" aria-required="true" aria-invalid={fieldState.invalid} />
            )}
          />
          <InputError message={fieldMessage(errors, "password_confirmation")} />
        </div>
        {error ? <FeedbackAlert message={error} /> : null}
        <InputError message={fieldMessage(errors, "token")} />
        <Button ref={submitButton} type="submit" className="w-full" disabled={pending || !token || incomplete}>
          {pending ? <Spinner data-icon="inline-start" /> : <UserCheck data-icon="inline-start" aria-hidden="true" />}
          Activar cuenta
        </Button>
      </form>
    </AuthSplitLayout>
  )
}
