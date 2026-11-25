"use client"

import { FilterX } from "lucide-react"
import type { ReactNode } from "react"
import { MobileFilterSheet } from "@/components/domain/MobileFilterSheet"
import { SortSelect } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { TableSort } from "@/composables/useTableSort"

type ClientFilterBarProps = {
  inputId: string
  placeholder: string
  label: string
  filter: {
    search: string
    setSearch: (value: string) => void
    active: boolean
    clear: () => void
  }
  filters?: ReactNode
  sort?: Pick<TableSort, "options" | "selected" | "choose">
  sortInputId?: string
}

export function ClientFilterBar({ inputId, placeholder, label, filter, filters, sort, sortInputId }: ClientFilterBarProps) {
  return (
    <FieldGroup data-tour="filters" className="gap-3 lg:flex-row lg:items-end [&_[data-slot=select-trigger]]:bg-card [&_input]:bg-card">
      <div className="min-w-0 lg:flex-1">
        <Field>
          <FieldLabel htmlFor={inputId} className="sr-only">
            {label}
          </FieldLabel>
          <Input id={inputId} type="search" value={filter.search} placeholder={placeholder} onChange={(event) => filter.setSearch(event.target.value)} />
        </Field>
      </div>
      {filters || sort ? (
        <MobileFilterSheet className="grid min-w-0 gap-3 sm:grid-cols-2 lg:flex lg:flex-none lg:items-end [&_[data-slot=select-trigger]]:w-full [&>[data-slot=field]]:min-w-0 lg:[&>[data-slot=field]]:w-44 lg:[&>[data-slot=field][data-wide]]:w-96">
          {sort ? <SortSelect sort={sort} inputId={sortInputId ?? `${inputId}-sort`} /> : null}
          {filters}
          {filter.active ? (
            <Button type="button" variant="ghost" className="max-sm:w-full" onClick={() => filter.clear()}>
              <FilterX data-icon="inline-start" aria-hidden="true" />
              Quitar filtros
            </Button>
          ) : null}
        </MobileFilterSheet>
      ) : null}
    </FieldGroup>
  )
}
