"use client"

import { useId } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { conditionSourceKey as sourceKey, type ConditionChoice, type ConditionSource } from "@/lib/responseConditions"

type TemplateConditionPickerProps = {
  sources: ConditionSource[]
  value: ConditionChoice
  onValueChange: (value: ConditionChoice) => void
  disabled?: boolean
  hint?: string
}

const ALWAYS = "siempre"

export function TemplateConditionPicker({ sources, value, onValueChange, disabled = false, hint = "" }: TemplateConditionPickerProps) {
  const id = useId()
  const selected = sources.find((source) => sourceKey(source) === value.source) ?? null
  const chooseSource = (next: string): void => onValueChange({ source: next !== ALWAYS ? next : "", options: [] })
  const toggle = (option: string, checked: boolean | "indeterminate"): void => {
    const options = checked === true ? [...value.options, option] : value.options.filter((item) => item !== option)
    onValueChange({ ...value, options: selected ? selected.options.map((item) => item.const).filter((key) => options.includes(key)) : options })
  }

  return (
    <Field data-condition-picker>
      <FieldLabel htmlFor={`${id}-source`}>Mostrar solo si</FieldLabel>
      <Select value={value.source || ALWAYS} disabled={disabled} onValueChange={chooseSource}>
        <SelectTrigger id={`${id}-source`} data-condition-source>
          <SelectValue placeholder="Siempre" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ALWAYS}>Siempre</SelectItem>
            {sources.map((source) => (
              <SelectItem key={sourceKey(source)} value={sourceKey(source)}>
                {source.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {hint && sources.length > 0 ? <FieldDescription data-condition-hint>{hint}</FieldDescription> : null}
      {sources.length === 0 ? <FieldDescription>Ponga antes una respuesta de elegir una o varias para usarla aquí</FieldDescription> : null}
      {selected ? (
        <div className="flex flex-col gap-2 pt-1" role="group" aria-label={`Opciones de ${selected.label}`}>
          <span className="text-sm text-muted-foreground">si eligió alguna de:</span>
          {selected.options.map((option) => (
            <Field key={option.const} orientation="horizontal">
              <Checkbox
                id={`${id}-${option.const}`}
                checked={value.options.includes(option.const)}
                disabled={disabled}
                data-condition-option={option.const}
                onCheckedChange={(checked) => toggle(option.const, checked)}
              />
              <FieldLabel htmlFor={`${id}-${option.const}`} className="font-normal">
                {option.title}
              </FieldLabel>
            </Field>
          ))}
        </div>
      ) : null}
    </Field>
  )
}
