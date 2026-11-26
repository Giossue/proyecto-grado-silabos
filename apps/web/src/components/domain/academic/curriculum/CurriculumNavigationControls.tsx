"use client"

import { CircleHelp, Minus, Plus, Scan } from "lucide-react"
import type { ReactNode } from "react"
import { ZOOM_LEVELS, type ZoomChoice } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"

/** Shared look for every canvas control, so the zoom, help and legend buttons match. */
export const CONTROL_CLASS = "bg-card/90"

type CurriculumNavigationControlsProps = {
  choice: ZoomChoice
  zoom: number
  onChoiceChange: (choice: ZoomChoice) => void
  children?: ReactNode
}

export function CurriculumNavigationControls({ choice, zoom, onChoiceChange, children }: CurriculumNavigationControlsProps) {
  const larger = ZOOM_LEVELS.find((level) => level > zoom + 0.001) ?? null
  const smaller = ZOOM_LEVELS.findLast((level) => level < zoom - 0.001) ?? null

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
      <div className="flex flex-col gap-1" role="group" aria-label="Zoom de la malla">
        <IconTooltip label="Acercar" side="right">
          <span className="inline-flex">
            <Button type="button" variant="ghost" size="icon-sm" className={CONTROL_CLASS} aria-label="Acercar la malla" disabled={larger === null} onClick={() => larger !== null && onChoiceChange(larger)}>
              <Plus aria-hidden="true" />
            </Button>
          </span>
        </IconTooltip>
        <IconTooltip label="Alejar" side="right">
          <span className="inline-flex">
            <Button type="button" variant="ghost" size="icon-sm" className={CONTROL_CLASS} aria-label="Alejar la malla" disabled={smaller === null} onClick={() => smaller !== null && onChoiceChange(smaller)}>
              <Minus aria-hidden="true" />
            </Button>
          </span>
        </IconTooltip>
        <IconTooltip label="Ajustar al ancho" side="right">
          <Button type="button" variant="ghost" size="icon-sm" className={CONTROL_CLASS} aria-label="Ajustar la malla al ancho disponible" aria-pressed={choice === "fit"} onClick={() => onChoiceChange("fit")}>
            <Scan aria-hidden="true" />
          </Button>
        </IconTooltip>
      </div>
      <IconTooltip label="Use la rueda o las barras para moverse · Mayús + rueda para ir a los lados" side="right">
        <Button type="button" variant="ghost" size="icon-sm" className={CONTROL_CLASS} aria-label="Cómo moverse por la malla">
          <CircleHelp aria-hidden="true" />
        </Button>
      </IconTooltip>
      {children}
    </div>
  )
}
