import { useCallback, useState } from "react"
import type { CurriculumBuilderSubject, FixedSubjectField } from "@/types/academic"

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

  const valueFor = (field: FixedSubjectField): number | string => current[fieldKey(field)] ?? ""

  const updateValue = useCallback((field: FixedSubjectField, value: unknown): void => {
    setValues((previous) => ({ ...previous, [fieldKey(field)]: normalizedValue(value) }))
  }, [])

  return { reset, updateValue, valueFor }
}
