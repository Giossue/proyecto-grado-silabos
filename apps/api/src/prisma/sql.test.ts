import { describe, expect, it } from "vitest"
import { Prisma } from "../generated/prisma/client"
import { institutionTimezone } from "../server/shared/clock"
import { accentMatches, epochText, fromEpoch, hasRows, institutionDateSql, iso8601, isoText, jsonbValue, jsonText, uuidList } from "./sql"

const prisma = (query: Prisma.Sql) => ({ text: query.text, values: query.values })
const COLUMN = "silabos.creado_en"
const prismaColumn = Prisma.raw(COLUMN)
const KOHA_COLUMN = '"facultades"."bibliotecas_koha_facultad"'
const KOHA = Prisma.raw(KOHA_COLUMN)
const ISO_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'`

describe("Prisma SQL helpers", () => {
  it("render the expected SQL and parameters", () => {
    expect(prisma(iso8601(prismaColumn))).toEqual({ text: `to_char(${COLUMN} at time zone 'UTC', ${ISO_FORMAT})`, values: [] })
    expect(prisma(isoText(KOHA))).toEqual({ text: `to_char(${KOHA_COLUMN} at time zone 'UTC', ${ISO_FORMAT})`, values: [] })
    expect(prisma(institutionDateSql(prismaColumn))).toEqual({ text: `to_char(${COLUMN} at time zone $1, 'YYYY-MM-DD')`, values: [institutionTimezone()] })
    expect(prisma(accentMatches(prismaColumn, "Ñandú_50%\\"))).toEqual({
      text: `translate(${COLUMN}, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') ILIKE $1`,
      values: ["%Nandu\\_50\\%\\\\%"],
    })
    expect(prisma(uuidList(["a", "b"]))).toEqual({ text: "$1::uuid, $2::uuid", values: ["a", "b"] })
    expect(prisma(fromEpoch(1790000000))).toEqual({ text: "to_timestamp($1)", values: [1790000000] })
    expect(prisma(jsonbValue("[]"))).toEqual({ text: "$1::jsonb", values: ["[]"] })
    expect(prisma(jsonText(KOHA))).toEqual({ text: `${KOHA_COLUMN}::text`, values: [] })
  })

  it("keeps the epoch as text, like node-postgres returned the bigint", () => {
    expect(prisma(epochText(KOHA)).text).toBe(`extract(epoch from ${KOHA_COLUMN})::bigint::text`)
  })

  it("renders an empty uuid list as nothing", () => {
    expect(uuidList([]).text).toBe("")
  })

  it("reports whether the query returned any row", async () => {
    expect(await hasRows(Promise.resolve([{ id: "a" }]))).toBe(true)
    expect(await hasRows(Promise.resolve([]))).toBe(false)
  })
})
