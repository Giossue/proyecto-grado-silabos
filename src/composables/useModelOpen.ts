import { useState } from "react"

export function useModelOpen(open: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined): [boolean, (open: boolean) => void] {
  const [local, setLocal] = useState(false)
  const current = open ?? local
  const update = (value: boolean): void => {
    if (open === undefined) setLocal(value)
    onOpenChange?.(value)
  }

  return [current, update]
}

export function useOpened(open: boolean, onOpened: () => void, immediate = false): void {
  const [wasOpen, setWasOpen] = useState(immediate ? !open : open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) onOpened()
  }
}
