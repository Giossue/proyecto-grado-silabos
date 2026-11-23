"use client"

import { MailCheck, Trash2 } from "lucide-react"
import { useState } from "react"
import { deleteManagedUser, resendManagedUserInvitation } from "@/api/admin-users"
import { ApiError } from "@/api/client"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"

type ManagedUserPendingActionsProps = {
  userId: string
  userName: string
  userEmail: string
  resendOpen?: boolean
  onResendOpenChange?: (open: boolean) => void
  deleteOpen?: boolean
  onDeleteOpenChange?: (open: boolean) => void
  onChanged?: (message: string) => void
}

export function ManagedUserPendingActions({
  userId,
  userName,
  userEmail,
  resendOpen,
  onResendOpenChange,
  deleteOpen,
  onDeleteOpenChange,
  onChanged,
}: ManagedUserPendingActionsProps) {
  const [isResendOpen, setResendOpen] = useModelOpen(resendOpen, onResendOpenChange)
  const [isDeleteOpen, setDeleteOpen] = useModelOpen(deleteOpen, onDeleteOpenChange)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useOpened(isResendOpen || isDeleteOpen, () => setError(null))

  const run = async (action: () => Promise<{ message: string }>, close: () => void, fallback: string): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      const result = await action()
      close()
      onChanged?.(result.message)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : fallback)
    } finally {
      setProcessing(false)
    }
  }

  const resend = () => run(() => resendManagedUserInvitation(userId), () => setResendOpen(false), "No se pudo reenviar la invitación")
  const remove = () => run(() => deleteManagedUser(userId), () => setDeleteOpen(false), "No se pudo eliminar la cuenta")

  return (
    <>
      <Dialog open={isResendOpen} onOpenChange={setResendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reenviar invitación de activación</DialogTitle>
            <DialogDescription>
              Se invalidará el enlace anterior y se enviará uno nuevo a {userEmail} para que {userName} defina su contraseña
            </DialogDescription>
          </DialogHeader>
          {error ? <FeedbackAlert message={error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" disabled={processing} onClick={() => void resend()}>
              {processing ? <Spinner /> : <MailCheck />}
              Reenviar invitación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cuenta pendiente</DialogTitle>
            <DialogDescription>Se eliminará la cuenta de {userName}. Esta acción no se puede deshacer</DialogDescription>
          </DialogHeader>
          {error ? <FeedbackAlert message={error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={processing} onClick={() => void remove()}>
              {processing ? <Spinner /> : <Trash2 />}
              Eliminar cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
