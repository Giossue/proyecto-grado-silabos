"use client"

import { KeyRound, Mail } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { requestPasswordRecovery } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { toast } from "@/lib/toast"
import { sessionState, useSession } from "@/state/session"

export default function SecurityPage() {
  const email = useSession().session?.user.email
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoveryProcessing, setRecoveryProcessing] = useState(false)

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

  return (
    <SettingsLayout>
      <section data-tour="security-reset" aria-labelledby="security-password" className="flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <h2 id="security-password" className="font-medium">
              Contraseña
            </h2>
            <p className="text-sm text-muted-foreground">Pida un enlace por correo para crear otra</p>
          </div>
        </header>
        <p className="text-sm text-muted-foreground">
          Le enviaremos un enlace a {email ?? "su correo"}. Al cambiar la contraseña con él, se cerrará la sesión en todos los dispositivos
        </p>
        <div>
          <Button type="button" onClick={openRecoveryDialog}>
            <Mail data-icon="inline-start" aria-hidden="true" />
            Enviar enlace
          </Button>
        </div>
      </section>
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
