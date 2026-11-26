"use client"

import { UserRoundCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useShownWhileClosing } from "@/lib/dialogExit"

type CoordinatorReplacementConfirmProps = { message: string | null; processing: boolean; onConfirm: () => void; onCancel: () => void }

export function CoordinatorReplacementConfirm({ message, processing, onConfirm, onCancel }: CoordinatorReplacementConfirmProps) {
  const shownMessage = useShownWhileClosing(message)

  return (
    <Dialog
      open={message !== null}
      onOpenChange={(value) => {
        if (!value) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reemplazar coordinador</DialogTitle>
          <DialogDescription>
            {shownMessage} Al confirmar, deja de coordinarla. Lo que aprobó en el periodo académico en curso vuelve a revisión para que lo firme el nuevo coordinador
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" disabled={processing} onClick={onConfirm}>
            {processing ? <Spinner data-icon="inline-start" /> : <UserRoundCog data-icon="inline-start" aria-hidden="true" />}
            Reemplazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
