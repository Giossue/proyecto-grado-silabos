import { getTableColumns, sql, type AnyColumn, type SQL, type Table } from "drizzle-orm"

export function fromEpoch(seconds: number): SQL<string> {
  return sql<string>`to_timestamp(${seconds})`
}

export function jsonText(column: AnyColumn): SQL<string | null> {
  return sql<string | null>`${column}::text`
}

export function jsonbValue(json: string): SQL {
  return sql`${json}::jsonb`
}

export async function hasRows(query: PromiseLike<unknown[]>): Promise<boolean> {
  return (await query).length > 0
}

export function byColumnName<T extends Table>(table: T, values: Record<string, unknown>): Partial<T["$inferInsert"]> {
  const keys = new Map(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]))
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      const key = keys.get(name)
      if (key === undefined) throw new Error(`Unknown column ${name}`)
      return [key, value]
    }),
  ) as Partial<T["$inferInsert"]>
}

export function isoText(column: AnyColumn): SQL<string> {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`
}

export function epochText(column: AnyColumn): SQL<string> {
  return sql<string>`extract(epoch from ${column})::bigint`
}
