import { Prisma } from "../../../generated/prisma/client"
import type { TwoFactorStore } from "../../../server/identity/twoFactor"
import { rowsOf, type RawExecutor } from "./raw-executor"

type AccountRow = { usuario_id: string; correo_electronico: string; has_secret: boolean; confirmed: boolean }

export function twoFactorStoreOn(executor: RawExecutor): TwoFactorStore {
  return {
    async account(userId) {
      const [row] = await rowsOf<AccountRow>(
        executor,
        Prisma.sql`select u.usuario_id, u.correo_electronico, d.id is not null as has_secret,
            u.dos_factores_confirmado_en is not null as confirmed
          from usuarios u left join dos_factores_usuario d on d.user_id = u.usuario_id
          where u.usuario_id = ${userId}::uuid limit 1`,
      )
      if (!row) return null
      return { id: row.usuario_id, email: row.correo_electronico, pending: row.has_secret, confirmed: row.confirmed && row.has_secret }
    },
    async clearLegacy(userId) {
      await executor.$executeRaw(Prisma.sql`update usuarios set secreto_dos_factores = null, codigos_recuperacion_dos_factores = null
        where usuario_id = ${userId}::uuid and (secreto_dos_factores is not null or codigos_recuperacion_dos_factores is not null)`)
    },
  }
}
