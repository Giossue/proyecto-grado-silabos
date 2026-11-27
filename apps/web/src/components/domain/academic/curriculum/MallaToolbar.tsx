"use client"

import { BookPlus } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Malla } from "@/types/academic"
import { MALLA_STATE_LABELS } from "@silabos/shared/schemas/academic"

/** How a malla is shown to people: «Malla <código>», e.g. «Malla SW-8». */
export function mallaLabel(malla: Pick<Malla, "code">): string {
  return `Malla ${malla.code}`
}

export const openMallas = (mallas: Malla[]): Malla[] => mallas.filter((malla) => malla.state !== "cerrada")

export const shownMalla = (mallas: Malla[], chosenId: string | null): Malla | null => mallas.find((malla) => malla.id === chosenId) ?? mallas[0] ?? null

export const isOfMalla = (item: { malla_name?: string | null }, malla: Pick<Malla, "code">): boolean => item.malla_name === mallaLabel(malla)

/** Value of the «Nueva malla» entry: choosing it creates a malla instead of selecting one (malla ids are UUIDs). */
const NEW_MALLA = "nueva-malla"

type MallaToolbarProps = {
  mallas: Malla[]
  selected: Malla
  disabled?: boolean
  className?: string
  onSelect: (mallaId: string) => void
  onCreate?: () => void
}

export function MallaToolbar({ mallas, selected, disabled, className, onSelect, onCreate }: MallaToolbarProps) {
  return (
    <div className={cn("w-full max-w-72", className)} data-tour="malla-selector">
      <Select value={selected.id} disabled={disabled} onValueChange={(value) => (value === NEW_MALLA ? onCreate?.() : onSelect(value))}>
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
          {onCreate ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectItem value={NEW_MALLA}>
                  <BookPlus aria-hidden="true" />
                  Nueva malla
                </SelectItem>
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}
