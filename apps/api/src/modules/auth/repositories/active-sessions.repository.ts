import { Prisma } from "../../../generated/prisma/client"
import type { ActiveSessionStore } from "../../../server/identity/sessions"
import { rowsOf, type RawExecutor } from "./raw-executor"

type SessionRow = { id: string; ip_address: string | null; user_agent: string | null; last_activity: bigint | string | number }

export function activeSessionStoreOn(executor: RawExecutor): ActiveSessionStore {
  return {
    async sessions(userId) {
      const rows = await rowsOf<SessionRow>(
        executor,
        Prisma.sql`select id, ip_address, user_agent, extract(epoch from updated_at)::bigint as last_activity from sesiones_usuario
          where user_id = ${userId}::uuid and expires_at > now() order by updated_at desc, id asc`,
      )
      return rows.map((row) => ({
        id: row.id,
        ip: row.ip_address,
        agent: row.user_agent,
        lastActivity: Number(row.last_activity),
      }))
    },
  }
}
