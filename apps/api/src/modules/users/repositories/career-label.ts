import { Prisma } from "../../../generated/prisma/client"

export function careerLabelSql(alias: string): Prisma.Sql {
  const career = Prisma.raw(alias)
  return Prisma.sql`(case when (select count(*) from carreras mismo_nombre where mismo_nombre.nombre_carrera = ${career}.nombre_carrera) > 1
    then ${career}.nombre_carrera || ' · ' || coalesce(${career}.codigo_carrera, '') else ${career}.nombre_carrera end)`
}
