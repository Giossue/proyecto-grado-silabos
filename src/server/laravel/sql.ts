import { sql, type SQL } from "drizzle-orm"

const FOLD_FROM = "áéíóúüñÁÉÍÓÚÜÑ"
const FOLD_TO = "aeiouunAEIOUUN"

export const iso8601 = (column: SQL) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`

export function institutionDateSql(column: SQL): SQL {
  return sql`to_char(${column} at time zone ${process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"}, 'YYYY-MM-DD')`
}

function accentPattern(term: string): string {
  const folded = [...term].map((character) => {
    const index = [...FOLD_FROM].indexOf(character)
    return index === -1 ? character : [...FOLD_TO][index]
  })
  return `%${folded.join("").replace(/[%_\\]/g, (character) => `\\${character}`)}%`
}

export function accentMatches(column: SQL, term: string): SQL {
  return sql`translate(${column}, ${sql.raw(`'${FOLD_FROM}'`)}, ${sql.raw(`'${FOLD_TO}'`)}) ILIKE ${accentPattern(term)}`
}

export function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}
