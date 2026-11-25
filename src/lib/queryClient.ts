import { hashKey, isServer, notifyManager, QueryClient, type QueryKey } from "@tanstack/react-query"
import { ApiError } from "@/api/client"
import type { ReadonlySignal } from "@/lib/signal"

const MAX_RETRIES = 2

const shouldRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_RETRIES && !(error instanceof ApiError && error.status < 500)

export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })

let browserQueryClient: QueryClient | undefined

export const getQueryClient = (): QueryClient => {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()

  return browserQueryClient
}

export const cachedValue = <T>(queryKey: () => QueryKey | null, fallback: T): ReadonlySignal<T> => ({
  get value() {
    const key = queryKey()

    return key ? (getQueryClient().getQueryData<T>(key) ?? fallback) : fallback
  },
  subscribe(listener) {
    return getQueryClient()
      .getQueryCache()
      .subscribe((event) => {
        const key = queryKey()
        if (key && event.query.queryHash === hashKey(key)) notifyManager.schedule(listener)
      })
  },
})

export const errorMessage = (error: unknown, fallback: string): string => (error instanceof ApiError ? error.message : fallback)

export const sameKey = (first: unknown, second: unknown): boolean => hashKey([first]) === hashKey([second])

type QueryErrorState = { isError: boolean; isFetching: boolean; error: unknown }

export const failedQuery = (query: QueryErrorState): boolean => query.isError && !query.isFetching

export const queryErrorMessage = (query: QueryErrorState, fallback: string): string | null => (failedQuery(query) ? errorMessage(query.error, fallback) : null)
