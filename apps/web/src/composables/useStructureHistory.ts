import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"

type StructureHistoryOptions<T> = {
  capture: () => T
  restore: (state: T) => void
  limit?: number
  coalesceMs?: number
}

export type StructureHistory = {
  record: (group?: string) => void
  undo: () => boolean
  redo: () => boolean
  reset: () => void
  canUndo: boolean
  canRedo: boolean
}

export const useStructureHistory = <T>({ capture, restore, limit = 50, coalesceMs = 1000 }: StructureHistoryOptions<T>): StructureHistory => {
  const past = useRef<string[]>([])
  const future = useRef<string[]>([])
  const lastGroup = useRef<string | null>(null)
  const lastAt = useRef(0)
  const latest = useRef({ capture, restore, limit, coalesceMs })
  useLayoutEffect(() => {
    latest.current = { capture, restore, limit, coalesceMs }
  })
  const [sizes, setSizes] = useState({ past: 0, future: 0 })

  const publish = useCallback((): void => {
    setSizes({ past: past.current.length, future: future.current.length })
  }, [])

  const record = useCallback(
    (group?: string): void => {
      const now = Date.now()
      if (group && group === lastGroup.current && now - lastAt.current < latest.current.coalesceMs) {
        lastAt.current = now
        return
      }
      past.current.push(JSON.stringify(latest.current.capture()))
      if (past.current.length > latest.current.limit) past.current.shift()
      future.current = []
      lastGroup.current = group ?? null
      lastAt.current = now
      publish()
    },
    [publish],
  )

  const step = useCallback(
    (from: { current: string[] }, to: { current: string[] }): boolean => {
      const state = from.current.pop()
      if (state === undefined) return false
      to.current.push(JSON.stringify(latest.current.capture()))
      lastGroup.current = null
      latest.current.restore(JSON.parse(state) as T)
      publish()

      return true
    },
    [publish],
  )

  const undo = useCallback((): boolean => step(past, future), [step])
  const redo = useCallback((): boolean => step(future, past), [step])
  const reset = useCallback((): void => {
    past.current = []
    future.current = []
    lastGroup.current = null
    publish()
  }, [publish])

  return useMemo(
    () => ({ record, undo, redo, reset, canUndo: sizes.past > 0, canRedo: sizes.future > 0 }),
    [record, undo, redo, reset, sizes],
  )
}
