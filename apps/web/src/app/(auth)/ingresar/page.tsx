"use client"

import { LogIn } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect} from "react"
import { Controller } from "react-hook-form"
import { login } from "@/api/session"
import { PasswordInput } from "@/components/PasswordInput"
import { TextLink } from "@/components/TextLink"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { consumeIntendedRoute } from "@/lib/intended-route"
import { paths, roleEntry } from "@/lib/routes"
import { applyApiErrors, errorMessages, serverMessage, useSchemaForm } from "@/lib/forms"
import { toast } from "@/lib/toast"
import { loginSchema, type LoginValues } from "@silabos/shared/schemas/auth"
import { sessionState } from "@/state/session"

export default function LoginPage() {
  const router = useRouter()
  const statusValues = useSearchParams().getAll("status")
  const status = statusValues.length === 1 ? statusValues[0] : null
  const form = useSchemaForm(loginSchema, { defaultValues: { email: "", password: "" } })
  const { errors, isSubmitting: processing } = form.formState

  useEffect(() => {
    if (status) toast.success(status)
  }, [status])

  const submit = async ({ email, password }: LoginValues): Promise<void> => {
    try {
      const result = await login(email, password)
      if ("two_factor_required" in result) {
        router.replace(paths.twoFactorChallenge)
        return
      }
      sessionState.replace(result)
      router.replace(consumeIntendedRoute() ?? roleEntry(result.active_role?.code))
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo iniciar sesión", aliases: { correo_electronico: "email" } })
    }
  }

  const error = serverMessage(errors)

  return (
    <AuthSplitLayout title="Iniciar sesión">
      {error ? <FeedbackAlert message={error} appearance="plain" /> : null}
      <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit)}>
        <FieldGroup>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email" required>Correo institucional</FieldLabel>
                <Input {...field} id="email" type="email" aria-required="true" autoComplete="username" spellCheck={false} placeholder="Ej. nombre@ueb.edu.ec" aria-invalid={fieldState.invalid} />
                <FieldError errors={errorMessages(fieldState.error)} />
              </Field>
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field: { onChange, ...field }, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password" required>Contraseña</FieldLabel>
                  <TextLink href={paths.passwordRecovery} className="text-sm">¿Olvidó su contraseña?</TextLink>
                </div>
                <PasswordInput {...field} id="password" onValueChange={onChange} aria-required="true" autoComplete="current-password" placeholder="Contraseña" aria-invalid={fieldState.invalid} />
                <FieldError errors={errorMessages(fieldState.error)} />
              </Field>
            )}
          />
          <Button type="submit" className="mt-4 w-full" disabled={processing} data-test="login-button">
            {processing ? <Spinner data-icon="inline-start" /> : <LogIn data-icon="inline-start" aria-hidden="true" />}
            Ingresar
          </Button>
        </FieldGroup>
      </form>
    </AuthSplitLayout>
  )
}
