import { getManagedUsers } from "@/api/admin-users"
import { getSession } from "@/api/session"
import { withSortParams } from "@/composables/useServerSort"

export type ManagedUserFilters = { q: string; status: string; role: string; career: string; sort: string; dir: string }

export const adminUserKeys = {
  all: ["admin-users"] as const,
  list: (page: number, filters: ManagedUserFilters) => ["admin-users", "list", page, filters] as const,
}

export const managedUsersQuery = (page: number, filters: ManagedUserFilters) => ({
  queryKey: adminUserKeys.list(page, filters),
  queryFn: async () => {
    const session = await getSession()
    if (session.active_role?.code !== "administrador") return { allowed: false as const, session, users: null }

    return { allowed: true as const, session, users: await getManagedUsers({ ...withSortParams(filters), page }) }
  },
})
