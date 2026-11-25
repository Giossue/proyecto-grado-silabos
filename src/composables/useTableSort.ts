import { useCallback, useMemo, useState } from "react"

export type SortDirection = "ascending" | "descending"

export type SortValue = string | number | Date | null | undefined

export type SortColumn<T> = {
  label: string
  type?: "text" | "number" | "date"
  value: (item: T) => SortValue
}

export type SortColumns<T> = Record<string, SortColumn<T>>

export type SortOption = { value: string; label: string }

export type TableSort<K extends string = string> = {
  sortKey: K | null
  direction: SortDirection
  sortBy: (key: K) => void
  choose: (value: string) => void
  selected: string
  options: SortOption[]
  announcement: string
  criteria: string
  headProps: (key: K) => { "aria-sort"?: SortDirection }
  labelOf: (key: K) => string
}

export const DEFAULT_SORT = "default"

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" })

const directionWords: Record<NonNullable<SortColumn<unknown>["type"]>, Record<SortDirection, string>> = {
  text: { ascending: "A a Z", descending: "Z a A" },
  number: { ascending: "de menor a mayor", descending: "de mayor a menor" },
  date: { ascending: "más antiguo primero", descending: "más reciente primero" },
}

const comparable = (value: SortValue, type: SortColumn<unknown>["type"]): string | number | null => {
  if (value === null || value === undefined || value === "") return null
  if (type === "date") {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
    return Number.isNaN(time) ? null : time
  }
  if (type === "number") {
    const number = typeof value === "number" ? value : Number(value)
    return Number.isNaN(number) ? null : number
  }
  return value instanceof Date ? value.toISOString() : String(value)
}

const compare = (left: string | number, right: string | number): number =>
  typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right))

export function useTableSort<T, C extends SortColumns<T>>(items: T[], columns: C): TableSort<Extract<keyof C, string>> & { items: T[] } {
  type K = Extract<keyof C, string>
  const [sort, setSort] = useState<{ key: K; direction: SortDirection } | null>(null)

  const sorted = useMemo(() => {
    if (sort === null) return items
    const column = columns[sort.key]
    if (!column) return items
    const factor = sort.direction === "ascending" ? 1 : -1
    const keyed = items.map((item) => ({ item, value: comparable(column.value(item), column.type) }))

    return keyed
      .toSorted((left, right) => {
        if (left.value === null && right.value === null) return 0
        if (left.value === null) return 1
        if (right.value === null) return -1
        return factor * compare(left.value, right.value)
      })
      .map((entry) => entry.item)
  }, [items, columns, sort])

  const sortBy = useCallback((key: K): void => {
    setSort((current) => (current?.key === key ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" }))
  }, [])

  const choose = useCallback(
    (value: string): void => {
      if (value === DEFAULT_SORT) {
        setSort(null)
        return
      }
      const [key, direction] = value.split(":") as [K, SortDirection]
      if (columns[key] && (direction === "ascending" || direction === "descending")) setSort({ key, direction })
    },
    [columns],
  )

  const options = useMemo<SortOption[]>(
    () => [
      { value: DEFAULT_SORT, label: "Orden predeterminado" },
      ...Object.entries(columns).flatMap(([key, column]) =>
        (["ascending", "descending"] as const).map((direction) => ({
          value: `${key}:${direction}`,
          label: `${column.label}: ${directionWords[column.type ?? "text"][direction]}`,
        })),
      ),
    ],
    [columns],
  )

  const count = sorted.length
  const announcement = sort
    ? `Ordenado por ${columns[sort.key]?.label ?? ""}, ${sort.direction === "ascending" ? "ascendente" : "descendente"}, ${count} ${count === 1 ? "fila" : "filas"}`
    : ""

  return {
    items: sorted,
    sortKey: sort?.key ?? null,
    direction: sort?.direction ?? "ascending",
    sortBy,
    choose,
    selected: sort ? `${sort.key}:${sort.direction}` : DEFAULT_SORT,
    options,
    announcement,
    criteria: sort ? `${sort.key}:${sort.direction}` : DEFAULT_SORT,
    headProps: (key: K) => (sort?.key === key ? { "aria-sort": sort.direction } : {}),
    labelOf: (key: K) => columns[key]?.label ?? key,
  }
}
