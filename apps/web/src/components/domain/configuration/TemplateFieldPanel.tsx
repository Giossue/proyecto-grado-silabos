"use client"

import { Plus, X } from "lucide-react"
import { useId, type ReactNode } from "react"
import type { FieldTable } from "@/components/domain/configuration/TemplateTableTool"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

type TemplateFieldPanelProps = {
  name: string
  responsible: ReactNode
  limit: ReactNode
  limitText: string
  condition: ReactNode
  conditionText: string
  tables: FieldTable[]
  tablesAllowed: boolean
  disabled?: boolean
  onCreateTable: () => void
  onEditTable: (kind: string) => void
  onClose: () => void
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

export function TemplateFieldPanel({ name, responsible, limit, limitText, condition, conditionText, tables, tablesAllowed, disabled = false, onCreateTable, onEditTable, onClose }: TemplateFieldPanelProps) {
  return (
    <aside data-template-panel aria-label="Opciones del campo" className="sticky top-44 flex max-h-[calc(100dvh-12rem)] w-72 shrink-0 flex-col gap-4 self-start overflow-y-auto rounded-md max-lg:hidden bg-card p-4 shadow-menu ring-1 ring-surface-ring">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-semibold">Opciones del campo</h2>
          <p className="truncate text-sm text-muted-foreground" data-panel-field>{name}</p>
        </div>
        <IconTooltip label="Cerrar el panel">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar el panel" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </IconTooltip>
      </div>
      <Separator />
      <PanelSection title="Quién lo llena">{responsible}</PanelSection>
      <div className="flex flex-col items-start gap-1">
        {limit}
        <p className="px-2 text-sm text-muted-foreground" data-panel-limit>{limitText}</p>
      </div>
      <div className="flex flex-col items-start gap-1">
        {condition}
        <p className="px-2 text-sm text-muted-foreground" data-panel-condition>{conditionText}</p>
      </div>
      <PanelSection title="Tablas repetibles">
        {tables.length ? (
          <ul className="flex flex-col gap-1">
            {tables.map((table) => (
              <li key={table.kind}>
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" disabled={disabled} data-panel-table={table.kind} onClick={() => onEditTable(table.kind)}>
                  {table.editable ? `Editar «${table.label}»` : `Ver «${table.label}»`}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Este campo no tiene tablas repetibles</p>
        )}
        {tablesAllowed ? (
          <Button type="button" variant="ghost" size="sm" className="w-fit" disabled={disabled} data-panel-table-create onClick={onCreateTable}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Nueva tabla repetible
          </Button>
        ) : null}
      </PanelSection>
    </aside>
  )
}
