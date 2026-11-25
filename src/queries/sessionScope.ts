import type { Query } from "@tanstack/react-query"
import type { Session } from "@/api/session"
import { getQueryClient } from "@/lib/queryClient"
import { watchSessionKey } from "@/state/sessionKey"

const SELF_SCOPED = new Set(["session", "screen-help"])

const scopeOf = (session: Session | null): string | null => (session ? `${session.user.id}:${session.active_role?.id ?? ""}` : null)

const belongsToScope = (query: Query): boolean => {
  const [area, kind] = query.queryKey as unknown[]
  if (typeof area === "string" && SELF_SCOPED.has(area)) return false

  return !(area === "dashboard" && (kind === "deadline" || kind === "setup"))
}

watchSessionKey(scopeOf, (_key, previous) => {
  if (previous) void getQueryClient().resetQueries({ predicate: belongsToScope })
})
