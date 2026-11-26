"use client"

import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Malla, MallaState } from "@/types/academic"
import { MALLA_STATE_LABELS } from "@silabos/shared/schemas/academic"

const STATE_VARIANTS: Record<MallaState, "success" | "neutral"> = { vigente: "success", cerrada: "neutral" }

/** How a malla is shown to people: «Malla <código>», e.g. «Malla SW-8». */
export function mallaLabel(malla: Pick<Malla, "code">): string {
  return `Malla ${malla.code}`
}

export function MallaStateBadge({ state }: { state: MallaState }) {
  return <Badge variant={STATE_VARIANTS[state]}>{MALLA_STATE_LABELS[state] ?? state}</Badge>
}

type MallaToolbarProps = {
  mallas: Malla[]
  selected: Malla
  onSelect: (mallaId: string) => void
}

/** Picks the malla shown on the page (the vigente one by default) and shows its state and cycles. */
export function MallaToolbar({ mallas, selected, onSelect }: MallaToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-tour="malla-selector">
      <div className="w-full max-w-72">
        <Select value={selected.id} onValueChange={onSelect}>
          <SelectTrigger id="malla-selector" aria-label="Malla" className="w-full">
            <SelectValue placeholder="Elija una malla" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {mallas.map((malla) => (
                <SelectItem key={malla.id} value={malla.id}>
                  {mallaLabel(malla)} · {MALLA_STATE_LABELS[malla.state] ?? malla.state}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <MallaStateBadge state={selected.state} />
        <span className="text-sm text-muted-foreground">
          {selected.cycle_count === 1 ? "1 ciclo" : `${selected.cycle_count} ciclos`}
        </span>
      </div>
    </div>
  )
}
