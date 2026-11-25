import { getAcademicGovernance } from "@/api/academic"
import { getProcesses } from "@/api/processes"
import { getSession } from "@/api/session"

export const processKeys = {
  all: ["processes"] as const,
  overview: () => ["processes", "overview"] as const,
}

export const processOverviewQuery = () => ({
  queryKey: processKeys.overview(),
  queryFn: async () => {
    const session = await getSession()
    if (session.active_role?.code !== "administrador") return null
    const [governance, processes] = await Promise.all([getAcademicGovernance(), getProcesses()])

    return { governance, processes }
  },
})
