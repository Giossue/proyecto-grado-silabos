import { Prisma } from "../../generated/prisma/client"
import { jsonbValue } from "../../prisma/sql"

export type TableColumns = { table: string; columns: Record<string, string>; json?: readonly string[] }

function assigned(table: TableColumns, values: Record<string, unknown>): [string, Prisma.Sql][] {
  return Object.entries(values)
    .map(([name, value]): [string, unknown] => {
      if (!Object.hasOwn(table.columns, name)) throw new Error(`Unknown column ${name}`)
      return [name, value]
    })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, table.json?.includes(name) === true && value !== null ? jsonbValue(JSON.stringify(value)) : Prisma.sql`${value}`])
}

export function updateColumns(table: TableColumns, values: Record<string, unknown>, where: Prisma.Sql): Prisma.Sql {
  const set = assigned(table, values).map(([name, value]) => Prisma.sql`${Prisma.raw(`"${name}"`)} = ${value}`)
  return Prisma.sql`update ${Prisma.raw(`"${table.table}"`)} set ${Prisma.join(set, ", ")} where ${where}`
}

export function insertColumns(table: TableColumns, values: Record<string, unknown>): Prisma.Sql {
  const entries = assigned(table, values)
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  return Prisma.sql`insert into ${Prisma.raw(`"${table.table}"`)} (${Prisma.join(names, ", ")}) values (${Prisma.join(
    entries.map(([, value]) => value),
    ", ",
  )})`
}

export const SUBJECTS_TABLE: TableColumns = { table: "asignaturas", columns: Prisma.AsignaturasScalarFieldEnum }
export const FACULTIES_TABLE: TableColumns = { table: "facultades", columns: Prisma.FacultadesScalarFieldEnum, json: ["bibliotecas_koha_facultad"] }
export const CAREERS_TABLE: TableColumns = { table: "carreras", columns: Prisma.CarrerasScalarFieldEnum }
export const PERIODS_TABLE: TableColumns = { table: "periodos_academicos", columns: Prisma.Periodos_academicosScalarFieldEnum }
export const MALLAS_TABLE: TableColumns = { table: "mallas", columns: Prisma.MallasScalarFieldEnum }
