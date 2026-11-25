import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { authenticateAndTrack, commitTracking, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { apiJson } from "../http/responses"
import { isoFromSeconds } from "../syllabus/draftField"

export type SessionRow = { id: string; ip: string | null; agent: string | null; lastActivity: number }

export interface ActiveSessionStore {
  sessions(userId: string): Promise<SessionRow[]>
}

export type ActiveSessionDeps = { bridge: BridgeDeps; store: ActiveSessionStore }

export function createActiveSessionStore(): ActiveSessionStore {
  return {
    async sessions(userId) {
      const result = await db.execute(
        sql`select id, ip_address, user_agent, last_activity from sesiones where user_id = ${userId} order by last_activity desc`,
      )
      return (result.rows as { id: string; ip_address: string | null; user_agent: string | null; last_activity: string | number }[]).map((row) => ({
        id: row.id,
        ip: row.ip_address,
        agent: row.user_agent,
        lastActivity: Number(row.last_activity),
      }))
    },
  }
}

export function defaultActiveSessionDeps(): ActiveSessionDeps {
  return { bridge: defaultBridgeDeps(), store: createActiveSessionStore() }
}

const BROWSERS: [string[], string][] = [
  [["Edg/"], "Edge"],
  [["Firefox/"], "Firefox"],
  [["Chrome/"], "Chrome"],
  [["Safari/"], "Safari"],
]

const PLATFORMS: [string[], string][] = [
  [["Android"], "Android"],
  [["iPhone", "iPad"], "iOS"],
  [["Windows"], "Windows"],
  [["Macintosh"], "macOS"],
  [["Linux"], "Linux"],
]

function pick(agent: string, options: [string[], string][], fallback: string): string {
  return options.find(([needles]) => needles.some((needle) => agent.includes(needle)))?.[1] ?? fallback
}

export function deviceLabel(agent: string): string {
  return `${pick(agent, BROWSERS, "Navegador desconocido")} en ${pick(agent, PLATFORMS, "dispositivo desconocido")}`
}

export async function activeSessions(request: Request, deps: ActiveSessionDeps = defaultActiveSessionDeps()): Promise<Response> {
  const authentication = await authenticateAndTrack(request, {}, deps.bridge)
  const { outcome, touch } = authentication
  const refresh = () => commitTracking(authentication, request, deps.bridge)
  if (outcome instanceof Response) {
    await refresh()
    return outcome
  }
  const rows = await deps.store.sessions(outcome.user.id)
  await refresh()
  return apiJson({
    sessions: rows.map((row) => ({
      id: row.id,
      ip_address: row.ip,
      device: deviceLabel(row.agent ?? ""),
      last_activity: isoFromSeconds(row.lastActivity),
      current: touch !== null && row.id === touch,
    })),
  })
}
