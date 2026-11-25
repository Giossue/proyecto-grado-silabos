"use client"

import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { withoutEndPeriod } from "@/lib/text"

type UnsavedChangesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  discardLabel?: string
  onContinue: () => void
  onDiscard: () => void
}

export function UnsavedChangesDialog({ open, onOpenChange, title, description, discardLabel = "Descartar cambios", onContinue, onDiscard }: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{withoutEndPeriod(description)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onContinue}>
            Seguir editando
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            {discardLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
