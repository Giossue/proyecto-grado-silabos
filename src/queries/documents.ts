import { getDocuments } from "@/api/documents"
import { getSession } from "@/api/session"

export const documentKeys = {
  all: ["documents"] as const,
  revision: (revisionId: string) => ["documents", "revision", revisionId] as const,
}

export const revisionDocumentsQuery = (revisionId: string) => ({
  queryKey: documentKeys.revision(revisionId),
  queryFn: async () => {
    const session = await getSession()

    return { session, payload: await getDocuments(revisionId) }
  },
})
