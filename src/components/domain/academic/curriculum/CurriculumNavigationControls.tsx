"use client"

import { ControlButton } from "@xyflow/react"
import { CircleHelp } from "lucide-react"
import type { ReactNode } from "react"
import { ZOOM_LEVELS, type ZoomChoice } from "@/components/domain/academic/curriculum/curriculumCanvasLayout"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"

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
    <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
      <div className="react-flow__controls flex [&>button]:border-r [&>button]:border-b-0 [&>button]:border-border [&>button:disabled]:opacity-40" role="group" aria-label="Zoom de la malla">
        <IconTooltip label="Acercar">
          <ControlButton aria-label="Acercar la malla" disabled={larger === null} onClick={() => larger !== null && onChoiceChange(larger)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z" />
            </svg>
          </ControlButton>
        </IconTooltip>
        <IconTooltip label="Alejar">
          <ControlButton aria-label="Alejar la malla" disabled={smaller === null} onClick={() => smaller !== null && onChoiceChange(smaller)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" aria-hidden="true">
              <path d="M0 0h32v4.2H0z" />
            </svg>
          </ControlButton>
        </IconTooltip>
        <IconTooltip label="Ajustar al ancho">
          <ControlButton aria-label="Ajustar la malla al ancho disponible" aria-pressed={choice === "fit"} onClick={() => onChoiceChange("fit")}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden="true">
              <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0 0 27.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94a.919.919 0 0 1-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
            </svg>
          </ControlButton>
        </IconTooltip>
      </div>
      <IconTooltip label="Use la rueda o las barras para moverse · Mayús + rueda para ir a los lados">
        <Button type="button" variant="ghost" size="icon-sm" className="bg-card/90" aria-label="Cómo moverse por la malla">
          <CircleHelp aria-hidden="true" />
        </Button>
      </IconTooltip>
      {children}
    </div>
  )
}
