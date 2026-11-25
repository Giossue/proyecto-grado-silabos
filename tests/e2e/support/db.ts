import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

const databaseUrl = (): string => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8")
  const line = env.split("\n").find((entry) => entry.startsWith("DATABASE_URL="))
  if (!line) throw new Error("DATABASE_URL must be set to run the E2E suite.")
  return line.slice("DATABASE_URL=".length).trim()
}

export async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    return (await client.query<T>(text, values)).rows
  } finally {
    await client.end()
  }
}

export async function expireInvitation(email: string): Promise<void> {
  await query(
    `update invitaciones_activacion set expira_en = now() - interval '1 day'
      where usada_en is null and invalidada_en is null
        and usuario_id = (select usuario_id from usuarios where correo_electronico = $1)`,
    [email],
  )
}
