"use client"

import { BookPlus, PencilLine } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Malla, MallaState } from "@/types/academic"
import { MALLA_STATE_LABELS } from "@silabos/shared/schemas/academic"

const STATE_VARIANTS: Record<MallaState, "success" | "warning" | "neutral"> = { vigente: "success", en_transicion: "warning", cerrada: "neutral" }

export function MallaStateBadge({ state }: { state: MallaState }) {
  return <Badge variant={STATE_VARIANTS[state]}>{MALLA_STATE_LABELS[state] ?? state}</Badge>
}

type MallaToolbarProps = {
  mallas: Malla[]
  selected: Malla
  onSelect: (mallaId: string) => void
  onCreate: () => void
  onEdit: () => void
}

/** Picks the malla shown on the page (the vigente one by default) and opens its management dialogs. */
export function MallaToolbar({ mallas, selected, onSelect, onCreate, onEdit }: MallaToolbarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3" data-tour="malla-selector">
      <Field className="w-full sm:w-80">
        <FieldLabel htmlFor="malla-selector">Malla</FieldLabel>
        <Select value={selected.id} onValueChange={onSelect}>
          <SelectTrigger id="malla-selector" className="w-full">
            <SelectValue placeholder="Elija una malla" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {mallas.map((malla) => (
                <SelectItem key={malla.id} value={malla.id}>
                  {malla.name} · {MALLA_STATE_LABELS[malla.state] ?? malla.state}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-center gap-2 pb-1.5">
        <MallaStateBadge state={selected.state} />
        <span className="text-sm text-muted-foreground">
          {selected.cycle_count === 1 ? "1 ciclo" : `${selected.cycle_count} ciclos`}
          {selected.resolution ? ` · ${selected.resolution}` : ""}
        </span>
      </div>
      <div className="flex gap-2 sm:ml-auto">
        <Button type="button" variant="outline" onClick={onEdit}>
          <PencilLine data-icon="inline-start" aria-hidden="true" />
          Datos de la malla
        </Button>
        <Button type="button" variant="outline" onClick={onCreate}>
          <BookPlus data-icon="inline-start" aria-hidden="true" />
          Nueva malla
        </Button>
      </div>
    </div>
  )
}
