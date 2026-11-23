"use client"

import { Download, Share } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/lib/toast"
import { installAppState, useInstallApp } from "@/state/installApp"

export function InstallAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { canPrompt } = useInstallApp()
  const [installing, setInstalling] = useState(false)
  const [shownCanPrompt, setShownCanPrompt] = useState(canPrompt)
  if (open && !installing && shownCanPrompt !== canPrompt) setShownCanPrompt(canPrompt)
  const platform = typeof navigator === "undefined" ? "other" : installAppState.platform()

  const install = async (): Promise<void> => {
    setInstalling(true)
    try {
      if (await installAppState.install()) {
        onOpenChange(false)
        toast.success("Sílabos UEB quedó instalado")
      }
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Instalar Sílabos UEB</DialogTitle>
          <DialogDescription>Úselo como una aplicación en su celular o computadora</DialogDescription>
        </DialogHeader>
        {!shownCanPrompt && platform === "ios" ? (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Abra el sistema en Safari</li>
            <li>Pulse Compartir <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /></li>
            <li>Elija «Agregar a pantalla de inicio»</li>
          </ol>
        ) : !shownCanPrompt ? (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            <li>Chrome o Edge: menú ⋮ → «Instalar»</li>
            <li>Safari en Mac: Archivo → «Agregar al Dock»</li>
          </ul>
        ) : null}
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">Cerrar</Button></DialogClose>
          {shownCanPrompt ? (
            <Button type="button" disabled={installing} onClick={() => void install()}>
              {installing ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden="true" />}
              Instalar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
