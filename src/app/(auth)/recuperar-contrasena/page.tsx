"use client"

import { Send } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { requestPasswordRecovery } from "@/api/session"
import { InputError } from "@/components/InputError"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { applyApiErrors, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { paths } from "@/lib/routes"
import { recoveryLinkSchema, type RecoveryLinkValues } from "@/schemas/auth"

export default function PasswordRecoveryPage() {
  const form = useSchemaForm(recoveryLinkSchema, { defaultValues: { email: "" } })
  const { errors, isSubmitting: pending } = form.formState
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  const submit = async ({ email }: RecoveryLinkValues): Promise<void> => {
    try {
      setSentMessage((await requestPasswordRecovery(email.trim())).message)
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo solicitar el restablecimiento" })
    }
  }

  const error = serverMessage(errors)

  return (
    <AuthSplitLayout title="Recuperar contraseña" description="Ingrese su correo para recibir un enlace de restablecimiento">
      <div className="flex flex-col gap-6">
        {sentMessage ? (
          <div className="flex flex-col gap-4" role="status" data-test="password-recovery-sent">
            <FeedbackAlert variant="default" title="Solicitud enviada" message={sentMessage} />
            <p className="text-sm text-muted-foreground">Revise su bandeja de entrada y la carpeta de correo no deseado. El enlace tiene una vigencia limitada</p>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(submit)}>
            <Field data-invalid={Boolean(fieldMessage(errors, "email"))} className="gap-2">
              <Label htmlFor="recovery-email" required>Correo electrónico</Label>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Input {...field} id="recovery-email" type="email" autoComplete="username" spellCheck={false} maxLength={254} aria-required="true" placeholder="Ej. nombre@ueb.edu.ec" aria-invalid={fieldState.invalid} />
                )}
              />
              <InputError message={fieldMessage(errors, "email")} />
            </Field>
            {error ? <FeedbackAlert message={error} /> : null}
            <div className="my-6 flex items-center justify-start">
              <Button className="w-full" disabled={pending} type="submit" data-test="email-password-reset-link-button">
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
