"use client"

import { ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { completeTwoFactorLogin } from "@/api/session"
import { InputError } from "@/components/InputError"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { useFormIncomplete } from "@/composables/useFormIncomplete"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { consumeIntendedRoute } from "@/lib/intended-route"
import { roleEntry } from "@/lib/routes"
import { sessionState } from "@/state/session"

const authenticationContent = {
  title: "Código de autenticación",
  description: "Ingrese el código proporcionado por su aplicación de autenticación",
  buttonText: "usar un código de recuperación",
}

const recoveryContent = {
  title: "Código de recuperación",
  description: "Confirme el acceso con uno de sus códigos de recuperación",
  buttonText: "usar un código de autenticación",
}

export default function TwoFactorChallengePage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [showRecoveryInput, setShowRecoveryInput] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)
  const content = showRecoveryInput ? recoveryContent : authenticationContent

  const toggleMode = (): void => {
    setShowRecoveryInput((current) => !current)
    setCode("")
    setError(null)
    setErrors({})
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setErrors({})
    try {
      await completeTwoFactorLogin(showRecoveryInput ? "" : code, showRecoveryInput ? code : "")
      const session = await sessionState.load(true)
      router.replace(consumeIntendedRoute() ?? roleEntry(session?.active_role?.code))
    } catch (reason) {
      if (reason instanceof ApiError) {
        setErrors(reason.errors)
        setError(reason.message)
      } else {
        setError("No se pudo verificar el código")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthSplitLayout title={content.title} description={content.description}>
      <div className="flex flex-col gap-6">
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          {!showRecoveryInput ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <Label htmlFor="otp" required>Código de autenticación</Label>
              <div className="flex w-full items-center justify-center">
                <InputOTP id="otp" value={code} onChange={setCode} maxLength={6} disabled={pending} aria-required="true" aria-label="Código de autenticación de seis dígitos">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot key={index} index={index} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <InputError message={errors.code?.[0]} />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="recovery-code" required>Código de recuperación</Label>
              <Input id="recovery-code" value={code} type="text" autoComplete="one-time-code" placeholder="Ej. ABCD-EFGH" aria-required="true" disabled={pending} onChange={(event) => setCode(event.target.value)} />
              <InputError message={errors.recovery_code?.[0]} />
            </div>
          )}
          {error && Object.keys(errors).length === 0 ? <FeedbackAlert message={error} /> : null}
          <Button ref={submitButton} type="submit" className="w-full" disabled={pending || !code || incomplete}>
            <ShieldCheck data-icon="inline-start" aria-hidden="true" />
            Continuar
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            <span>También puede </span>
            <Button type="button" variant="link" className="h-auto p-0 text-foreground underline decoration-border underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current" onClick={toggleMode}>{content.buttonText}</Button>
          </div>
        </form>
      </div>
    </AuthSplitLayout>
  )
}
