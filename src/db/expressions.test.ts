import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { byColumnName, epochText, fromEpoch, hasRows, isoText, jsonbValue, jsonText } from "./expressions"
import { asignaturas, facultades } from "./schema"

const dialect = new PgDialect()

describe("byColumnName", () => {
  it("maps database column names to the table keys", () => {
    expect(byColumnName(asignaturas, { creditos_asignatura: "3.50", modalidad_asignatura: "Presencial", ciclo_asignatura: null })).toEqual({
      creditosAsignatura: "3.50",
      modalidadAsignatura: "Presencial",
      cicloAsignatura: null,
    })
  })

  it("rejects a column the table does not have", () => {
    expect(() => byColumnName(facultades, { carrera_id: "x" })).toThrow("Unknown column carrera_id")
  })
})

describe("hasRows", () => {
  it("reports whether the query returned any row", async () => {
    expect(await hasRows(Promise.resolve([{ id: "a" }]))).toBe(true)
    expect(await hasRows(Promise.resolve([]))).toBe(false)
  })
})

describe("SQL expressions", () => {
  it("renders the same text formats as the hand-written queries", () => {
    expect(dialect.sqlToQuery(fromEpoch(1790000000))).toMatchObject({ sql: "to_timestamp($1)", params: [1790000000] })
    expect(dialect.sqlToQuery(jsonText(facultades.bibliotecasKohaFacultad)).sql).toBe('"facultades"."bibliotecas_koha_facultad"::text')
    expect(dialect.sqlToQuery(jsonbValue("[]"))).toMatchObject({ sql: "$1::jsonb", params: ["[]"] })
    expect(dialect.sqlToQuery(isoText(asignaturas.asignaturaId)).sql).toBe(`to_char("asignaturas"."asignatura_id" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`)
    expect(dialect.sqlToQuery(epochText(asignaturas.asignaturaId)).sql).toBe('extract(epoch from "asignaturas"."asignatura_id")::bigint')
  })
})
