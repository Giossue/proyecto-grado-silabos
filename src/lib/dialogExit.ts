import { useState } from "react"

export const DIALOG_EXIT_MS = 200

export const afterDialogExit = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, DIALOG_EXIT_MS)
  })

export const useShownWhileClosing = <T>(value: T | null | undefined): T | null => {
  const [shown, setShown] = useState<T | null>(value ?? null)
  if (value !== null && value !== undefined && !Object.is(value, shown)) setShown(value)

  return value ?? shown
}
