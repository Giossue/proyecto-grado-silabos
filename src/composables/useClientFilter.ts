import { useCallback, useMemo, useState } from "react"

export type SearchableFields<T> = (item: T) => (string | null | undefined)[]

export type ClientFilterDefinition<T> = {
  initial?: string
  matches: (item: T, value: string) => boolean
}

export type UseClientFilterReturn<T> = {
  search: string
  setSearch: (value: string) => void
  values: Record<string, string>
  setValue: (key: string, value: string) => void
  items: T[]
  active: boolean
  criteria: string
  clear: () => void
}

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

export function useClientFilter<T>(
  source: T[],
  searchable: SearchableFields<T>,
  filters: Record<string, ClientFilterDefinition<T>> = {},
): UseClientFilterReturn<T> {
  const [search, setSearch] = useState("")
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(filters).map(([key, definition]) => [key, definition.initial ?? "all"])),
  )

  const items = useMemo(() => {
    const term = normalize(search.trim())

    return source.filter((item) => {
      if (term !== "") {
        const haystack = searchable(item)
          .filter((value): value is string => Boolean(value))
          .map(normalize)
          .join(" ")
        if (!haystack.includes(term)) return false
      }

      for (const [key, definition] of Object.entries(filters)) {
        const value = values[key] ?? "all"
        if (value !== "all" && !definition.matches(item, value)) return false
      }

      return true
    })
  }, [source, search, values, searchable, filters])

  const setValue = useCallback((key: string, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }))
  }, [])

  const clear = useCallback((): void => {
    setSearch("")
    setValues((current) => Object.fromEntries(Object.keys(current).map((key) => [key, "all"])))
  }, [])

  const active = search.trim() !== "" || Object.values(values).some((value) => value !== "all")
  const criteria = JSON.stringify([search, Object.values(values)])

  return { search, setSearch, values, setValue, items, active, criteria, clear }
}
