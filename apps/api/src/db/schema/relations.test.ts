import { createTableRelationsHelpers, extractTablesRelationalConfig, normalizeRelation } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { describe, expect, it } from "vitest"
import * as schema from "./index"

const { tables, tableNamesMap } = extractTablesRelationalConfig(schema, createTableRelationsHelpers)

describe("schema relations", () => {
  it("resolves every relation to the columns of a real foreign key", () => {
    for (const table of Object.values(tables)) {
      for (const relation of Object.values(table.relations)) {
        const normalized = normalizeRelation(tables, tableNamesMap, relation)
        expect(normalized.fields.length, `${table.tsName}.${relation.fieldName}`).toBeGreaterThan(0)
        expect(normalized.fields.length).toBe(normalized.references.length)
      }
    }
  })

  it("builds relational queries that load nested relations", () => {
    const db = drizzle.mock({ schema })
    const query = db.query.silabos
      .findFirst({ with: { paralelo: { with: { asignatura: true } }, revisiones: { with: { aprobaciones: true } } } })
      .toSQL()
    expect(query.sql).toContain('from "silabos"')
    expect(query.sql).toContain('"paralelos"')
    expect(query.sql).toContain('"aprobaciones"')
  })

  it("keeps the helpers in sync with the exported tables", () => {
    expect(createTableRelationsHelpers(schema.usuarios).one).toBeTypeOf("function")
    expect(Object.keys(tables)).toContain("usuarios")
    expect(Object.keys(tables)).not.toContain("migraciones")
  })
})
