import { Prisma } from "../../../generated/prisma/client"
import type { ProfileRepository } from "../../../server/identity/session"
import { rowsOf, type RawExecutor } from "./raw-executor"

type ProfileRow = {
  nombre_usuario: string
  correo_electronico: string
  formacion_experiencia_usuario: string | null
  preferencias_accesibilidad_usuario: unknown
  two_factor_secret: boolean
  two_factor_confirmed: boolean
}

export function profileRepositoryOn(executor: RawExecutor): ProfileRepository {
  return {
    async find(userId) {
      const [row] = await rowsOf<ProfileRow>(
        executor,
        Prisma.sql`select u.nombre_usuario, u.correo_electronico, u.formacion_experiencia_usuario, u.preferencias_accesibilidad_usuario,
            d.id is not null as two_factor_secret, d.id is not null and u.dos_factores_confirmado_en is not null as two_factor_confirmed
          from usuarios u left join dos_factores_usuario d on d.user_id = u.usuario_id
          where u.usuario_id = ${userId}::uuid`,
      )
      if (!row) return null
      return {
        name: row.nombre_usuario,
        email: row.correo_electronico,
        formation: row.formacion_experiencia_usuario,
        accessibility: row.preferencias_accesibilidad_usuario,
        twoFactorSecret: row.two_factor_secret,
        twoFactorConfirmed: row.two_factor_confirmed,
      }
    },
  }
}
