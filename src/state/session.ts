import { ApiError } from "@/api/client"
import { getSession, type Session } from "@/api/session"
import { queryOptions } from "@tanstack/react-query"
import { cachedValue, getQueryClient } from "@/lib/queryClient"
import { useSignal, type ReadonlySignal } from "@/lib/signal"
import { sessionKeys } from "@/queries/session"

const fetchSession = async (): Promise<Session | null> => {
  try {
    return await getSession()
  } catch (reason) {
    if (reason instanceof ApiError && reason.status === 401) return null
    throw reason
  }
}

export const sessionQuery = queryOptions({ queryKey: sessionKeys.current, queryFn: fetchSession, gcTime: Infinity, retry: false })

getQueryClient().setQueryDefaults(sessionKeys.current, { queryFn: fetchSession, gcTime: Infinity, retry: false })

const current = cachedValue<Session | null>(() => sessionKeys.current, null)

const loaded: ReadonlySignal<boolean> = {
  get value() {
    return getQueryClient().getQueryState(sessionKeys.current)?.status === "success"
  },
  subscribe: current.subscribe,
}

const load = (force = false): Promise<Session | null> =>
  getQueryClient().fetchQuery({ ...sessionQuery, staleTime: force ? 0 : Infinity })

const replace = (session: Session | null): void => {
  getQueryClient().setQueryData<Session | null>(sessionKeys.current, session)
}

const clear = (): void => replace(null)

export const sessionState = {
  current,
  loaded,
  load,
  replace,
  clear,
}

export const useSession = () => ({
  session: useSignal(current),
  loaded: useSignal(loaded),
})
