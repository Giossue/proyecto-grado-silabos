import { getLibraryHistory, getLibraryReview, getLibraryReviews } from "@/api/library"
import { sortParams, withSortParams } from "@/composables/useServerSort"

export type LibraryReviewFilters = { q: string; state: string; faculty: string; sort: string; dir: string }
export type LibraryHistoryFilters = { q: string; faculty: string; period: string; who: string; sort: string; dir: string }

export const libraryKeys = {
  all: ["library"] as const,
  reviews: (page: number, filters: LibraryReviewFilters) => ["library", "reviews", page, filters] as const,
  history: (page: number, filters: LibraryHistoryFilters) => ["library", "history", page, filters] as const,
  review: (revisionId: string) => ["library", "review", revisionId] as const,
}

export const libraryReviewsQuery = (page: number, filters: LibraryReviewFilters) => ({
  queryKey: libraryKeys.reviews(page, filters),
  queryFn: () => getLibraryReviews({ ...withSortParams(filters), page }),
})

export const libraryHistoryQuery = (page: number, filters: LibraryHistoryFilters) => ({
  queryKey: libraryKeys.history(page, filters),
  queryFn: () => getLibraryHistory({ q: filters.q, faculty: filters.faculty, period: filters.period, mine: filters.who === "mine", ...sortParams(filters), page }),
})

export const libraryReviewQuery = (revisionId: string) => ({
  queryKey: libraryKeys.review(revisionId),
  queryFn: () => getLibraryReview(revisionId),
})
