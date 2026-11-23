import { useSyncExternalStore } from "react"

export type ReadonlySignal<T> = {
  readonly value: T
  subscribe: (listener: () => void) => () => void
}

export type Signal<T> = ReadonlySignal<T> & { value: T }

export const signal = <T>(initial: T): Signal<T> => {
  let current = initial
  const listeners = new Set<() => void>()

  return {
    get value() {
      return current
    },
    set value(next: T) {
      if (Object.is(next, current)) return
      current = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const useSignal = <T>(source: ReadonlySignal<T>): T =>
  useSyncExternalStore(
    source.subscribe,
    () => source.value,
    () => source.value,
  )
