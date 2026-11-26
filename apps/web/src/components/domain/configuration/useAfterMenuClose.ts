import { useRef } from "react"

export function useAfterMenuClose() {
  const pending = useRef<(() => void) | null>(null)
  const afterClose = (action: () => void) => (): void => {
    pending.current = action
  }
  const onCloseAutoFocus = (event: Event): void => {
    const action = pending.current
    if (!action) return
    pending.current = null
    event.preventDefault()
    action()
  }
  return { afterClose, onCloseAutoFocus }
}
