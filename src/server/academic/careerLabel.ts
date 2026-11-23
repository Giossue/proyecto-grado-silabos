import { sql, type SQL } from "drizzle-orm"

export function careerLabelSql(alias: string): SQL {
  const career = sql.raw(alias)
  return sql`(case when (select count(*) from carreras mismo_nombre where mismo_nombre.nombre_carrera = ${career}.nombre_carrera) > 1
    then ${career}.nombre_carrera || ' · ' || coalesce(${career}.codigo_carrera, '') else ${career}.nombre_carrera end)`
}
