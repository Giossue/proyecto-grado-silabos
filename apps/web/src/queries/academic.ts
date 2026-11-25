import { getAcademicGovernance } from "@/api/academic"
import { getSession } from "@/api/session"

export const academicKeys = {
  all: ["academic"] as const,
  governance: () => ["academic", "governance"] as const,
}

export const governanceQuery = () => ({
  queryKey: academicKeys.governance(),
  queryFn: async () => {
    const session = await getSession()
    if (session.active_role?.code !== "administrador") return null

    return getAcademicGovernance()
  },
})
