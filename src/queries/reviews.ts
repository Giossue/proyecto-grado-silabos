import { compareReviews, getCoordinationHistory, getReview, getReviews } from "@/api/reviews"
import { getSession } from "@/api/session"

export type CoordinationHistoryFilters = { q: string; period: string }

export const reviewKeys = {
  all: ["reviews"] as const,
  queue: (page: number, search: string) => ["reviews", "queue", page, search] as const,
  history: (page: number, filters: CoordinationHistoryFilters) => ["reviews", "history", page, filters] as const,
  detail: (revisionId: string) => ["reviews", "detail", revisionId] as const,
  comparison: (previousId: string, currentId: string) => ["reviews", "comparison", previousId, currentId] as const,
}

export const coordinationQueueQuery = (page: number, search: string) => ({
  queryKey: reviewKeys.queue(page, search),
  queryFn: async () => {
    const session = await getSession()
    if (session.active_role?.code !== "coordinador") return null

    return getReviews({ search, page })
  },
})

export const coordinationHistoryQuery = (page: number, filters: CoordinationHistoryFilters) => ({
  queryKey: reviewKeys.history(page, filters),
  queryFn: () => getCoordinationHistory({ ...filters, page }),
})

export const reviewQuery = (revisionId: string) => ({
  queryKey: reviewKeys.detail(revisionId),
  queryFn: () => getReview(revisionId),
})

export const reviewComparisonQuery = (previousId: string, currentId: string) => ({
  queryKey: reviewKeys.comparison(previousId, currentId),
  queryFn: () => compareReviews(previousId, currentId),
})
