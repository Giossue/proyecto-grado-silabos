import { useCallback, useEffect, useRef, useState } from "react"

export const useDiscardConfirmation = () => {
  const [open, setOpen] = useState(false)
  const pending = useRef<Promise<boolean> | null>(null)
  const resolver = useRef<((discard: boolean) => void) | null>(null)

  const decide = useCallback((discard: boolean): void => {
    setOpen(false)
    resolver.current?.(discard)
    resolver.current = null
    pending.current = null
  }, [])

  const ask = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current
    setOpen(true)
    const { promise, resolve } = Promise.withResolvers<boolean>()
    resolver.current = resolve
    pending.current = promise

    return pending.current
  }, [])

  useEffect(() => () => decide(false), [decide])

  return { open, ask, decide }
}
