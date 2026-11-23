"use client"

import * as React from "react"

type FieldContextValue = { errorId: string; invalid: boolean }

export const FieldContext = React.createContext<FieldContextValue | null>(null)

export function useFieldError(): FieldContextValue | null {
  return React.useContext(FieldContext)
}

export function useFieldControl(
  describedBy?: string
): { "aria-invalid"?: boolean; "aria-describedby"?: string } {
  const field = React.useContext(FieldContext)
  if (!field?.invalid) return {}
  return {
    "aria-invalid": true,
    "aria-describedby": [describedBy ?? "", field.errorId]
      .filter(Boolean)
      .join(" "),
  }
}
