"use client"

import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FixedSubjectField } from "@/types/academic"

type CurriculumSubjectFieldInputProps = {
  field: FixedSubjectField
  inputId: string
  value: number | string
  error?: string
  className?: string
  onValueChange: (value: unknown) => void
}

export function CurriculumSubjectFieldInput({ field, inputId, value, error, className, onValueChange }: CurriculumSubjectFieldInputProps) {
  const inputName = field.system_key
  const inputType = field.type === "numero" || field.type === "entero" ? "number" : "text"
  const maxValue = inputType !== "number" ? undefined : field.system_key === "horas_totales" ? 32767 : field.type === "numero" ? 9999.99 : 9999
  const isCalculatedTotal = field.system_key === "horas_totales"

  return (
    <Field className={className} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={inputId} required>
        {field.label}
      </FieldLabel>
      {field.type === "booleano" ? (
        <Select name={inputName} value={String(value)} onValueChange={onValueChange}>
          <SelectTrigger id={inputId} className="w-full" aria-required="true" aria-invalid={Boolean(error)}>
            <SelectValue placeholder="Seleccione una opción" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="true">Sí</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={inputId}
          name={inputName}
          type={inputType}
          step={field.type === "numero" ? "0.01" : undefined}
          min={inputType === "number" ? 0 : undefined}
          max={maxValue}
          value={value}
          placeholder={field.type === "texto" ? `Ej. ${field.label}` : undefined}
          readOnly={isCalculatedTotal}
          aria-readonly={isCalculatedTotal || undefined}
          aria-required="true"
          aria-invalid={Boolean(error)}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
      <FieldError errors={[error]} />
    </Field>
  )
}
