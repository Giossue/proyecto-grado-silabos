"use client"

import { Sheet } from "lucide-react"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export type FieldTable = { kind: string; label: string; editable: boolean }

type TemplateTableToolProps = { allowed: boolean; disabled?: boolean; tables: FieldTable[]; onCreate: () => void; onEdit: (kind: string) => void }

export function TemplateTableTool({ allowed, disabled = false, tables, onCreate, onEdit }: TemplateTableToolProps) {
  const tooltip = allowed ? "Tabla repetible" : "Tabla repetible: no va en campos Institucionales"

  return (
    <MenuTooltip label={tooltip}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Tabla repetible" disabled={disabled || !allowed} data-table-tool onMouseDown={(event) => event.preventDefault()}>
            <Sheet aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem data-table-create onSelect={onCreate}>Nueva tabla repetible</DropdownMenuItem>
          </DropdownMenuGroup>
          {tables.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>En este campo</DropdownMenuLabel>
              <DropdownMenuGroup>
                {tables.map((table) => (
                  <DropdownMenuItem key={table.kind} data-table-edit={table.kind} onSelect={() => onEdit(table.kind)}>
                    {table.editable ? `Editar «${table.label}»` : `Ver «${table.label}»`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuTooltip>
  )
}
