"use client"

import { MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function TableActionsMenu({ label, disabled = false, children }: { label: string; disabled?: boolean; children?: ReactNode }) {
  return (
    <MenuTooltip label={label}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" data-slot="table-actions" data-table-actions variant="ghost" size="icon-sm" aria-label={label} disabled={disabled}>
            <MoreHorizontal data-icon="inline-start" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>{children}</DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuTooltip>
  )
}
