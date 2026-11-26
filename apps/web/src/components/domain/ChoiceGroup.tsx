"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type ChoiceGroupProps = {
  value?: string
  options: Array<{ value: string; label: string }>
  label: string
  disabled?: boolean
  className?: string
  /** Choosing the marked option again unmarks it (the value becomes empty). */
  clearable?: boolean
  onValueChange: (value: string) => void
}

const TOGGLE_CHOICE =
  "h-8 border border-border bg-background px-3 shadow-control disabled:pointer-events-auto disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"

export function ChoiceGroup({ value, options, label, disabled, className, clearable = false, onValueChange }: ChoiceGroupProps) {
  if (clearable) {
    return (
      <ToggleGroup type="single" value={value ?? ""} aria-label={label} disabled={disabled} className={cn("flex-wrap", className)} onValueChange={onValueChange}>
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className={TOGGLE_CHOICE}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  return (
    <RadioGroup
      value={value}
      aria-label={label}
      disabled={disabled}
      orientation="horizontal"
      className={cn("flex flex-wrap gap-2", className)}
      onValueChange={onValueChange}
    >
      {options.map((option) => (
        <RadioGroupItem key={option.value} value={option.value} variant="choice">
          {option.label}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  )
}
