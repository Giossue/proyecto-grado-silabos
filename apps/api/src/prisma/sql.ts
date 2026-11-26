import { Prisma } from "../generated/prisma/client"
import { institutionTimezone } from "../server/shared/clock"

const FOLD_FROM = "áéíóúüñÁÉÍÓÚÜÑ"
const FOLD_TO = "aeiouunAEIOUUN"

export function iso8601(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`
}

export const isoText = iso8601

export function institutionDateSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char(${column} at time zone ${institutionTimezone()}, 'YYYY-MM-DD')`
}

function accentPattern(term: string): string {
  const folded = [...term].map((character) => {
    const index = [...FOLD_FROM].indexOf(character)
    return index === -1 ? character : [...FOLD_TO][index]
  })
  return `%${folded.join("").replace(/[%_\\]/g, (character) => `\\${character}`)}%`
}

export function accentMatches(column: Prisma.Sql, term: string): Prisma.Sql {
  return Prisma.sql`translate(${column}, ${Prisma.raw(`'${FOLD_FROM}'`)}, ${Prisma.raw(`'${FOLD_TO}'`)}) ILIKE ${accentPattern(term)}`
}

export function uuidList(ids: string[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.empty
  return Prisma.join(
    ids.map((id) => Prisma.sql`${id}::uuid`),
    ", ",
  )
}

export function fromEpoch(seconds: number): Prisma.Sql {
  return Prisma.sql`to_timestamp(${seconds})`
}

export function jsonText(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${column}::text`
}

export function jsonbValue(json: string): Prisma.Sql {
  return Prisma.sql`${json}::jsonb`
}

export function epochText(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`extract(epoch from ${column})::bigint::text`
}

export async function hasRows(query: PromiseLike<unknown[]>): Promise<boolean> {
  return (await query).length > 0
}
