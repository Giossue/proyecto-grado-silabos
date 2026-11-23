"use client"

import { LogIn } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { login } from "@/api/session"
import { PasswordInput } from "@/components/PasswordInput"
import { TextLink } from "@/components/TextLink"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useFormIncomplete } from "@/composables/useFormIncomplete"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { consumeIntendedRoute } from "@/lib/intended-route"
import { paths, roleEntry } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { sessionState } from "@/state/session"

export default function LoginPage() {
  const router = useRouter()
  const statusValues = useSearchParams().getAll("status")
  const status = statusValues.length === 1 ? statusValues[0] : null
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)

  useEffect(() => {
    if (status) toast.success(status)
  }, [status])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setProcessing(true)
    setError(null)
    setErrors({})
    try {
      const result = await login(email, password, remember)
      if ("two_factor_required" in result) {
        router.replace(paths.twoFactorChallenge)
        return
      }
      sessionState.replace(result)
      router.replace(consumeIntendedRoute() ?? roleEntry(result.active_role?.code))
    } catch (reason) {
      if (reason instanceof ApiError) {
        setErrors(reason.errors)
        setError(reason.message)
      } else {
        setError("No se pudo iniciar sesión")
      }
    } finally {
      setProcessing(false)
    }
  }

  const emailErrors = errors.email ?? errors.correo_electronico

  return (
    <AuthSplitLayout title="Iniciar sesión">
      {error && Object.keys(errors).length === 0 ? <FeedbackAlert message={error} appearance="plain" /> : null}
      <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(emailErrors)}>
            <FieldLabel htmlFor="email" required>Correo institucional</FieldLabel>
            <Input id="email" value={email} type="email" name="email" aria-required="true" autoComplete="email" placeholder="Ej. nombre@ueb.edu.ec" aria-invalid={Boolean(emailErrors)} onChange={(event) => setEmail(event.target.value)} />
            <FieldError errors={emailErrors} />
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password" required>Contraseña</FieldLabel>
              <TextLink href={paths.passwordRecovery} className="text-sm">¿Olvidó su contraseña?</TextLink>
            </div>
            <PasswordInput id="password" value={password} onValueChange={setPassword} name="password" aria-required="true" autoComplete="current-password" placeholder="Contraseña" aria-invalid={Boolean(errors.password)} />
            <FieldError errors={errors.password} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="remember" checked={remember} onCheckedChange={(value) => setRemember(value === true)} />
            <FieldLabel htmlFor="remember" className="font-normal">Mantener la sesión iniciada</FieldLabel>
          </Field>
          <Button ref={submitButton} type="submit" className="mt-4 w-full" disabled={processing || incomplete} data-test="login-button">
            {processing ? <Spinner data-icon="inline-start" /> : <LogIn data-icon="inline-start" aria-hidden="true" />}
            Ingresar
          </Button>
        </FieldGroup>
      </form>
    </AuthSplitLayout>
  )
}
