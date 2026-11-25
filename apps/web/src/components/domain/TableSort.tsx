"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import type { ReactNode } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableHead } from "@/components/ui/table"
import type { TableSort } from "@/composables/useTableSort"
import { cn } from "@/lib/utils"

type SortableHeadProps<K extends string> = {
  sort: TableSort<K>
  column: K
  className?: string
  children: ReactNode
}

export function SortableHead<K extends string>({ sort, column, className, children }: SortableHeadProps<K>) {
  const state = sort.headProps(column)["aria-sort"]
  const Icon = state === "ascending" ? ArrowUp : state === "descending" ? ArrowDown : ArrowUpDown

  return (
    <TableHead {...sort.headProps(column)} className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => sort.sortBy(column)}
        className="flex min-h-10 w-full cursor-pointer items-center gap-1.5 px-2 text-left font-medium outline-hidden transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset in-[th.text-center]:justify-center in-[th.text-right]:justify-end"
      >
        {children}
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", state ? "text-foreground" : "text-muted-foreground/60")} />
      </button>
    </TableHead>
  )
}

export function SortStatus({ sort }: { sort: Pick<TableSort, "announcement"> }) {
  return (
    <span role="status" className="sr-only">
      {sort.announcement}
    </span>
  )
}

export function SortSelect({ sort, inputId, className }: { sort: Pick<TableSort, "options" | "selected" | "choose">; inputId: string; className?: string }) {
  return (
    <Field data-sort-select className={cn("sm:hidden", className)}>
      <FieldLabel htmlFor={inputId}>Ordenar por</FieldLabel>
      <Select value={sort.selected} onValueChange={sort.choose}>
        <SelectTrigger id={inputId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {sort.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
