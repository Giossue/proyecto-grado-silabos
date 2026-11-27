"use client"

import { PencilLine, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function SubjectSelectionBar({ count, onFill, onClear }: { count: number; onFill: () => void; onClear: () => void }) {
  return (
    <Card className="sticky bottom-3 z-20 flex-row flex-wrap items-center justify-center gap-2 px-3 py-2 shadow-lg max-sm:bottom-20" role="region" aria-label="Acciones sobre las materias seleccionadas">
      <span className="text-sm font-medium" aria-live="polite">
        {count === 1 ? "1 materia seleccionada" : `${count} materias seleccionadas`}
      </span>
      <Button type="button" size="sm" onClick={onFill}>
        <PencilLine data-icon="inline-start" aria-hidden="true" />
        Llenar un campo
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        <X data-icon="inline-start" aria-hidden="true" />
        Quitar selección
      </Button>
    </Card>
  )
}
