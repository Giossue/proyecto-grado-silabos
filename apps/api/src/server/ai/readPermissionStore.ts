import type { PrismaService } from "../../prisma/prisma.service"
import { type Db, TRANSACTION_OPTIONS } from "../../prisma/db"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadTemplate } from "../shared/templateStore"

export interface AiReadPermissionTx {
  lockTemplate(templateId: string): Promise<SyllabusTemplate | null>
  allowedKeys(templateId: string): Promise<Set<string>>
  save(templateId: string, key: string, allowed: boolean): Promise<void>
}

export interface AiReadPermissionStore {
  allowedKeys(templateId: string): Promise<Set<string>>
  transaction<T>(work: (tx: AiReadPermissionTx) => Promise<T>): Promise<T>
}

export async function allowedAiKeysOn(db: Db, templateId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ key: string }[]>`
    select clave_campo_plantilla as key from campos_plantilla
    where plantilla_id = ${templateId}::uuid and vigente_en_plantilla and lectura_ia_permitida`
  return new Set(rows.map((row) => row.key))
}

export async function allowAiReadingOn(db: Db, templateId: string, keys: string[]): Promise<void> {
  await db.$executeRaw`
    update campos_plantilla set lectura_ia_permitida = true
    where plantilla_id = ${templateId}::uuid and vigente_en_plantilla and clave_campo_plantilla = any(${keys}::text[])`
}

export async function saveAiPermissionOn(db: Db, templateId: string, key: string, allowed: boolean): Promise<void> {
  await db.$executeRaw`
    update campos_plantilla set lectura_ia_permitida = ${allowed}
    where plantilla_id = ${templateId}::uuid and vigente_en_plantilla and clave_campo_plantilla = ${key}`
}

function permissionTxOn(db: Db): AiReadPermissionTx {
  return {
    async lockTemplate(templateId) {
      const template = await loadTemplate(db, true)
      return template?.id === templateId ? template : null
    },
    allowedKeys: (templateId) => allowedAiKeysOn(db, templateId),
    save: (templateId, key, allowed) => saveAiPermissionOn(db, templateId, key, allowed),
  }
}

export function createAiReadPermissionStore(prisma: PrismaService): AiReadPermissionStore {
  return {
    allowedKeys: (templateId) => allowedAiKeysOn(prisma, templateId),
    transaction: (work) => prisma.$transaction((tx) => work(permissionTxOn(tx)), TRANSACTION_OPTIONS),
  }
}
