import { is, nullableField } from "./fields"

export const SORT_DIRECTIONS = ["asc", "desc"] as const

export type SortDir = (typeof SORT_DIRECTIONS)[number]

export type ListSort<K extends string = string> = { column: K; direction: SortDir } | null

export const MANAGED_USER_SORTS = ["name", "status"] as const
export const COORDINATION_REVIEW_SORTS = ["subject", "teacher", "revision", "submitted"] as const
export const COORDINATION_HISTORY_SORTS = ["subject", "code", "parallel", "author", "approved"] as const
export const LIBRARY_SORTS = ["faculty", "career", "subject", "responsible", "state", "period", "teacher", "signed"] as const

export type ManagedUserSort = (typeof MANAGED_USER_SORTS)[number]
export type CoordinationReviewSort = (typeof COORDINATION_REVIEW_SORTS)[number]
export type CoordinationHistorySort = (typeof COORDINATION_HISTORY_SORTS)[number]
export type LibrarySort = (typeof LIBRARY_SORTS)[number]

export function sortFields(columns: readonly string[]) {
  return {
    sort: nullableField("orden", [is.string(), is.oneOf(columns)]),
    dir: nullableField("dirección del orden", [is.string(), is.oneOf(SORT_DIRECTIONS)]),
  }
}

export function listSortOf<K extends string>(columns: readonly K[], sort: unknown, dir: unknown): ListSort<K> {
  if (typeof sort !== "string" || !(columns as readonly string[]).includes(sort)) return null
  return { column: sort as K, direction: dir === "desc" ? "desc" : "asc" }
}
