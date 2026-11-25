import type { ExtractTablesWithRelations } from "drizzle-orm"
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres"
import type { PgDatabase } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { silabosPool?: Pool }

export const pool = globalForDb.silabosPool ?? new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== "production") globalForDb.silabosPool = pool

export const db = drizzle(pool, { schema })

export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>
