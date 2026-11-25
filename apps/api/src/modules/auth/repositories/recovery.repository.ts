import { Prisma } from "../../../generated/prisma/client"
import type { PrismaService } from "../../../prisma/prisma.service"
import type { RecoveryRepository, RecoveryStore } from "../../../server/identity/passwordRecovery"
import { deleteUserSessions, storeCredentialPassword } from "./credentials.repository"
import { rowsOf, type RawExecutor } from "./raw-executor"
import { inTransaction } from "./transactions"

type Row = Record<string, unknown>

const epoch = (column: Prisma.Sql) => Prisma.sql`extract(epoch from ${column})::bigint`
const seconds = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value))

export function recoveryStoreOn(executor: RawExecutor): RecoveryStore {
  const rows = (query: Prisma.Sql) => rowsOf<Row>(executor, query)
  return {
    async userByEmail(email) {
      const [row] = await rows(Prisma.sql`select usuario_id, correo_electronico from usuarios where correo_electronico = ${email} limit 1`)
      return row ? { id: String(row.usuario_id), email: String(row.correo_electronico) } : null
    },
    async resetToken(email) {
      const [row] = await rows(Prisma.sql`select token, ${epoch(Prisma.sql`created_at`)} as created from restablecimientos_contrasena where email = ${email} limit 1`)
      return row ? { token: String(row.token), createdAt: seconds(row.created) } : null
    },
    async deleteResetTokens(email) {
      await executor.$executeRaw(Prisma.sql`delete from restablecimientos_contrasena where email = ${email}`)
    },
    async insertResetToken(email, hash, at) {
      await executor.$executeRaw(Prisma.sql`insert into restablecimientos_contrasena (email, token, created_at) values (${email}, ${hash}, to_timestamp(${at}))`)
    },
    setPassword: (userId, hash) => storeCredentialPassword(executor, userId, hash),
    deleteSessions: (userId) => deleteUserSessions(executor, userId),
    async lockInvitation(hash) {
      const [row] = await rows(Prisma.sql`select invitacion_activacion_id, usuario_id, hash_activacion, ${epoch(Prisma.sql`expira_en`)} as expires,
          ${epoch(Prisma.sql`usada_en`)} as used, ${epoch(Prisma.sql`invalidada_en`)} as invalidated
        from invitaciones_activacion where hash_activacion = ${hash} limit 1 for update`)
      if (!row) return null
      return {
        id: String(row.invitacion_activacion_id),
        userId: String(row.usuario_id),
        hash: String(row.hash_activacion),
        expiresAt: Number(row.expires),
        usedAt: seconds(row.used),
        invalidatedAt: seconds(row.invalidated),
      }
    },
    async lockUser(userId) {
      const [row] = await rows(Prisma.sql`select usuario_id, usuario_activo, correo_verificado_en is not null as verified
        from usuarios where usuario_id = ${userId}::uuid limit 1 for update`)
      return row ? { id: String(row.usuario_id), active: row.usuario_activo === true, verified: row.verified === true } : null
    },
    async activate(userId, hash, at) {
      await storeCredentialPassword(executor, userId, hash)
      await executor.$executeRaw(Prisma.sql`update usuarios set correo_verificado_en = to_timestamp(${at}) where usuario_id = ${userId}::uuid`)
    },
    async useInvitation(id, at) {
      await executor.$executeRaw(Prisma.sql`update invitaciones_activacion set usada_en = to_timestamp(${at}) where invitacion_activacion_id = ${id}::uuid`)
    },
    async invalidateOtherInvitations(userId, exceptId, at) {
      await executor.$executeRaw(Prisma.sql`update invitaciones_activacion set invalidada_en = to_timestamp(${at})
        where usuario_id = ${userId}::uuid and usada_en is null and invalidada_en is null and invitacion_activacion_id <> ${exceptId}::uuid`)
    },
  }
}

export function recoveryRepositoryOn(prisma: PrismaService): RecoveryRepository {
  return {
    direct: (work) => work(recoveryStoreOn(prisma)),
    transaction: (work) => inTransaction(prisma, (tx) => work(recoveryStoreOn(tx))),
  }
}
