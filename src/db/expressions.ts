import { sql, type AnyColumn, type SQL } from "drizzle-orm"

export function fromEpoch(seconds: number): SQL<string> {
  return sql<string>`to_timestamp(${seconds})`
}

export function jsonText(column: AnyColumn): SQL<string | null> {
  return sql<string | null>`${column}::text`
}

export function jsonbValue(json: string): SQL {
  return sql`${json}::jsonb`
}
