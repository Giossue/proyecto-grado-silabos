import path from "node:path"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { describe, expect, it } from "vitest"
import { baselineMigration } from "./baseline"

describe("baselineMigration", () => {
  it("returns the hash and timestamp drizzle-kit migrate records for the baseline", () => {
    const migrationsFolder = path.resolve("src/db/drizzle")
    const [first] = readMigrationFiles({ migrationsFolder })
    expect(baselineMigration(migrationsFolder)).toEqual({ hash: first.hash, createdAt: first.folderMillis })
  })
})
