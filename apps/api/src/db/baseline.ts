import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { Client } from "pg"

export const BASELINE_TAG = "0000_legal_edwin_jarvis"

type Journal = { entries: { tag: string; when: number }[] }

export function baselineMigration(migrationsFolder: string) {
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as Journal
  const entry = journal.entries.find((item) => item.tag === BASELINE_TAG)
  if (!entry) throw new Error(`Missing ${BASELINE_TAG} in the migration journal`)
  const sql = readFileSync(path.join(migrationsFolder, `${BASELINE_TAG}.sql`), "utf8")
  return { hash: createHash("sha256").update(sql).digest("hex"), createdAt: entry.when }
}

export async function markBaselineApplied(connectionString: string, migrationsFolder: string) {
  const { hash, createdAt } = baselineMigration(migrationsFolder)
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const existing = await client.query<{ found: boolean }>("SELECT to_regclass('public.usuarios') IS NOT NULL AS found")
    if (!existing.rows[0]?.found) throw new Error("The database has no tables; run npm run db:migrate instead")
    await client.query("BEGIN")
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle")
    await client.query(
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
    )
    const inserted = await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT $1::text, $2::bigint WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1::text OR created_at >= $2::bigint)",
      [hash, createdAt],
    )
    await client.query("COMMIT")
    return inserted.rowCount === 1
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    await client.end()
  }
}

