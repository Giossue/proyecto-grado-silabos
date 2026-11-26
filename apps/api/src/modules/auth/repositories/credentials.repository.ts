import { randomUUID } from "node:crypto"
import { Prisma } from "../../../generated/prisma/client"
import { CREDENTIAL_PROVIDER } from "../../../server/auth/credentialProvider"
import type { CredentialStore } from "../../../server/identity/authentication"
import { rowsOf, type RawExecutor } from "./raw-executor"

export async function storeCredentialPassword(executor: RawExecutor, userId: string, hash: string, id: string = randomUUID()): Promise<void> {
  await executor.$executeRaw(Prisma.sql`insert into cuentas_usuario (id, account_id, provider_id, user_id, password)
    values (${id}, ${userId}, ${CREDENTIAL_PROVIDER}, ${userId}::uuid, ${hash})
    on conflict (provider_id, account_id) do update set password = excluded.password, updated_at = now()`)
}

export function deleteUserSessions(executor: RawExecutor, userId: string, exceptId: string | null = null): Promise<number> {
  return executor.$executeRaw(
    exceptId === null
      ? Prisma.sql`delete from sesiones_usuario where user_id = ${userId}::uuid`
      : Prisma.sql`delete from sesiones_usuario where user_id = ${userId}::uuid and id <> ${exceptId}`,
  )
}

export function credentialStoreOn(executor: RawExecutor): CredentialStore {
  return {
    async findActiveUserByEmail(email) {
      const [row] = await rowsOf<{ usuario_id: string }>(executor, Prisma.sql`select usuario_id from usuarios where correo_electronico = ${email} and usuario_activo = true limit 1`)
      return row ? { id: String(row.usuario_id) } : null
    },
  }
}
