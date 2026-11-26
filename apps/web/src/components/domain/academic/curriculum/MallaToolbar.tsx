"use client"

import { BookPlus } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Malla } from "@/types/academic"
import { MALLA_STATE_LABELS } from "@silabos/shared/schemas/academic"

/** How a malla is shown to people: «Malla <código>», e.g. «Malla SW-8». */
export function mallaLabel(malla: Pick<Malla, "code">): string {
  return `Malla ${malla.code}`
}

/** Value of the «Nueva malla» entry: choosing it creates a malla instead of selecting one (malla ids are UUIDs). */
const NEW_MALLA = "nueva-malla"

type MallaToolbarProps = {
  mallas: Malla[]
  selected: Malla
  onSelect: (mallaId: string) => void
  onCreate: () => void
}

/** Picks the malla shown on the page (the vigente one by default), each with its state and cycles, and offers to create another. */
export function MallaToolbar({ mallas, selected, onSelect, onCreate }: MallaToolbarProps) {
  return (
    <div className="w-full max-w-72" data-tour="malla-selector">
      <Select value={selected.id} onValueChange={(value) => (value === NEW_MALLA ? onCreate() : onSelect(value))}>
        <SelectTrigger id="malla-selector" aria-label="Malla" className="w-full">
          <SelectValue placeholder="Elija una malla" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {mallas.map((malla) => (
              <SelectItem key={malla.id} value={malla.id}>
                {mallaLabel(malla)} · {MALLA_STATE_LABELS[malla.state] ?? malla.state} · {malla.cycle_count === 1 ? "1 ciclo" : `${malla.cycle_count} ciclos`}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value={NEW_MALLA}>
              <BookPlus aria-hidden="true" />
              Nueva malla
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
