import { useCallback, useMemo } from "react"
import { DEFAULT_SORT, directionWords, type SortDirection, type SortOption, type TableSort } from "@/composables/useTableSort"
import type { SortDir } from "@silabos/shared/schemas/listSort"

export type ServerSortColumn = { label: string; type?: "text" | "number" | "date" }

export type ServerSortColumns = Record<string, ServerSortColumn>

export type ServerSortState = { sort: string; dir: string }

export const NO_SORT: ServerSortState = { sort: "", dir: "" }

const toDirection = (dir: string): SortDirection => (dir === "desc" ? "descending" : "ascending")

const toDir = (direction: SortDirection): SortDir => (direction === "descending" ? "desc" : "asc")

export const serverSortOf = (columns: ServerSortColumns, sort: string, dir: string): ServerSortState =>
  Object.hasOwn(columns, sort) ? { sort, dir: dir === "desc" ? "desc" : "asc" } : NO_SORT

export const sortParams = ({ sort, dir }: ServerSortState): Partial<ServerSortState> => (sort === "" ? {} : { sort, dir })

export const withSortParams = <T extends ServerSortState>({ sort, dir, ...rest }: T): Omit<T, "sort" | "dir"> & Partial<ServerSortState> => ({ ...rest, ...sortParams({ sort, dir }) })

type ServerSortOptions<C extends ServerSortColumns> = {
  columns: C
  value: ServerSortState
  total: number | null | undefined
  onSort: (next: ServerSortState) => void
  onChoose?: (next: ServerSortState) => void
}

export function useServerSort<C extends ServerSortColumns>({ columns, value, total, onSort, onChoose = onSort }: ServerSortOptions<C>): TableSort<Extract<keyof C, string>> {
  type K = Extract<keyof C, string>
  const current = serverSortOf(columns, value.sort, value.dir)
  const sortKey = current.sort === "" ? null : (current.sort as K)
  const direction = toDirection(current.dir)

  const sortBy = useCallback(
    (key: K): void => {
      onSort({ sort: key, dir: sortKey === key && direction === "ascending" ? "desc" : "asc" })
    },
    [onSort, sortKey, direction],
  )

  const choose = useCallback(
    (selected: string): void => {
      if (selected === DEFAULT_SORT) {
        onChoose(NO_SORT)
        return
      }
      const [key = "", chosen] = selected.split(":")
      if (Object.hasOwn(columns, key) && (chosen === "ascending" || chosen === "descending")) onChoose({ sort: key, dir: toDir(chosen) })
    },
    [columns, onChoose],
  )

  const options = useMemo<SortOption[]>(
    () => [
      { value: DEFAULT_SORT, label: "Orden predeterminado" },
      ...Object.entries(columns).flatMap(([key, column]) =>
        (["ascending", "descending"] as const).map((option) => ({
          value: `${key}:${option}`,
          label: `${column.label}: ${directionWords[column.type ?? "text"][option]}`,
        })),
      ),
    ],
    [columns],
  )

  const count = total ?? 0
  const criteria = sortKey === null ? DEFAULT_SORT : `${sortKey}:${direction}`

  return {
    sortKey,
    direction,
    sortBy,
    choose,
    selected: criteria,
    options,
    announcement:
      sortKey === null ? "" : `Ordenado por ${columns[sortKey]?.label ?? ""}, ${direction === "ascending" ? "ascendente" : "descendente"}, ${count} ${count === 1 ? "fila" : "filas"}`,
    criteria,
    headProps: (key: K) => (sortKey === key ? { "aria-sort": direction } : {}),
    labelOf: (key: K) => columns[key]?.label ?? key,
  }
}
