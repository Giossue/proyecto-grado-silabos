"use client"

import { DateFormatter, getLocalTimeZone, parseDate, type CalendarDate } from "@internationalized/date"
import { CalendarDays, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useInstitutionCalendarDate } from "@/composables/useInstitutionDate"
import { cn } from "@/lib/utils"

type DatePickerProps = {
  id: string
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  required?: boolean
  ariaInvalid?: boolean
  disabled?: boolean
  minValue?: string
  maxValue?: string
  placeholder?: string
}

const formatter = new DateFormatter("es-EC", { dateStyle: "medium" })

const parse = (value: string | undefined): CalendarDate | undefined => {
  if (!value) return undefined
  try {
    return parseDate(value)
  } catch {
    return undefined
  }
}

const toDate = (value: CalendarDate): Date => value.toDate(getLocalTimeZone())

const fromDate = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  required = false,
  ariaInvalid = false,
  disabled = false,
  minValue,
  maxValue,
  placeholder = "Elegir fecha",
}: DatePickerProps) {
  const [local, setLocal] = useState(defaultValue ?? "")
  const model = value ?? local
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const announced = useRef(model)
  const [open, setOpen] = useState(false)
  const selected = parse(model)
  const minimum = parse(minValue)
  const maximum = parse(maxValue)
  const today = useInstitutionCalendarDate()
  const start = minimum ?? today.cycle("year", -5)
  const end = maximum ?? today.cycle("year", 10)
  const label = selected === undefined ? placeholder : formatter.format(toDate(selected))

  useEffect(() => {
    if (announced.current === model) return
    announced.current = model
    field.current?.dispatchEvent(new Event("input", { bubbles: true }))
  }, [model])

  const select = (date: Date | undefined): void => {
    const next = date ? fromDate(date) : ""
    if (value === undefined) setLocal(next)
    onValueChange?.(next)
    setOpen(false)
    root.current?.dispatchEvent(new Event("change", { bubbles: true }))
  }

  const disabledDays = [...(minimum ? [{ before: toDate(minimum) }] : []), ...(maximum ? [{ after: toDate(maximum) }] : [])]

  return (
    <div ref={root} data-slot="date-picker">
      {required ? (
        <input
          ref={field}
          type="text"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          aria-required="true"
          name={name}
          value={model}
          readOnly
          onFocus={(event) => event.currentTarget.blur()}
        />
      ) : (
        <input ref={field} type="hidden" name={name} value={model} />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            aria-required={required}
            className={cn("w-full justify-start font-normal", selected === undefined && "text-muted-foreground")}
          >
            <CalendarDays data-icon="inline-start" aria-hidden="true" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected ? toDate(selected) : undefined}
            onSelect={select}
            defaultMonth={toDate(selected ?? today)}
            captionLayout="dropdown"
            startMonth={toDate(start.set({ month: 1, day: 1 }))}
            endMonth={toDate(end.set({ month: 12, day: 31 }))}
            disabled={disabledDays}
            autoFocus
            className="p-3"
          />
          {!required && selected !== undefined ? (
            <div className="border-t p-2">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-center" onClick={() => select(undefined)}>
                <X data-icon="inline-start" aria-hidden="true" />
                Quitar fecha
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
