"use client"

import { TextCursorInput } from "lucide-react"
import { useId, useState } from "react"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOpened } from "@/composables/useModelOpen"
import { FIELD_LIMIT_MAX, FIELD_LIMIT_MIN, formatCharacters } from "@/lib/fieldLimits"
import { fieldMessage, useSchemaForm } from "@/lib/forms"
import { fieldLimitFormSchema } from "@silabos/shared/schemas/template"

type TemplateFieldLimitToolProps = {
  limit?: number | null
  selected?: boolean
  editable?: boolean
  disabled?: boolean
  text?: string
  onApply: (limit: number | null) => void
}

const LABEL = "Límite de caracteres"
const limitSchema = fieldLimitFormSchema(`Escriba un número entre ${FIELD_LIMIT_MIN} y ${formatCharacters(FIELD_LIMIT_MAX)}`)

export function TemplateFieldLimitTool({ limit = null, selected = false, editable = false, disabled = false, text, onApply }: TemplateFieldLimitToolProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const form = useSchemaForm(limitSchema, { defaultValues: { limit: "" }, reValidateMode: "onChange" })
  const error = fieldMessage(form.formState.errors, "limit") ?? ""
  const tried = form.formState.isSubmitted
  const tooltip = !selected ? `${LABEL}: elija un campo` : editable ? LABEL : `${LABEL}: solo en campos editables`

  useOpened(open, () => form.reset({ limit: limit ? String(limit) : "" }))

  const apply = form.handleSubmit(({ limit: chosen }) => {
    onApply(Number(chosen))
    setOpen(false)
  })
  const remove = (): void => {
    onApply(null)
    setOpen(false)
  }

  return (
    <MenuTooltip label={tooltip}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant={limit ? "secondary" : "ghost"} size={text ? "sm" : "icon-sm"} aria-label={LABEL} disabled={!selected || !editable || disabled} data-field-limit-tool onMouseDown={(event) => event.preventDefault()}>
            <TextCursorInput data-icon={text ? "inline-start" : undefined} aria-hidden="true" />
            {text}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form noValidate onSubmit={(event) => void apply(event)}>
            <FieldGroup>
              <Field data-invalid={tried && error ? true : undefined}>
                <FieldLabel htmlFor={`${id}-limit`}>{LABEL}</FieldLabel>
                <Input id={`${id}-limit`} {...form.register("limit")} inputMode="numeric" autoComplete="off" placeholder="500" data-field-limit-input />
                <FieldDescription>Cuenta lo que escribe el docente en el campo: su texto y sus respuestas de texto.</FieldDescription>
                {tried && error ? <FieldError data-field-limit-error>{error}</FieldError> : null}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" className="w-fit" data-field-limit-apply>
                  Aplicar
                </Button>
                {limit ? (
                  <Button type="button" variant="outline" size="sm" className="w-fit" data-field-limit-remove onClick={remove}>
                    Quitar límite
                  </Button>
                ) : null}
              </div>
            </FieldGroup>
          </form>
        </PopoverContent>
      </Popover>
    </MenuTooltip>
  )
}
