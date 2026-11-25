import { compareReviews, getCoordinationHistory, getReview, getReviews } from "@/api/reviews"
import { getSession } from "@/api/session"
import { NO_SORT, sortParams, withSortParams, type ServerSortState } from "@/composables/useServerSort"

export type CoordinationHistoryFilters = { q: string; period: string; sort: string; dir: string }

export const reviewKeys = {
  all: ["reviews"] as const,
  queue: (page: number, search: string, sort: ServerSortState = NO_SORT) => ["reviews", "queue", page, search, sort] as const,
  history: (page: number, filters: CoordinationHistoryFilters) => ["reviews", "history", page, filters] as const,
  detail: (revisionId: string) => ["reviews", "detail", revisionId] as const,
  comparison: (previousId: string, currentId: string) => ["reviews", "comparison", previousId, currentId] as const,
}

export const coordinationQueueQuery = (page: number, search: string, sort: ServerSortState = NO_SORT) => ({
  queryKey: reviewKeys.queue(page, search, sort),
  queryFn: async () => {
    const session = await getSession()
    if (session.active_role?.code !== "coordinador") return null

    return getReviews({ search, ...sortParams(sort), page })
  },
})

export const coordinationHistoryQuery = (page: number, filters: CoordinationHistoryFilters) => ({
  queryKey: reviewKeys.history(page, filters),
  queryFn: () => getCoordinationHistory({ ...withSortParams(filters), page }),
})

export const reviewQuery = (revisionId: string) => ({
  queryKey: reviewKeys.detail(revisionId),
  queryFn: () => getReview(revisionId),
})

export const reviewComparisonQuery = (previousId: string, currentId: string) => ({
  queryKey: reviewKeys.comparison(previousId, currentId),
  queryFn: () => compareReviews(previousId, currentId),
})
