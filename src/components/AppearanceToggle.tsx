"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppearance } from "@/composables/useAppearance"

const options = [
  { value: "light", Icon: Sun, label: "Claro" },
  { value: "dark", Icon: Moon, label: "Oscuro" },
] as const

export function AppearanceToggle() {
  const { appearance, updateAppearance } = useAppearance()
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === appearance))
  const current = options[currentIndex]
  const next = options[(currentIndex + 1) % options.length]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Tema visual: ${current.label}. Cambiar a ${next.label}`}
            onClick={() => updateAppearance(next.value)}
          >
            <current.Icon data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Tema: {current.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
