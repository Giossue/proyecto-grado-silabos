import { and, eq, isNull } from "drizzle-orm"
import { bcryptHash } from "../server/auth/bcrypt"
import { copyMissingCredentials, type CredentialExecutor } from "../server/auth/credentials"
import { provisionOfficialTemplate, provisionTx } from "../server/configuration/templateProvisionerStore"
import { uuid7 } from "../server/http/uuid7"
import type { Executor } from "./index"
import { asignacionesRol, usuarios } from "./schema"

export type SeedOptions = { adminName: string; adminEmail: string; adminPassword: string; bcryptRounds: number }

export type SeedResult = { adminCreated: boolean; adminRoleCreated: boolean; templateId: string | null }

export function seedOptions(environment: Record<string, string | undefined>): SeedOptions {
  const adminEmail = environment.SEED_ADMIN_EMAIL?.trim() ?? ""
  const adminPassword = environment.SEED_ADMIN_PASSWORD ?? ""
  if (adminEmail === "" || adminPassword === "") throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed the administrator")
  return {
    adminName: environment.SEED_ADMIN_NAME?.trim() || "Administrador",
    adminEmail: adminEmail.toLowerCase(),
    adminPassword,
    bcryptRounds: Number.parseInt(environment.BCRYPT_ROUNDS ?? "12", 10),
  }
}

export async function seedDatabase(database: Executor, options: SeedOptions): Promise<SeedResult> {
  return database.transaction(async (tx) => {
    const now = new Date().toISOString()
    const inserted = await tx
      .insert(usuarios)
      .values({
        usuarioId: uuid7(),
        nombreUsuario: options.adminName,
        correoElectronico: options.adminEmail,
        contrasena: await bcryptHash(options.adminPassword, options.bcryptRounds),
        usuarioActivo: true,
        correoVerificadoEn: now,
      })
      .onConflictDoNothing({ target: usuarios.correoElectronico })
      .returning({ id: usuarios.usuarioId })
    const [admin] = await tx.select({ id: usuarios.usuarioId }).from(usuarios).where(eq(usuarios.correoElectronico, options.adminEmail))
    const [activeRole] = await tx
      .select({ id: asignacionesRol.asignacionRolId })
      .from(asignacionesRol)
      .where(and(eq(asignacionesRol.usuarioId, admin.id), eq(asignacionesRol.rol, "administrador"), isNull(asignacionesRol.carreraId), eq(asignacionesRol.asignacionRolActiva, true)))
    if (!activeRole) await tx.insert(asignacionesRol).values({ asignacionRolId: uuid7(), usuarioId: admin.id, rol: "administrador", carreraId: null, asignacionRolActiva: true })
    await copyMissingCredentials(tx as unknown as CredentialExecutor)
    const templateId = await provisionOfficialTemplate(provisionTx(tx))
    return { adminCreated: inserted.length === 1, adminRoleCreated: !activeRole, templateId }
  })
}
