"use client"

import { ChoiceGroup } from "@/components/domain/ChoiceGroup"

type BooleanChoiceProps = { value: boolean | null; label: string; disabled?: boolean; onValueChange: (value: boolean) => void }

const options = [
  { value: "true", label: "Sí" },
  { value: "false", label: "No" },
]

export function BooleanChoice({ value, label, disabled, onValueChange }: BooleanChoiceProps) {
  const update = (next: unknown): void => {
    if (next === "true" || next === "false") onValueChange(next === "true")
  }

  return <ChoiceGroup value={value === null ? undefined : String(value)} label={label} options={options} disabled={disabled} onValueChange={update} />
}
