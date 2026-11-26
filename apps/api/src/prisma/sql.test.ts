import { sql as drizzleSql, type SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import * as drizzleExpressions from "../db/expressions"
import { facultades } from "../db/schema"
import { Prisma } from "../generated/prisma/client"
import * as drizzleHttp from "../server/http/sql"
import { accentMatches, epochText, fromEpoch, hasRows, institutionDateSql, iso8601, isoText, jsonbValue, jsonText, uuidList } from "./sql"

const dialect = new PgDialect()
const drizzle = (query: SQL) => {
  const { sql, params } = dialect.sqlToQuery(query)
  return { text: sql, values: params }
}
const prisma = (query: Prisma.Sql) => ({ text: query.text, values: query.values })
const COLUMN = "silabos.creado_en"
const drizzleColumn = drizzleSql.raw(COLUMN)
const prismaColumn = Prisma.raw(COLUMN)
const KOHA = Prisma.raw('"facultades"."bibliotecas_koha_facultad"')

describe("Prisma SQL helpers", () => {
  it("render the same SQL and parameters as the Drizzle helpers", () => {
    expect(prisma(iso8601(prismaColumn))).toEqual(drizzle(drizzleHttp.iso8601(drizzleColumn)))
    expect(prisma(isoText(KOHA))).toEqual(drizzle(drizzleExpressions.isoText(facultades.bibliotecasKohaFacultad)))
    expect(prisma(institutionDateSql(prismaColumn))).toEqual(drizzle(drizzleHttp.institutionDateSql(drizzleColumn)))
    expect(prisma(accentMatches(prismaColumn, "Ñandú_50%\\"))).toEqual(drizzle(drizzleHttp.accentMatches(drizzleColumn, "Ñandú_50%\\")))
    expect(prisma(uuidList(["a", "b"]))).toEqual(drizzle(drizzleHttp.uuidList(["a", "b"])))
    expect(prisma(fromEpoch(1790000000))).toEqual(drizzle(drizzleExpressions.fromEpoch(1790000000)))
    expect(prisma(jsonbValue("[]"))).toEqual(drizzle(drizzleExpressions.jsonbValue("[]")))
    expect(prisma(jsonText(KOHA))).toEqual(drizzle(drizzleExpressions.jsonText(facultades.bibliotecasKohaFacultad)))
  })

  it("keeps the epoch as text, like node-postgres returned the bigint", () => {
    expect(prisma(epochText(KOHA)).text).toBe(`${drizzle(drizzleExpressions.epochText(facultades.bibliotecasKohaFacultad)).text}::text`)
  })

  it("renders an empty uuid list as nothing", () => {
    expect(uuidList([]).text).toBe(drizzle(drizzleHttp.uuidList([])).text)
  })

  it("reports whether the query returned any row", async () => {
    expect(await hasRows(Promise.resolve([{ id: "a" }]))).toBe(true)
    expect(await hasRows(Promise.resolve([]))).toBe(false)
  })
})
