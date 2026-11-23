"use client"

import { KeyRound } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { resetForgottenPassword } from "@/api/session"
import { InputError } from "@/components/InputError"
import { PasswordInput } from "@/components/PasswordInput"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useFormIncomplete } from "@/composables/useFormIncomplete"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { paths } from "@/lib/routes"
import { sessionState } from "@/state/session"

const singleValue = (values: string[]): string => (values.length === 1 ? values[0] ?? "" : "")

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = singleValue(searchParams.getAll("email"))
  const token = singleValue(searchParams.getAll("token"))
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!email || !token) {
      setError("El enlace de recuperación está incompleto")
      return
    }
    setPending(true)
    setError(null)
    setErrors({})
    try {
      const result = await resetForgottenPassword(email, token, password, passwordConfirmation)
      setPassword("")
      setPasswordConfirmation("")
      sessionState.clear()
      router.replace(`${paths.login}?status=${encodeURIComponent(result.message)}`)
    } catch (reason) {
      if (reason instanceof ApiError) {
        setErrors(reason.errors)
        setError(reason.message)
      } else {
        setError("No se pudo restablecer la contraseña")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthSplitLayout title="Restablecer contraseña" description="Ingrese su nueva contraseña">
      <form onSubmit={(event) => void submit(event)}>
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="reset-email" required>Correo electrónico</Label>
            <Input id="reset-email" type="email" value={email} autoComplete="email" className="mt-1 block w-full" placeholder="Ej. nombre@ueb.edu.ec" readOnly aria-required="true" />
            <InputError message={errors.email?.[0]} className="mt-2" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password" required>Contraseña nueva</Label>
            <PasswordInput id="new-password" value={password} onValueChange={setPassword} aria-required="true" autoComplete="new-password" className="mt-1 block w-full" placeholder="Contraseña nueva" aria-invalid={Boolean(errors.password)} />
            <InputError message={errors.password?.[0]} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password-confirmation" required>Confirmar contraseña</Label>
            <PasswordInput id="new-password-confirmation" value={passwordConfirmation} onValueChange={setPasswordConfirmation} aria-required="true" autoComplete="new-password" className="mt-1 block w-full" placeholder="Confirmar contraseña" aria-invalid={Boolean(errors.password_confirmation)} />
            <InputError message={errors.password_confirmation?.[0]} />
          </div>
          {error && Object.keys(errors).length === 0 ? <FeedbackAlert message={error} /> : null}
          <Button ref={submitButton} type="submit" className="mt-4 w-full" disabled={pending || !email || !token || incomplete} data-test="reset-password-button">
            {pending ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" aria-hidden="true" />}
            Restablecer contraseña
          </Button>
        </div>
      </form>
    </AuthSplitLayout>
  )
}
