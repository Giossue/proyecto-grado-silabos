import { AsyncLocalStorage } from "node:async_hooks"

const values = new AsyncLocalStorage<ReadonlyMap<string, unknown>>()

export function runWithValidationContext<T>(entries: Record<string, unknown>, work: () => T): T {
  return values.run(new Map(Object.entries(entries)), work)
}

export function validationContextValue<T>(key: string): T | undefined {
  return values.getStore()?.get(key) as T | undefined
}
