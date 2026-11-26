import { sql, type SQL } from "drizzle-orm"
import { CREDENTIAL_PROVIDER } from "./credentialProvider"

export { CREDENTIAL_PROVIDER }

export type CredentialExecutor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

export async function copyMissingCredentials(executor: CredentialExecutor): Promise<number> {
  const result = await executor.execute(sql`insert into cuentas_usuario (id, account_id, provider_id, user_id, password)
    select gen_random_uuid()::text, u.usuario_id::text, ${CREDENTIAL_PROVIDER}, u.usuario_id, u.contrasena from usuarios u
    on conflict (provider_id, account_id) do nothing`)
  return result.rowCount ?? 0
}
