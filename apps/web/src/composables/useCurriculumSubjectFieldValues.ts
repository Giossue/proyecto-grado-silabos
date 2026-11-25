import { useCallback, useState } from "react"
import type { CurriculumBuilderSubject, FixedSubjectField } from "@/types/academic"

const HOUR_COMPONENT_KEYS = new Set(["horas_ac", "horas_pae", "horas_aa"])

const fieldKey = (field: FixedSubjectField): string => field.system_key

const normalizedValue = (value: unknown): number | string => {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value !== "number" && typeof value !== "string") return ""

  return value
}

const storedValue = (field: FixedSubjectField, value: unknown): number | string => {
  const normalized = normalizedValue(value)
  if ((field.type === "numero" || field.type === "entero") && typeof normalized === "string" && normalized !== "") {
    const parsed = Number(normalized)

    return Number.isFinite(parsed) ? parsed : normalized
  }

  return normalized
}

const numericValue = (value: number | string): number => {
  if (value === "") return 0
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

const valuesOf = (subject: CurriculumBuilderSubject | null, definitions: FixedSubjectField[]): Record<string, number | string> =>
  Object.fromEntries(definitions.map((field) => [fieldKey(field), storedValue(field, subject?.system_values[field.system_key])]))

export function useCurriculumSubjectFieldValues(subject: CurriculumBuilderSubject | null, definitions: FixedSubjectField[]) {
  const [source, setSource] = useState({ subject, definitions })
  const [values, setValues] = useState<Record<string, number | string>>(() => valuesOf(subject, definitions))

  let current = values
  if (source.subject !== subject || source.definitions !== definitions) {
    setSource({ subject, definitions })
    current = valuesOf(subject, definitions)
    setValues(current)
  }

  const reset = useCallback((): void => setValues(valuesOf(subject, definitions)), [subject, definitions])

  const totalHours = definitions
    .filter((field) => HOUR_COMPONENT_KEYS.has(field.system_key))
    .reduce((total, field) => total + numericValue(current[fieldKey(field)] ?? ""), 0)

  const valueFor = (field: FixedSubjectField): number | string =>
    field.system_key === "horas_totales" ? totalHours : (current[fieldKey(field)] ?? "")

  const updateValue = useCallback((field: FixedSubjectField, value: unknown): void => {
    if (field.system_key === "horas_totales") return
    setValues((previous) => ({ ...previous, [fieldKey(field)]: normalizedValue(value) }))
  }, [])

  return { reset, totalHours, updateValue, valueFor }
}
