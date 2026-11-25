import { sql } from "drizzle-orm"
import { symmetricEncrypt } from "better-auth/crypto"
import { decrypt } from "../http/encrypter"
import type { Auth } from "./betterAuth"
import { copyMissingCredentials, type CredentialExecutor } from "./credentials"

export type LegacyTwoFactor = { userId: string; secret: string; recoveryCodes: string | null }

export async function legacyTwoFactorRows(executor: CredentialExecutor): Promise<LegacyTwoFactor[]> {
  const result = await executor.execute(sql`select u.usuario_id, u.secreto_dos_factores, u.codigos_recuperacion_dos_factores
    from usuarios u
    where u.secreto_dos_factores is not null and u.dos_factores_confirmado_en is not null
      and not exists (select 1 from dos_factores_usuario d where d.user_id = u.usuario_id)
    order by u.usuario_id`)
  return (result.rows as { usuario_id: string; secreto_dos_factores: string; codigos_recuperacion_dos_factores: string | null }[]).map((row) => ({
    userId: row.usuario_id,
    secret: row.secreto_dos_factores,
    recoveryCodes: row.codigos_recuperacion_dos_factores,
  }))
}

function legacyCodes(sealed: string | null, key: Buffer): string[] {
  if (sealed === null) return []
  const codes: unknown = JSON.parse(decrypt(sealed, key, true))
  return Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : []
}

export async function importLegacyTwoFactor(auth: Auth, rows: LegacyTwoFactor[], appKey: Buffer): Promise<number> {
  const context = await auth.$context
  let imported = 0
  for (const row of rows) {
    const existing = await context.adapter.findOne({ model: "twoFactor", where: [{ field: "userId", value: row.userId }] })
    if (existing) continue
    const secret = decrypt(row.secret, appKey, true)
    await context.adapter.create({
      model: "twoFactor",
      data: {
        userId: row.userId,
        secret: await symmetricEncrypt({ key: context.secretConfig, data: `base32:${secret}` }),
        backupCodes: await symmetricEncrypt({ key: context.secretConfig, data: JSON.stringify(legacyCodes(row.recoveryCodes, appKey)) }),
        verified: true,
      },
    })
    imported += 1
  }
  return imported
}

export async function migrateLegacyAuth(executor: CredentialExecutor, auth: Auth, appKey: Buffer): Promise<{ credentials: number; twoFactor: number }> {
  const credentials = await copyMissingCredentials(executor)
  const twoFactor = await importLegacyTwoFactor(auth, await legacyTwoFactorRows(executor), appKey)
  return { credentials, twoFactor }
}
