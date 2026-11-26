"use client"

import { Sheet } from "lucide-react"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAfterMenuClose } from "@/components/domain/configuration/useAfterMenuClose"

export type FieldTable = { kind: string; label: string; editable: boolean }

type TemplateTableToolProps = { allowed: boolean; disabled?: boolean; text?: string; tables: FieldTable[]; onCreate: () => void; onEdit: (kind: string) => void }

export function TemplateTableTool({ allowed, disabled = false, text, tables, onCreate, onEdit }: TemplateTableToolProps) {
  const { afterClose, onCloseAutoFocus } = useAfterMenuClose()
  const tooltip = allowed ? "Tabla repetible" : "Tabla repetible: no va en campos Institucionales"

  return (
    <MenuTooltip label={tooltip}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size={text ? "sm" : "icon-sm"} aria-label="Tabla repetible" disabled={disabled || !allowed} data-table-tool onMouseDown={(event) => event.preventDefault()}>
            <Sheet data-icon={text ? "inline-start" : undefined} aria-hidden="true" />
            {text}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={onCloseAutoFocus}>
          <DropdownMenuGroup>
            <DropdownMenuItem data-table-create onSelect={afterClose(onCreate)}>Nueva tabla repetible</DropdownMenuItem>
          </DropdownMenuGroup>
          {tables.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>En este campo</DropdownMenuLabel>
              <DropdownMenuGroup>
                {tables.map((table) => (
                  <DropdownMenuItem key={table.kind} data-table-edit={table.kind} onSelect={afterClose(() => onEdit(table.kind))}>
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
