import { getConvocation } from "@/api/convocations"

export const convocationKeys = {
  all: ["convocations"] as const,
  detail: (convocationId: string) => ["convocations", "detail", convocationId] as const,
}

export const convocationQuery = (convocationId: string) => ({
  queryKey: convocationKeys.detail(convocationId),
  queryFn: () => getConvocation(convocationId),
})
