import { getQueryClient } from "@/lib/queryClient"
import { dashboardKeys } from "@/queries/dashboard"

const AFTER_MUTATION_MS = 400

let timer: ReturnType<typeof setTimeout> | undefined

if (typeof window !== "undefined") {
  window.addEventListener("silabos:mutated", () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void getQueryClient().invalidateQueries({ queryKey: dashboardKeys.all, refetchType: "all" })
    }, AFTER_MUTATION_MS)
  })
}
