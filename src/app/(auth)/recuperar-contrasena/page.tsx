"use client"

import { Send } from "lucide-react"
import Link from "next/link"
import { useRef, useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { requestPasswordRecovery } from "@/api/session"
import { InputError } from "@/components/InputError"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useFormIncomplete } from "@/composables/useFormIncomplete"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { paths } from "@/lib/routes"

export default function PasswordRecoveryPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const submitButton = useRef<HTMLButtonElement | null>(null)
  const incomplete = useFormIncomplete(submitButton)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setErrors({})
    try {
      setSentMessage((await requestPasswordRecovery(email.trim())).message)
    } catch (reason) {
      if (reason instanceof ApiError) {
        setErrors(reason.errors)
        setError(reason.message)
      } else {
        setError("No se pudo solicitar el restablecimiento")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthSplitLayout title="Recuperar contraseña" description="Ingrese su correo para recibir un enlace de restablecimiento">
      <div className="flex flex-col gap-6">
        {sentMessage ? (
          <div className="flex flex-col gap-4" role="status" data-test="password-recovery-sent">
            <FeedbackAlert variant="default" title="Solicitud enviada" message={sentMessage} />
            <p className="text-sm text-muted-foreground">Revise su bandeja de entrada y la carpeta de correo no deseado. El enlace tiene una vigencia limitada</p>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <div className="grid gap-2">
              <Label htmlFor="recovery-email" required>Correo electrónico</Label>
              <Input id="recovery-email" value={email} type="email" autoComplete="off" maxLength={254} aria-required="true" placeholder="Ej. nombre@ueb.edu.ec" aria-invalid={Boolean(errors.email)} onChange={(event) => setEmail(event.target.value)} />
              <InputError message={errors.email?.[0]} />
            </div>
            {error && Object.keys(errors).length === 0 ? <FeedbackAlert message={error} /> : null}
            <div className="my-6 flex items-center justify-start">
              <Button ref={submitButton} className="w-full" disabled={pending || incomplete} type="submit" data-test="email-password-reset-link-button">
                {pending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden="true" />}
                Enviar enlace de restablecimiento
              </Button>
            </div>
          </form>
        )}
        <div className="flex items-center justify-center gap-1 text-center text-sm text-muted-foreground">
          <span>{sentMessage ? "Vuelva a" : "O vuelva a"}</span>
          <Link href={paths.login} className="text-foreground underline decoration-border underline-offset-4 hover:decoration-current">iniciar sesión</Link>
        </div>
      </div>
    </AuthSplitLayout>
  )
}
