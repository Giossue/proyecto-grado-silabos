import { ApiError } from "@/api/client"
import { getSession, type Session } from "@/api/session"
import { signal, useSignal, type ReadonlySignal } from "@/lib/signal"

const current = signal<Session | null>(null)
const loaded = signal(false)
let pending: Promise<Session | null> | null = null

const load = async (force = false): Promise<Session | null> => {
  if (loaded.value && !force) return current.value
  if (pending && !force) return pending

  pending = getSession()
    .then((session) => {
      current.value = session
      loaded.value = true
      return session
    })
    .catch((reason: unknown) => {
      if (reason instanceof ApiError && reason.status === 401) {
        current.value = null
        loaded.value = true
        return null
      }
      throw reason
    })
    .finally(() => {
      pending = null
    })

  return pending
}

const replace = (session: Session | null): void => {
  current.value = session
  loaded.value = true
}

const clear = (): void => replace(null)

export const sessionState = {
  current: current as ReadonlySignal<Session | null>,
  loaded: loaded as ReadonlySignal<boolean>,
  load,
  replace,
  clear,
}

export const useSession = () => ({
  session: useSignal(current),
  loaded: useSignal(loaded),
})
