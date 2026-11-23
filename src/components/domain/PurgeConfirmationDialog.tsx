"use client"

import { RotateCcw, Save } from "lucide-react"
import { useState } from "react"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FINALIZED_NOTICE, usePurgeConfirmation } from "@/composables/usePurgeConfirmation"
import { matchesPhrase } from "@/lib/confirmPhrase"

const PHRASE = "devolver a borrador"

export function PurgeConfirmationDialog() {
  const { open, message, mode, confirm, cancel } = usePurgeConfirmation()
  const finalizedNotice = mode === FINALIZED_NOTICE
  const [typed, setTyped] = useState("")
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTyped("")
  }
  const ready = matchesPhrase(typed, PHRASE)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) cancel() }}>
      <DialogContent layer="confirmation">
        <DialogHeader>
          <DialogTitle>{finalizedNotice ? "La convocatoria ya finalizó" : "Este cambio afecta sílabos en curso"}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {finalizedNotice ? null : <ConfirmPhrase id="purge-confirm" phrase={PHRASE} value={typed} onValueChange={setTyped} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancel}>
            Cancelar
          </Button>
          {finalizedNotice ? (
            <Button type="button" onClick={() => void confirm()}>
              <Save data-icon="inline-start" aria-hidden="true" />
              Guardar de todos modos
            </Button>
          ) : (
            <Button type="button" variant="destructive" disabled={!ready} onClick={() => void confirm()}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Guardar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
