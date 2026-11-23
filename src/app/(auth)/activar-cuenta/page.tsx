"use client"

import { UserCheck } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
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
import { paths } from "@/lib/routes"
import { sessionState } from "@/state/session"

export default function ActivateAccountPage() {
  const router = useRouter()
  const tokens = useSearchParams().getAll("token")
  const token = tokens.length === 1 ? tokens[0] ?? "" : ""
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!token) {
      setError("El enlace de activación está incompleto")
      return
    }
    setPending(true)
    setError(null)
    setErrors({})
    try {
      const result = await activateAccount(token, password, passwordConfirmation)
      if (sessionState.current.value) {
        await logout().catch(() => undefined)
        sessionState.clear()
      }
      clearIntendedRoute()
      router.replace(`${paths.login}?status=${encodeURIComponent(result.message)}`)
    } catch (reason) {
      if (reason instanceof ApiError) {
        setErrors(reason.errors)
        setError(reason.message)
      } else {
        setError("No se pudo activar la cuenta")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthSplitLayout title="Activar cuenta" description="Verifique su correo y defina una contraseña para ingresar al sistema">
      <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
        <div className="grid gap-2">
          <Label htmlFor="activation-password" required>Contraseña</Label>
          <PasswordInput id="activation-password" value={password} onValueChange={setPassword} autoComplete="new-password" aria-required="true" aria-invalid={Boolean(errors.password)} />
          <InputError message={errors.password?.[0]} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activation-password-confirmation" required>Confirmar contraseña</Label>
          <PasswordInput id="activation-password-confirmation" value={passwordConfirmation} onValueChange={setPasswordConfirmation} autoComplete="new-password" aria-required="true" aria-invalid={Boolean(errors.password_confirmation)} />
          <InputError message={errors.password_confirmation?.[0]} />
        </div>
        {error && Object.keys(errors).length === 0 ? <FeedbackAlert message={error} /> : null}
        <InputError message={errors.token?.[0]} />
        <Button ref={submitButton} type="submit" className="w-full" disabled={pending || !token || incomplete}>
          {pending ? <Spinner data-icon="inline-start" /> : <UserCheck data-icon="inline-start" aria-hidden="true" />}
          Activar cuenta
        </Button>
      </form>
    </AuthSplitLayout>
  )
}
