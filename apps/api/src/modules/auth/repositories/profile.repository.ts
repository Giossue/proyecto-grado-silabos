import { Prisma } from "../../../generated/prisma/client"
import type { ProfileRepository } from "../../../server/identity/session"
import { rowsOf, type RawExecutor } from "./raw-executor"

type ProfileRow = {
  nombre_usuario: string
  correo_electronico: string
}

export function profileRepositoryOn(executor: RawExecutor): ProfileRepository {
  return {
    async find(userId) {
      const [row] = await rowsOf<ProfileRow>(
        executor,
        Prisma.sql`select u.nombre_usuario, u.correo_electronico
          from usuarios u
          where u.usuario_id = ${userId}::uuid`,
      )
      if (!row) return null
      return {
        name: row.nombre_usuario,
        email: row.correo_electronico,
      }
    },
  }
}
