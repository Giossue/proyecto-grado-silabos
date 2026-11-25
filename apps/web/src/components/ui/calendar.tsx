"use client"

import * as React from "react"
import { cn } from "cn"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker"
import { es } from "react-day-picker/locale"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"

const LOCALE = "es-EC"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  weekStartsOn = 0,
  locale = es,
  formatters,
  labels,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      weekStartsOn={weekStartsOn}
      locale={locale}
      className={cn("p-3", className)}
      formatters={{
        formatCaption: (date) =>
          date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }),
        formatMonthDropdown: (date) =>
          date.toLocaleDateString(LOCALE, { month: "short" }),
        formatWeekdayName: (date) =>
          date.toLocaleDateString(LOCALE, { weekday: "narrow" }),
        ...formatters,
      }}
      labels={{
        labelPrevious: () => "Mes anterior",
        labelNext: () => "Mes siguiente",
        ...labels,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "pointer-events-auto size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "pointer-events-auto size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "relative flex h-7 w-full items-center justify-center px-8",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex items-center justify-center gap-1",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "border-border relative h-8 rounded-md border bg-field shadow-control transition-[color,box-shadow] hover:bg-accent has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn("absolute inset-0 opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "text-sm font-medium select-none",
          captionLayout !== "label" &&
            "flex h-full items-center gap-1 pr-1 pl-2 font-normal [&>svg]:size-4 [&>svg]:text-muted-foreground [&>svg]:opacity-50",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground flex-1 rounded-md text-[0.8rem] font-normal",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn(
          "relative flex-1 p-0 text-center text-sm focus-within:relative focus-within:z-20 data-[selected=true]:rounded-md data-[selected=true]:bg-accent",
          defaultClassNames.day
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => (
          <div
            data-slot="calendar"
            ref={rootRef}
            className={cn(className)}
            {...props}
          />
        ),
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon className={cn("size-4", className)} {...props} />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      type="button"
      data-slot="calendar-cell-trigger"
      data-day={day.date.toLocaleDateString(LOCALE)}
      data-today={modifiers.today || undefined}
      data-selected={modifiers.selected || undefined}
      data-disabled={modifiers.disabled || undefined}
      data-outside-view={modifiers.outside || undefined}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "size-8 p-0 font-normal aria-selected:opacity-100 cursor-default",
        "[&[data-today]:not([data-selected])]:bg-accent [&[data-today]:not([data-selected])]:text-accent-foreground",
        "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:opacity-100 [&[data-selected]:hover]:bg-primary data-[selected]:hover:text-primary-foreground data-[selected]:focus:bg-primary data-[selected]:focus:text-primary-foreground",
        "data-[disabled]:text-muted-foreground data-[disabled]:opacity-50",
        "data-[outside-view]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
