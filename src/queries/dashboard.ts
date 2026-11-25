import { getDashboard } from "@/api/dashboard"

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => ["dashboard", "summary"] as const,
  deadlines: () => ["dashboard", "deadline"] as const,
  deadline: (scope: string) => ["dashboard", "deadline", scope] as const,
  setups: () => ["dashboard", "setup"] as const,
  setup: (scope: string) => ["dashboard", "setup", scope] as const,
}

export const dashboardSummaryQuery = () => ({
  queryKey: dashboardKeys.summary(),
  queryFn: getDashboard,
})
