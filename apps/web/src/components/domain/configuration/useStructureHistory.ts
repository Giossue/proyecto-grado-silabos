import { useRef, useState } from "react"

type StructureHistoryOptions<T> = {
  capture: () => T
  restore: (state: T) => void
  limit?: number
  coalesceMs?: number
}

export function useStructureHistory<T>({ capture, restore, limit = 50, coalesceMs = 1000 }: StructureHistoryOptions<T>) {
  const past = useRef<string[]>([])
  const future = useRef<string[]>([])
  const last = useRef<{ group: string | null; at: number }>({ group: null, at: 0 })
  const [sizes, setSizes] = useState({ past: 0, future: 0 })
  const sync = (): void => setSizes({ past: past.current.length, future: future.current.length })

  const record = (group?: string): void => {
    const now = Date.now()
    if (group && group === last.current.group && now - last.current.at < coalesceMs) {
      last.current.at = now
      return
    }
    past.current.push(JSON.stringify(capture()))
    if (past.current.length > limit) past.current.shift()
    future.current = []
    last.current = { group: group ?? null, at: now }
    sync()
  }
  const step = (from: { current: string[] }, to: { current: string[] }): boolean => {
    const state = from.current.pop()
    if (state === undefined) return false
    to.current.push(JSON.stringify(capture()))
    last.current.group = null
    restore(JSON.parse(state) as T)
    sync()
    return true
  }
  const undo = (): boolean => step(past, future)
  const redo = (): boolean => step(future, past)
  const reset = (): void => {
    past.current = []
    future.current = []
    last.current.group = null
    sync()
  }

  return { record, undo, redo, reset, canUndo: sizes.past > 0, canRedo: sizes.future > 0 }
}
