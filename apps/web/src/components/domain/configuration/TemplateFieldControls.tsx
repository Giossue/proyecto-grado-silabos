"use client"

import type { KeyboardEvent } from "react"
import type { TemplateField } from "@/api/template"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { FIELD_EDITABILITY, type FieldResponsible } from "@/types/configuration"

type TemplateEditabilityToggleProps = {
  field: TemplateField
  disabled?: boolean
  className?: string
  onResponsible: (value: FieldResponsible) => void
}

type TemplateFieldNameInputProps = {
  field: TemplateField
  disabled?: boolean
  className?: string
  onName: (label: string) => void
}

const nameOf = (field: TemplateField): string => field.label.trim() || "Campo sin nombre"
const editabilityOf = (field: TemplateField): FieldResponsible => (field.quien_llena === "institucional" ? "institucional" : "carrera")

export function TemplateEditabilityToggle({ field, disabled = false, className, onResponsible }: TemplateEditabilityToggleProps) {
  const current = editabilityOf(field)
  const choose = (value: string): void => {
    if (value && value !== current) onResponsible(value as FieldResponsible)
  }

  return (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={current} disabled={disabled} aria-label={`Si se puede editar el campo ${nameOf(field)}`} className={className} data-field-editability onValueChange={choose}>
      {FIELD_EDITABILITY.map((item) => (
        <ToggleGroupItem key={item.value} value={item.value} className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" data-editability={item.value}>
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
