import { randomUUID } from "node:crypto"
import { sql, type SQL } from "drizzle-orm"

export const CREDENTIAL_PROVIDER = "credential"

export type CredentialExecutor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

export async function storeCredentialPassword(executor: CredentialExecutor, userId: string, hash: string): Promise<void> {
  await executor.execute(sql`insert into cuentas_usuario (id, account_id, provider_id, user_id, password)
    values (${randomUUID()}, ${userId}, ${CREDENTIAL_PROVIDER}, ${userId}::uuid, ${hash})
    on conflict (provider_id, account_id) do update set password = excluded.password, updated_at = now()`)
  await executor.execute(sql`update usuarios set contrasena = ${hash} where usuario_id = ${userId}::uuid`)
}

export async function mirrorCredentialPassword(executor: CredentialExecutor, userId: string): Promise<void> {
  await executor.execute(sql`update usuarios set contrasena = c.password
    from cuentas_usuario c
    where usuarios.usuario_id = ${userId}::uuid and c.user_id = usuarios.usuario_id
      and c.provider_id = ${CREDENTIAL_PROVIDER} and c.password is not null`)
}

export async function copyMissingCredentials(executor: CredentialExecutor): Promise<number> {
  const result = await executor.execute(sql`insert into cuentas_usuario (id, account_id, provider_id, user_id, password)
    select gen_random_uuid()::text, u.usuario_id::text, ${CREDENTIAL_PROVIDER}, u.usuario_id, u.contrasena from usuarios u
    on conflict (provider_id, account_id) do nothing`)
  return result.rowCount ?? 0
}

export async function deleteUserSessions(executor: CredentialExecutor, userId: string, exceptId: string | null = null): Promise<number> {
  const result = await executor.execute(
    exceptId === null
      ? sql`delete from sesiones_usuario where user_id = ${userId}::uuid`
      : sql`delete from sesiones_usuario where user_id = ${userId}::uuid and id <> ${exceptId}`,
  )
  return result.rowCount ?? 0
}
