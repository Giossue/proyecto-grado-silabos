import { jsonError } from "@/server/http/responses"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { apiJson } from "../http/responses"
import { findActiveCareer } from "./structureQueries"

export type SupportDocumentRecord = { id: string; title: string; size: number; view: string; uploadedAt: string }

export interface SupportDocumentRepository {
  careerActive(careerId: string): Promise<boolean>
  forCareer(careerId: string): Promise<SupportDocumentRecord[]>
}

export type SupportDocumentDeps = { bridge: BridgeDeps; documents: SupportDocumentRepository }

export function createSupportDocumentRepository(): SupportDocumentRepository {
  return {
    careerActive: async (careerId) => (await findActiveCareer(careerId)) !== null,
    async forCareer(careerId) {
      const result = await db.execute(sql`select documento.documento_apoyo_id::text as id, documento.titulo_documento as title,
          archivo.tamano_bytes::text as size, documento.estado_vista as view,
          to_char(documento.subido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') as uploaded_at
        from documentos_apoyo documento
        inner join archivos archivo on archivo.archivo_id = documento.archivo_id
        where documento.carrera_id = ${careerId}::uuid
        order by documento.subido_en desc, documento.titulo_documento asc`)
      return (result.rows as { id: string; title: string; size: string; view: string; uploaded_at: string }[]).map((row) => ({
        id: row.id,
        title: row.title,
        size: Number(row.size),
        view: row.view,
        uploadedAt: row.uploaded_at,
      }))
    },
  }
}

function defaultDeps(): SupportDocumentDeps {
  return { bridge: defaultBridgeDeps(), documents: createSupportDocumentRepository() }
}

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

export function coordinationSupportDocuments(request: Request, deps: SupportDocumentDeps = defaultDeps()): Promise<Response> {
  return list(request, ["coordinador"], deps)
}

export function teacherSupportDocuments(request: Request, deps: SupportDocumentDeps = defaultDeps()): Promise<Response> {
  return list(request, ["coordinador", "docente"], deps)
}
