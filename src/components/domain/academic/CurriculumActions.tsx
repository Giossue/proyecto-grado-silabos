"use client"

import { Settings2 } from "lucide-react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import type { CurriculumBuilderProps } from "@/types/academic"

type CurriculumActionsProps = Pick<CurriculumBuilderProps, "curriculum"> & { onConfigure: () => void }

export function CurriculumActions({ curriculum, onConfigure }: CurriculumActionsProps) {
  return (
    <IconTooltip label="Configurar ciclos">
      <span className="inline-flex">
        <Button type="button" variant="ghost" size="icon" aria-label="Configurar ciclos" disabled={Boolean(curriculum.lock_reason)} onClick={onConfigure}>
          <Settings2 aria-hidden="true" />
        </Button>
      </span>
    </IconTooltip>
  )
}
