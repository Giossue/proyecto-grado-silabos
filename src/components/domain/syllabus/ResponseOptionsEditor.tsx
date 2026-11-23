"use client"

import { Plus, X } from "lucide-react"
import { useRef, useState } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RESPONSE_MAX_OPTIONS, RESPONSE_OPTION_LENGTH, nextOptionKey, type ResponseOption } from "@/lib/responseKinds"

type ResponseOptionsEditorProps = {
  value: ResponseOption[]
  onValueChange: (value: ResponseOption[]) => void
  label?: string
  disabled?: boolean
}

const clean = (rows: ResponseOption[]): ResponseOption[] => {
  const seen = new Set<string>()

  return rows
    .map((row) => ({ const: row.const, title: row.title.replace(/\s+/g, " ").trim() }))
    .filter((row) => {
      const key = row.title.toLowerCase()
      if (row.title === "" || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const blank = (rows: ResponseOption[]): ResponseOption => ({ const: nextOptionKey(rows), title: "" })

const rowsOf = (value: ResponseOption[]): ResponseOption[] => (value.length ? value.map((row) => ({ ...row })) : [blank([])])

export function ResponseOptionsEditor({ value, onValueChange, label = "Opciones", disabled = false }: ResponseOptionsEditorProps) {
  const [rows, setRows] = useState<ResponseOption[]>(() => rowsOf(value))
  const [synced, setSynced] = useState(value)
  const list = useRef<HTMLUListElement | null>(null)

  if (synced !== value) {
    setSynced(value)
    if (JSON.stringify(value) !== JSON.stringify(clean(rows))) setRows(rowsOf(value))
  }

  const publish = (next: ResponseOption[]): void => {
    setRows(next)
    onValueChange(clean(next))
  }
  const write = (index: number, title: string): void => publish(rows.map((row, position) => (position === index ? { ...row, title } : row)))
  const add = (): void => {
    if (disabled || rows.length >= RESPONSE_MAX_OPTIONS) return
    setRows([...rows, blank(rows)])
    requestAnimationFrame(() => list.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus())
  }
  const remove = (index: number): void => {
    const next = rows.filter((_, position) => position !== index)
    publish(next.length === 0 ? [blank([])] : next)
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-label={label}>
      <ul ref={list} className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <li key={row.const} className="flex items-center gap-1">
            <Input
              value={row.title}
              aria-label={`Opción ${index + 1}`}
              placeholder={`Opción ${index + 1}`}
              maxLength={RESPONSE_OPTION_LENGTH}
              disabled={disabled}
              autoComplete="off"
              className="h-8"
              onChange={(event) => write(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                add()
              }}
            />
            <IconTooltip label={`Quitar opción ${index + 1}`}>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar opción ${index + 1}`} disabled={disabled} onClick={() => remove(index)}>
                <X aria-hidden="true" />
              </Button>
            </IconTooltip>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="w-fit" data-response-add-option disabled={disabled || rows.length >= RESPONSE_MAX_OPTIONS} onClick={add}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        Agregar opción
      </Button>
    </div>
  )
}
