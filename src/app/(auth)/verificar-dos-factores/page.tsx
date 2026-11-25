"use client"

import { ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { Controller } from "react-hook-form"
import { completeTwoFactorLogin } from "@/api/session"
import { InputError } from "@/components/InputError"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { useFormIncomplete } from "@/composables/useFormIncomplete"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { applyApiErrors, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { consumeIntendedRoute } from "@/lib/intended-route"
import { roleEntry } from "@/lib/routes"
import { twoFactorChallengeSchema, type TwoFactorChallengeValues } from "@/schemas/twoFactor"
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
  const [showRecoveryInput, setShowRecoveryInput] = useState(false)
  const form = useSchemaForm(twoFactorChallengeSchema, { defaultValues: { code: "", recovery_code: "" } })
  const { errors, isSubmitting: pending } = form.formState
  const code = form.watch(showRecoveryInput ? "recovery_code" : "code")
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)
  const content = showRecoveryInput ? recoveryContent : authenticationContent

  const toggleMode = (): void => {
    setShowRecoveryInput((current) => !current)
    form.reset()
  }

  const submit = async (values: TwoFactorChallengeValues): Promise<void> => {
    try {
      await completeTwoFactorLogin(showRecoveryInput ? "" : (values.code ?? ""), showRecoveryInput ? (values.recovery_code ?? "") : "")
      const session = await sessionState.load(true)
      router.replace(consumeIntendedRoute() ?? roleEntry(session?.active_role?.code))
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo verificar el código" })
    }
  }

  const error = serverMessage(errors)

  return (
    <AuthSplitLayout title={content.title} description={content.description}>
      <div className="flex flex-col gap-6">
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          {!showRecoveryInput ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <Label htmlFor="otp" required>Código de autenticación</Label>
              <div className="flex w-full items-center justify-center">
                <Controller
                  name="code"
                  control={form.control}
                  render={({ field }) => (
                    <InputOTP id="otp" ref={field.ref} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} maxLength={6} disabled={pending} aria-required="true" aria-label="Código de autenticación de seis dígitos">
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot key={index} index={index} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  )}
                />
              </div>
              <InputError message={fieldMessage(errors, "code")} />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="recovery-code" required>Código de recuperación</Label>
              <Controller
                name="recovery_code"
                control={form.control}
                render={({ field }) => (
                  <Input {...field} value={field.value ?? ""} id="recovery-code" type="text" autoComplete="one-time-code" placeholder="Ej. ABCD-EFGH" aria-required="true" disabled={pending} />
                )}
              />
              <InputError message={fieldMessage(errors, "recovery_code")} />
            </div>
          )}
          {error ? <FeedbackAlert message={error} /> : null}
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
