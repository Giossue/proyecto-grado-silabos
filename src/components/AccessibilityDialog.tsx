"use client"

import { PersonStanding, RotateCcw } from "lucide-react"
import { useState } from "react"
import { ChoiceGroup } from "@/components/domain/ChoiceGroup"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { defaultSettings, useAccessibility, type AccessibilitySettings, type TextSize } from "@/composables/useAccessibility"
import { useSignal } from "@/lib/signal"
import { accessibilityDialogOpen } from "@/state/accessibilityDialog"

const sizes = [
  { value: "100", label: "Normal" },
  { value: "115", label: "Grande" },
  { value: "130", label: "Muy grande" },
  { value: "150", label: "Máximo" },
]

const toggles = [
  { key: "highContrast", label: "Alto contraste", hint: "Colores más marcados y foco más visible" },
  { key: "noMotion", label: "Sin animaciones", hint: "Quita transiciones y movimientos" },
  { key: "wideSpacing", label: "Texto más espaciado", hint: "Más espacio entre líneas, letras y palabras" },
] as const

export function AccessibilityDialog({ floating, remote }: { floating?: boolean; remote?: boolean }) {
  const [localOpen, setLocalOpen] = useState(false)
  const remoteOpen = useSignal(accessibilityDialogOpen)
  const open = remote ? remoteOpen : localOpen
  const setOpen = (value: boolean): void => {
    if (remote) accessibilityDialogOpen.value = value
    else setLocalOpen(value)
  }

  const { settings, update, reset } = useAccessibility()
  const defaults = defaultSettings()
  const isDefault = (Object.keys(defaults) as (keyof AccessibilitySettings)[]).every((key) => settings[key] === defaults[key])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {remote ? null : (
        <IconTooltip label="Accesibilidad" side="left">
          <DialogTrigger asChild>
            {floating ? (
              <Button type="button" size="icon" className="fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-menu [&_svg]:size-5 max-sm:hidden" aria-label="Accesibilidad"><PersonStanding aria-hidden="true" /></Button>
            ) : (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Accesibilidad"><PersonStanding data-icon="inline-start" aria-hidden="true" /></Button>
            )}
          </DialogTrigger>
        </IconTooltip>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Accesibilidad</DialogTitle>
          <DialogDescription>Ajuste la pantalla a su comodidad</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium" aria-hidden="true">Tamaño del texto</p>
            <ChoiceGroup value={settings.textSize} options={sizes} label="Tamaño del texto" onValueChange={(value) => update({ textSize: value as TextSize })} />
          </div>
          {toggles.map((toggle) => (
            <div key={toggle.key} className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <label htmlFor={`accessibility-${toggle.key}`} className="text-sm font-medium">{toggle.label}</label>
                <span className="text-sm text-muted-foreground">{toggle.hint}</span>
              </div>
              <Switch id={`accessibility-${toggle.key}`} checked={settings[toggle.key]} onCheckedChange={(checked) => update({ [toggle.key]: checked })} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cerrar</Button>
          </DialogClose>
          <Button type="button" disabled={isDefault} onClick={reset}><RotateCcw data-icon="inline-start" aria-hidden="true" />Restablecer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
