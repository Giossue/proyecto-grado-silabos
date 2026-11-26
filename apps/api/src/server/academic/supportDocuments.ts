import { jsonError } from "@/server/http/responses"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { apiJson } from "../http/responses"

export type SupportDocumentRecord = { id: string; title: string; size: number; view: string; uploadedAt: string }

export interface SupportDocumentRepository {
  careerActive(careerId: string): Promise<boolean>
  forCareer(careerId: string): Promise<SupportDocumentRecord[]>
}

export type SupportDocumentDeps = { bridge: BridgeDeps; documents: SupportDocumentRepository }

async function list(request: Request, roles: string[], deps: SupportDocumentDeps): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const role = session.activeRole
  if (role === null || !roles.includes(role.role) || role.careerId === null || !(await deps.documents.careerActive(role.careerId))) return jsonError(403, "")
  const documents = await deps.documents.forCareer(role.careerId)
  return apiJson({
    data: documents.map((document) => ({ id: document.id, title: document.title, size: document.size, view: document.view, uploaded_at: document.uploadedAt })),
  })
}

export function coordinationSupportDocuments(request: Request, deps: SupportDocumentDeps): Promise<Response> {
  return list(request, ["coordinador"], deps)
}

export function teacherSupportDocuments(request: Request, deps: SupportDocumentDeps): Promise<Response> {
  return list(request, ["coordinador", "docente"], deps)
}
