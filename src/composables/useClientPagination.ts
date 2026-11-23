import { useCallback, useMemo, useState } from "react"
import type { PaginationMeta } from "@/types/pagination"

type ClientPagination<T> = {
  currentPage: number
  items: T[]
  meta: PaginationMeta
  setPage: (page: number) => void
}

export function useClientPagination<T>(source: T[], requestedPageSize = 20, resetOn?: unknown): ClientPagination<T> {
  const pageSize = Math.max(1, requestedPageSize)
  const [page, setRequestedPage] = useState(1)
  const [resetKey, setResetKey] = useState(resetOn)
  const total = source.length
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  let currentPage = page
  if (!Object.is(resetKey, resetOn)) {
    setResetKey(resetOn)
    if (resetOn !== undefined) currentPage = 1
  }
  currentPage = Math.min(Math.max(1, currentPage), lastPage)
  if (currentPage !== page) setRequestedPage(currentPage)

  const setPage = useCallback((next: number): void => setRequestedPage(Math.min(Math.max(1, next), lastPage)), [lastPage])

  const items = useMemo(() => {
    const start = (currentPage - 1) * pageSize

    return source.slice(start, start + pageSize)
  }, [source, currentPage, pageSize])

  const meta = useMemo<PaginationMeta>(() => {
    const from = total === 0 ? null : (currentPage - 1) * pageSize + 1

    return {
      current_page: currentPage,
      last_page: lastPage,
      per_page: pageSize,
      from,
      to: from === null ? null : Math.min(from + pageSize - 1, total),
      total,
    }
  }, [currentPage, lastPage, pageSize, total])

  return { currentPage, items, meta, setPage }
}
