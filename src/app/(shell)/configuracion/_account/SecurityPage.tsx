"use client"

import { KeyRound, Mail, MonitorSmartphone, Save, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { requestPasswordRecovery, updatePassword } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { SettingsAccordionSection } from "@/components/domain/SettingsAccordionSection"
import { Heading } from "@/components/Heading"
import { InputError } from "@/components/InputError"
import { ManageTwoFactor } from "@/components/ManageTwoFactor"
import { OtherSessions } from "@/components/OtherSessions"
import { PasswordInput } from "@/components/PasswordInput"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { toast } from "@/lib/toast"
import { sessionState, useSession } from "@/state/session"

export default function SecurityPage() {
  const email = useSession().session?.user.email
  const [loading, setLoading] = useState(true)
  const [openSection, setOpenSection] = useState("contrasena")
  const [currentPassword, setCurrentPassword] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoveryProcessing, setRecoveryProcessing] = useState(false)

  const openPasswordDialog = (): void => {
    setCurrentPassword("")
    setPassword("")
    setPasswordConfirmation("")
    setErrors({})
    setPasswordOpen(true)
  }

  const openRecoveryDialog = (): void => {
    setRecoveryError(null)
    setRecoveryOpen(true)
  }

  const sendRecoveryLink = async (): Promise<void> => {
    const account = sessionState.current.value?.user.email
    if (!account) return
    setRecoveryProcessing(true)
    setRecoveryError(null)
    try {
      await requestPasswordRecovery(account)
      setRecoveryOpen(false)
      toast.success("Enlace enviado. Revise su correo")
    } catch (reason) {
      setRecoveryError(
        reason instanceof ApiError && reason.status === 429
          ? "Se alcanzó el máximo de envíos. Intente de nuevo más tarde"
          : reason instanceof ApiError
            ? reason.message
            : "No se pudo enviar el enlace",
      )
    } finally {
      setRecoveryProcessing(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setProcessing(true)
    setErrors({})
    try {
      sessionState.replace(await updatePassword(password, passwordConfirmation, currentPassword))
      setPasswordOpen(false)
      toast.success("Contraseña actualizada")
    } catch (reason) {
      if (reason instanceof ApiError) {
        const failed: Record<string, string> = Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0] ?? reason.message]))
        setErrors(Object.keys(failed).length === 0 ? { request: reason.message } : failed)
      } else {
        setErrors({ request: "No se pudo actualizar la contraseña" })
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <SettingsLayout loading={loading}>
      {loading ? <LoadingSkeleton variant="settings" settingsSection="security" /> : null}
      <div hidden={loading} className="contents">
        <Accordion type="single" collapsible value={openSection} onValueChange={setOpenSection} className="-mt-2">
          <SettingsAccordionSection
            value="contrasena"
            data-tour="security-password"
            title="Contraseña"
            description="Cámbiela o pida un enlace por correo para crear otra"
            icon={KeyRound}
            keepMounted
          >
            <div className="flex flex-col gap-4">
              <Heading variant="small" title="Actualizar contraseña" description="Use una contraseña larga y única para proteger su cuenta" />
              <div>
                <Button type="button" data-test="open-password-dialog" onClick={openPasswordDialog}>
                  <KeyRound data-icon="inline-start" aria-hidden="true" />
                  Actualizar contraseña
                </Button>
              </div>
            </div>

            <div data-tour="security-reset" className="flex flex-col gap-4 border-t pt-6">
              <Heading
                variant="small"
                title="Restablecer por correo"
                description={`Le enviaremos un enlace a ${email ?? "su correo"}. Al cambiar la contraseña con él, se cerrará la sesión en todos los dispositivos`}
              />
              <div>
                <Button type="button" onClick={openRecoveryDialog}>
                  <Mail data-icon="inline-start" aria-hidden="true" />
                  Enviar enlace
                </Button>
              </div>
            </div>
          </SettingsAccordionSection>

          <SettingsAccordionSection value="dos-pasos" title="Verificación en dos pasos" description="Además de la contraseña, un código de su celular al entrar" icon={ShieldCheck} keepMounted>
            <ManageTwoFactor onLoadingChange={setLoading} />
          </SettingsAccordionSection>

          <SettingsAccordionSection value="sesiones" title="Sesiones abiertas" description="Dispositivos donde su cuenta está abierta" icon={MonitorSmartphone} keepMounted>
            <OtherSessions />
          </SettingsAccordionSection>
        </Accordion>
      </div>
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>Actualizar contraseña</DialogTitle>
              <DialogDescription>Use una contraseña larga y única para proteger su cuenta</DialogDescription>
            </DialogHeader>
            {errors.request ? <FeedbackAlert message={errors.request} /> : null}
            <div className="grid gap-2">
              <Label htmlFor="current_password" required>
                Contraseña actual
              </Label>
              <PasswordInput
                id="current_password"
                value={currentPassword}
                onValueChange={setCurrentPassword}
                aria-required="true"
                className="mt-1 block w-full"
                autoComplete="current-password"
                placeholder="Contraseña actual"
              />
              <InputError message={errors.current_password} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" required>
                Contraseña nueva
              </Label>
              <PasswordInput
                id="password"
                value={password}
                onValueChange={setPassword}
                aria-required="true"
                className="mt-1 block w-full"
                autoComplete="new-password"
                placeholder="Contraseña nueva"
              />
              <InputError message={errors.password} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password_confirmation" required>
                Confirmar contraseña
              </Label>
              <PasswordInput
                id="password_confirmation"
                value={passwordConfirmation}
                onValueChange={setPasswordConfirmation}
                aria-required="true"
                className="mt-1 block w-full"
                autoComplete="new-password"
                placeholder="Confirmar contraseña"
              />
              <InputError message={errors.password_confirmation} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={processing} data-test="update-password-button">
                {processing ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar enlace para restablecer la contraseña</DialogTitle>
            <DialogDescription>Se enviará a {email}. Al cambiar la contraseña con él, se cerrará la sesión en todos los dispositivos</DialogDescription>
          </DialogHeader>
          {recoveryError ? <FeedbackAlert message={recoveryError} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={recoveryProcessing}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" disabled={recoveryProcessing} onClick={() => void sendRecoveryLink()}>
              {recoveryProcessing ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" aria-hidden="true" />}
              Enviar enlace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  )
}
