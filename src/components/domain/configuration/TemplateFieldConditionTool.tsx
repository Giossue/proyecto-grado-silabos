"use client"

import { ListFilter } from "lucide-react"
import { useState } from "react"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { TemplateConditionPicker } from "@/components/domain/syllabus/TemplateConditionPicker"
import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOpened } from "@/composables/useModelOpen"
import { fieldMessage, useSchemaForm } from "@/lib/forms"
import { choiceOf, conditionSourceKey, type ConditionChoice, type ConditionSource, type ResponseCondition } from "@/lib/responseConditions"
import { conditionChoiceSchema } from "@/schemas/template"

type TemplateFieldConditionToolProps = {
  condition?: ResponseCondition | null
  sources: ConditionSource[]
  allowed?: boolean
  disabled?: boolean
  onApply: (source: ConditionSource | null, options: string[]) => void
}

const LABEL = "Mostrar solo si…"

export function TemplateFieldConditionTool({ condition = null, sources, allowed = false, disabled = false, onApply }: TemplateFieldConditionToolProps) {
  const [open, setOpen] = useState(false)
  const form = useSchemaForm(conditionChoiceSchema, { defaultValues: { source: "", options: [] }, mode: "onChange", reValidateMode: "onChange" })
  const choice: ConditionChoice = { source: form.watch("source") ?? "", options: form.watch("options") ?? [] }
  const tooltip = allowed ? LABEL : `${LABEL}: elija un campo`
  const error = fieldMessage(form.formState.errors, "options") ?? ""

  useOpened(open, () => form.reset(choiceOf(condition, sources)))

  const setChoice = (next: ConditionChoice): void => {
    form.setValue("source", next.source)
    form.setValue("options", next.options, { shouldValidate: true })
  }

  const apply = form.handleSubmit(({ source: chosen, options }) => {
    const source = sources.find((item) => conditionSourceKey(item) === chosen) ?? null
    onApply(source, source ? options : [])
    setOpen(false)
  })
  const remove = (): void => {
    onApply(null, [])
    setOpen(false)
  }

  return (
    <MenuTooltip label={tooltip}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant={condition ? "secondary" : "ghost"} size="icon-sm" aria-label={LABEL} disabled={!allowed || disabled} data-field-condition-tool onMouseDown={(event) => event.preventDefault()}>
            <ListFilter aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-(--overlay-max-height) w-80 overflow-y-auto">
          <form noValidate onSubmit={(event) => void apply(event)}>
            <FieldGroup>
              <TemplateConditionPicker value={choice} sources={sources} onValueChange={setChoice} />
              {error ? <FieldError data-field-condition-error>{error}</FieldError> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" className="w-fit" disabled={Boolean(error)} data-field-condition-apply>
                  Aplicar
                </Button>
                {condition ? (
                  <Button type="button" variant="outline" size="sm" className="w-fit" data-field-condition-remove onClick={remove}>
                    Quitar condición
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
