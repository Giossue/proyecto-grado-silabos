"use client"

import { Check, ListChecks, X } from "lucide-react"
import { useId, useState } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { characters, fitCharacters } from "@/lib/fieldLimits"
import { RESPONSE_KINDS, responseMany, responseRequired, responseSchema, responseSetting, type ResponseAttrs } from "@silabos/shared/lib/responseKinds"
import { cn } from "@/lib/utils"

type ResponseAnswerProps = {
  attrs: ResponseAttrs
  label: string
  disabled?: boolean
  askFor?: string
  budget?: number | null
  onValueChange: (value: unknown) => void
}

const isKey = (value: unknown): value is string => typeof value === "string" && value !== ""

const plural = (count: number): string => (count === 1 ? "1 opción" : `${count} opciones`)

const limitsOf = (attrs: ResponseAttrs): string => {
  if (!responseMany(attrs.kind)) return ""
  const min = attrs.minChoices
  const max = attrs.maxChoices
  if (min && max) return min === max ? `Elija ${plural(min)}` : `Elija de ${min} a ${max} opciones`
  if (min) return `Elija al menos ${plural(min)}`
  if (max) return `Elija como máximo ${plural(max)}`
  return ""
}

export function ResponseAnswer({ attrs, label, disabled = false, askFor = "al coordinador", budget = null, onValueChange }: ResponseAnswerProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const schema = responseSchema(attrs.kind, attrs.options, attrs)
  const many = responseMany(attrs.kind)
  const dropdown = !many && responseSetting(attrs, "display") === "desplegable"
  const optional = !responseRequired(attrs)
  const limits = limitsOf(attrs)
  const text = schema?.type === "string" && !("oneOf" in schema && schema.oneOf) ? schema : null
  const written = typeof attrs.value === "string" ? attrs.value : ""
  const own = text?.maxLength
  const maxLength = budget === null ? own : own === undefined ? written.length + Math.max(0, budget) : Math.min(own, written.length + Math.max(0, budget))
  const chosen = Array.isArray(attrs.value) ? attrs.value.filter(isKey) : isKey(attrs.value) ? [attrs.value] : []
  const title = (key: string): string => attrs.options.find((option) => option.const === key)?.title ?? key

  const write = (value: string): void => {
    if (budget === null) {
      onValueChange(value)
      return
    }
    const count = characters(written)
    onValueChange(fitCharacters(value, Math.max(count, count + budget)))
  }
  const choose = (value: unknown): void => {
    if (disabled) return
    if (many) {
      const picked = Array.isArray(value) ? value.filter(isKey) : []
      const next = [...chosen.filter((key) => picked.includes(key)), ...picked.filter((key) => !chosen.includes(key))]
      if (attrs.maxChoices && next.length > attrs.maxChoices && next.length > chosen.length) return
      onValueChange(next)
      return
    }
    onValueChange(isKey(value) ? value : null)
    setOpen(false)
  }
  const toggle = (key: string): void => {
    if (!many) {
      choose(key)
      return
    }
    choose(chosen.includes(key) ? chosen.filter((item) => item !== key) : [...chosen, key])
  }
  const remove = (key: string): void => {
    if (!disabled) onValueChange(many ? chosen.filter((item) => item !== key) : null)
  }
  const help = [attrs.help, limits, optional && !text ? "Opcional" : ""].filter(Boolean).join(" · ")

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", text && "w-full")}>
      {text ? (
        <Textarea
          className="min-h-9 w-full"
          placeholder={optional ? "Escriba aquí (opcional)" : "Escriba aquí"}
          aria-label={label}
          maxLength={maxLength}
          value={written}
          disabled={disabled}
          onChange={(event) => write(event.target.value)}
        />
      ) : dropdown ? (
        <div className="flex min-w-0 items-center gap-1" data-response-dropdown>
          <Select value={chosen[0] ?? ""} disabled={disabled || attrs.options.length === 0} onValueChange={choose}>
            <SelectTrigger className="w-fit min-w-40" aria-label={`Elegir en ${label}`}>
              <SelectValue placeholder={optional ? "Elegir (opcional)" : "Elegir"} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {attrs.options.map((option) => (
                  <SelectItem key={option.const} value={option.const}>
                    {option.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {chosen.length ? (
            <IconTooltip label="Quitar la respuesta">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar la respuesta" disabled={disabled} onClick={() => remove(chosen[0]!)}>
                <X aria-hidden="true" />
              </Button>
            </IconTooltip>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5" role="group" aria-label={label}>
          {chosen.length ? (
            <ul className="flex flex-col gap-1" aria-label={`Elegido en ${label}`}>
              {chosen.map((key) => (
                <li key={key} className="flex min-w-0 items-center gap-2 text-sm" data-response-chosen>
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="min-w-0 break-words">{title(key)}</span>
                  <IconTooltip label={`Quitar «${title(key)}»`}>
                    <Button type="button" variant="ghost" size="icon-sm" className="size-6 shrink-0 text-muted-foreground" aria-label={`Quitar «${title(key)}»`} disabled={disabled} onClick={() => remove(key)}>
                      <X aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                </li>
              ))}
            </ul>
          ) : null}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                aria-label={`Elegir en ${label}`}
                aria-controls={listId}
                aria-expanded={open}
                disabled={disabled || attrs.options.length === 0}
              >
                <ListChecks data-icon="inline-start" aria-hidden="true" />
                {chosen.length ? (many ? "Agregar o quitar" : "Elegir otra") : (RESPONSE_KINDS[attrs.kind]?.label ?? "Elegir")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <Command>
                <CommandList id={listId} aria-label={`Opciones de ${label}`}>
                  <CommandGroup>
                    {attrs.options.map((option) => (
                      <CommandItem key={option.const} value={option.const} onSelect={() => toggle(option.const)}>
                        <span className="flex-1">{option.title}</span>
                        {chosen.includes(option.const) ? <Check className="ml-auto" aria-hidden="true" /> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {attrs.options.length === 0 ? <p className="text-sm text-muted-foreground">No hay opciones para elegir: pídalas {askFor}</p> : null}
        </div>
      )}
      {help ? (
        <p className="text-sm text-muted-foreground" data-response-help>
          {help}
        </p>
      ) : null}
    </div>
  )
}
