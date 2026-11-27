import type { PrismaService } from "../../prisma/prisma.service"
import { type Db, TRANSACTION_OPTIONS } from "../../prisma/db"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadTemplate } from "../shared/templateStore"

export interface AiReadPermissionTx {
  lockTemplate(templateId: string): Promise<SyllabusTemplate | null>
  allowedKeys(templateId: string): Promise<Set<string>>
  save(templateId: string, key: string, allowed: boolean, actorId: string): Promise<void>
}

export interface AiReadPermissionStore {
  allowedKeys(templateId: string): Promise<Set<string>>
  transaction<T>(work: (tx: AiReadPermissionTx) => Promise<T>): Promise<T>
}

export async function allowedAiKeysOn(db: Db, templateId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ key: string }[]>`
    select clave_campo_plantilla as key from permisos_lectura_ia
    where plantilla_id = ${templateId}::uuid and lectura_permitida`
  return new Set(rows.map((row) => row.key))
}

export async function allowAiReadingOn(db: Db, templateId: string, keys: string[]): Promise<void> {
  await db.$executeRaw`
    insert into permisos_lectura_ia (plantilla_id, clave_campo_plantilla, lectura_permitida)
    select ${templateId}::uuid, clave, true from unnest(${keys}::text[]) as clave
    on conflict (plantilla_id, clave_campo_plantilla) do nothing`
}

export async function retainAiPermissionsOn(db: Db, templateId: string, keys: string[]): Promise<void> {
  await db.$executeRaw`delete from permisos_lectura_ia where plantilla_id = ${templateId}::uuid and not (clave_campo_plantilla = any(${keys}::text[]))`
}

export async function saveAiPermissionOn(db: Db, templateId: string, key: string, allowed: boolean, actorId: string): Promise<void> {
  await db.$executeRaw`
    insert into permisos_lectura_ia (plantilla_id, clave_campo_plantilla, lectura_permitida, modificado_por)
    values (${templateId}::uuid, ${key}, ${allowed}, ${actorId}::uuid)
    on conflict (plantilla_id, clave_campo_plantilla)
    do update set lectura_permitida = excluded.lectura_permitida, modificado_por = excluded.modificado_por`
}

function permissionTxOn(db: Db): AiReadPermissionTx {
  return {
    async lockTemplate(templateId) {
      const template = await loadTemplate(db, true)
      return template?.id === templateId ? template : null
    },
    allowedKeys: (templateId) => allowedAiKeysOn(db, templateId),
    save: (templateId, key, allowed, actorId) => saveAiPermissionOn(db, templateId, key, allowed, actorId),
  }
}

export function createAiReadPermissionStore(prisma: PrismaService): AiReadPermissionStore {
  return {
    allowedKeys: (templateId) => allowedAiKeysOn(prisma, templateId),
    transaction: (work) => prisma.$transaction((tx) => work(permissionTxOn(tx)), TRANSACTION_OPTIONS),
  }
}
