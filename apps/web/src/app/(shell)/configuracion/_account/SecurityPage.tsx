"use client"

import { KeyRound, Mail, MonitorSmartphone } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { requestPasswordRecovery } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { SettingsAccordionSection } from "@/components/domain/SettingsAccordionSection"
import { Heading } from "@/components/Heading"
import { OtherSessions } from "@/components/OtherSessions"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { toast } from "@/lib/toast"
import { sessionState, useSession } from "@/state/session"

export default function SecurityPage() {
  const email = useSession().session?.user.email
  const [openSection, setOpenSection] = useState("contrasena")
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
      <Accordion type="single" collapsible value={openSection} onValueChange={setOpenSection} className="-mt-2">
        <SettingsAccordionSection
          value="contrasena"
          title="Contraseña"
          description="Pida un enlace por correo para crear otra"
          icon={KeyRound}
          keepMounted
        >
          <div data-tour="security-reset" className="flex flex-col gap-4">
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

        <SettingsAccordionSection value="sesiones" title="Sesiones abiertas" description="Dispositivos donde su cuenta está abierta" icon={MonitorSmartphone} keepMounted>
          <OtherSessions />
        </SettingsAccordionSection>
      </Accordion>
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
