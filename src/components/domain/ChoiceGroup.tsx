"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

type ChoiceGroupProps = {
  value?: string
  options: Array<{ value: string; label: string }>
  label: string
  disabled?: boolean
  className?: string
  onValueChange: (value: string) => void
}

export function ChoiceGroup({ value, options, label, disabled, className, onValueChange }: ChoiceGroupProps) {
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
