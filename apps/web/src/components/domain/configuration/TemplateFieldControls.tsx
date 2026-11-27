"use client"

import type { KeyboardEvent } from "react"
import type { TemplateField } from "@/api/template"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { FIELD_FILLERS, fieldFiller, type FieldFiller } from "@/types/configuration"

type TemplateFillerToggleProps = {
  field: TemplateField
  disabled?: boolean
  className?: string
  onFiller: (value: FieldFiller) => void
}

type TemplateFieldNameInputProps = {
  field: TemplateField
  disabled?: boolean
  className?: string
  onName: (label: string) => void
}

const nameOf = (field: TemplateField): string => field.label.trim() || "Campo sin nombre"

export function TemplateFillerToggle({ field, disabled = false, className, onFiller }: TemplateFillerToggleProps) {
  const current = fieldFiller(field)
  const choose = (value: string): void => {
    if (value && value !== current) onFiller(value as FieldFiller)
  }

  return (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={current} disabled={disabled} aria-label={`Quién llena el campo ${nameOf(field)}`} className={className} data-field-filler onValueChange={choose}>
      {FIELD_FILLERS.map((item) => (
        <ToggleGroupItem key={item.value} value={item.value} className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" data-filler={item.value}>
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function TemplateFieldNameInput({ field, disabled = false, className, onName }: TemplateFieldNameInputProps) {
  const finish = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") event.currentTarget.blur()
  }

  return (
    <Input
      value={field.label}
      maxLength={180}
      disabled={disabled}
      placeholder="Campo sin nombre"
      aria-label="Nombre del campo"
      autoComplete="off"
      data-field-name-input
      className={cn("h-8", className)}
      onChange={(event) => onName(event.target.value)}
      onKeyDown={finish}
    />
  )
}
