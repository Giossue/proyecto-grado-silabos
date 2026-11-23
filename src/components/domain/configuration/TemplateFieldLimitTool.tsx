"use client"

import { TextCursorInput } from "lucide-react"
import { useId, useState, type FormEvent } from "react"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOpened } from "@/composables/useModelOpen"
import { FIELD_LIMIT_MAX, FIELD_LIMIT_MIN, formatCharacters } from "@/lib/fieldLimits"

type TemplateFieldLimitToolProps = {
  limit?: number | null
  selected?: boolean
  editable?: boolean
  disabled?: boolean
  onApply: (limit: number | null) => void
}

const LABEL = "Límite de caracteres"

export function TemplateFieldLimitTool({ limit = null, selected = false, editable = false, disabled = false, onApply }: TemplateFieldLimitToolProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [tried, setTried] = useState(false)
  const tooltip = !selected ? `${LABEL}: elija un campo` : editable ? LABEL : `${LABEL}: solo en campos editables`
  const value = /^\d+$/.test(draft.trim()) ? Number(draft.trim()) : null
  const error = value === null || value < FIELD_LIMIT_MIN || value > FIELD_LIMIT_MAX ? `Escriba un número entre ${FIELD_LIMIT_MIN} y ${formatCharacters(FIELD_LIMIT_MAX)}` : ""

  useOpened(open, () => {
    setDraft(limit ? String(limit) : "")
    setTried(false)
  })

  const apply = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setTried(true)
    if (error) return
    onApply(value)
    setOpen(false)
  }
  const remove = (): void => {
    onApply(null)
    setOpen(false)
  }

  return (
    <MenuTooltip label={tooltip}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant={limit ? "secondary" : "ghost"} size="icon-sm" aria-label={LABEL} disabled={!selected || !editable || disabled} data-field-limit-tool onMouseDown={(event) => event.preventDefault()}>
            <TextCursorInput aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form noValidate onSubmit={apply}>
            <FieldGroup>
              <Field data-invalid={tried && error ? true : undefined}>
                <FieldLabel htmlFor={`${id}-limit`}>{LABEL}</FieldLabel>
                <Input id={`${id}-limit`} value={draft} inputMode="numeric" autoComplete="off" placeholder="500" data-field-limit-input onChange={(event) => setDraft(event.target.value)} />
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
