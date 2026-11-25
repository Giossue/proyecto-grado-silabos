import type { QueryParams } from "./request"

const ON_EACH_SIDE = 3
const INT64_MAX = BigInt("9223372036854775807")
const INT64_MIN = -INT64_MAX - BigInt(1)

export function resolveCurrentPage(input: string | null): number {
  if (input === null || !/^[+-]?(0|[1-9]\d*)$/.test(input)) return 1
  const value = BigInt(input)
  if (value < INT64_MIN || value > INT64_MAX || value < BigInt(1)) return 1
  return Number(value)
}

export function phpRawUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase())
}

function buildQuery(parameters: Map<string, string | number | null>): string {
  const parts: string[] = []
  for (const [name, value] of parameters) {
    if (value === null) continue
    parts.push(`${phpRawUrlEncode(name)}=${phpRawUrlEncode(String(value))}`)
  }
  return parts.join("&")
}

type PaginatorInput<T> = {
  items: T[]
  total: number
  perPage: number
  currentPage: number
  path: string
  query: QueryParams
}

type PageLink = { url: string | null; label: string; page?: number | null; active: boolean }

export type LengthAwarePage<T> = {
  current_page: number
  data: T[]
  first_page_url: string
  from: number | null
  last_page: number
  last_page_url: string
  links: PageLink[]
  next_page_url: string | null
  path: string
  per_page: number
  prev_page_url: string | null
  to: number | null
  total: number
}

export function lengthAwarePaginator<T>({ items, total, perPage, currentPage, path, query }: PaginatorInput<T>): LengthAwarePage<T> {
  const lastPage = Math.max(Math.ceil(total / perPage), 1)
  const url = (page: number): string => {
    const parameters = new Map<string, string | number | null>([...query].filter(([name]) => name !== "page"))
    parameters.set("page", page <= 0 ? 1 : page)
    return `${path}${path.includes("?") ? "&" : "?"}${buildQuery(parameters)}`
  }
  const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index)
  const window = ON_EACH_SIDE + 4
  let elements: (number[] | "...")[]
  if (lastPage < ON_EACH_SIDE * 2 + 8) {
    elements = [range(1, lastPage)]
  } else if (currentPage <= window) {
    elements = [range(1, window + ON_EACH_SIDE), "...", range(lastPage - 1, lastPage)]
  } else if (currentPage > lastPage - window) {
    elements = [range(1, 2), "...", range(lastPage - (window + (ON_EACH_SIDE - 1)), lastPage)]
  } else {
    elements = [range(1, 2), "...", range(currentPage - ON_EACH_SIDE, currentPage + ON_EACH_SIDE), "...", range(lastPage - 1, lastPage)]
  }
  const hasMorePages = currentPage < lastPage
  const previousPageUrl = currentPage > 1 ? url(currentPage - 1) : null
  const nextPageUrl = hasMorePages ? url(currentPage + 1) : null
  const pageLinks: PageLink[] = elements.flatMap((element): PageLink[] =>
    element === "..."
      ? [{ url: null, label: "...", active: false }]
      : element.map((page) => ({ url: url(page), label: String(page), page, active: currentPage === page })),
  )
  const from = items.length > 0 ? (currentPage - 1) * perPage + 1 : null
  return {
    current_page: currentPage,
    data: items,
    first_page_url: url(1),
    from,
    last_page: lastPage,
    last_page_url: url(lastPage),
    links: [
      { url: previousPageUrl, label: "pagination.previous", page: currentPage > 1 ? currentPage - 1 : null, active: false },
      ...pageLinks,
      { url: nextPageUrl, label: "pagination.next", page: hasMorePages ? currentPage + 1 : null, active: false },
    ],
    next_page_url: nextPageUrl,
    path,
    per_page: perPage,
    prev_page_url: previousPageUrl,
    to: from === null ? null : from + items.length - 1,
    total,
  }
}
