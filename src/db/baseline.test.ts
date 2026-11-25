import path from "node:path"
import { is } from "drizzle-orm"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { PgTable } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { baselineMigration } from "./baseline"

describe("baselineMigration", () => {
  it("returns the hash and timestamp drizzle-kit migrate records for the baseline", () => {
    const migrationsFolder = path.resolve("src/db/drizzle")
    const [first] = readMigrationFiles({ migrationsFolder })
    expect(baselineMigration(migrationsFolder)).toEqual({ hash: first.hash, createdAt: first.folderMillis })
  })
})

describe("baseline migration", () => {
  const migrationsFolder = path.resolve("src/db/drizzle")
  const [baseline, dropAudit] = readMigrationFiles({ migrationsFolder })
  const statements = baseline.sql.join("\n")

  it("creates every table and the view of the schema", async () => {
    const { getTableConfig, getViewConfig } = await import("drizzle-orm/pg-core")
    const schema = await import("./schema")
    const tables = Object.values(schema).filter((value) => is(value, PgTable))
    expect(tables.length).toBeGreaterThan(30)
    for (const table of tables) expect(statements).toContain(`CREATE TABLE "${getTableConfig(table as PgTable).name}"`)
    expect(statements).toContain(`CREATE VIEW "public"."${getViewConfig(schema.docentesVigentesSilabo).name}"`)
  })

  it("does not create the Laravel-only tables nor the audit table", () => {
    for (const name of ["migraciones", "cola_trabajos", "datos_temporales", "bloqueos_temporales", "eventos_auditoria"]) expect(statements).not.toContain(`"${name}"`)
    expect(dropAudit.sql).toEqual(['DROP TABLE IF EXISTS "eventos_auditoria" CASCADE;'])
  })

  it("installs the append-only protections and the integrity triggers", () => {
    for (const trigger of ["proteger_aprobacion", "proteger_archivo", "proteger_firma_silabo", "proteger_revision_coordinacion", "proteger_revision_silabo", "proteger_envio_biblioteca", "proteger_notificacion"]) {
      expect(statements).toContain(`CREATE TRIGGER ${trigger} `)
    }
    expect(statements).toContain("CREATE FUNCTION public.proteger_registro_append_only()")
    expect(statements).toContain("CREATE TRIGGER asignaciones_rol_administrador_exclusivo ")
  })
})
