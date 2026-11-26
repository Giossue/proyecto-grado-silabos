import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { provisionTxOn } from "../../modules/template/template-provision.repository"
import { TRANSACTION_OPTIONS } from "../../prisma/db"
import { bcryptHash } from "../auth/bcrypt"
import { CREDENTIAL_PROVIDER } from "../auth/credentialProvider"
import { officialDefinition, officialSections } from "../configuration/officialTemplate"
import { buildStructure, type ProvisionDeps, type ProvisionTx } from "../configuration/templateProvisioner"
import { uuid7 } from "../http/uuid7"

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

export async function provisionOfficialTemplate(tx: ProvisionTx, ids = { template: uuid7, block: randomUUID, field: uuid7 }): Promise<string | null> {
  if (await tx.anyTemplate()) return null
  const templateId = ids.template()
  const definition = officialDefinition()
  await tx.insertTemplate(templateId, definition)
  await tx.syncDocument(templateId, [])
  await buildStructure(tx, { newBlockId: ids.block, newFieldId: ids.field } as ProvisionDeps, templateId, officialSections(), definition)
  return templateId
}

export async function seedDatabase(prisma: PrismaClient, options: SeedOptions): Promise<SeedResult> {
  return prisma.$transaction(async (tx) => {
    const inserted = await tx.usuarios.createMany({
      data: {
        usuario_id: uuid7(),
        nombre_usuario: options.adminName,
        correo_electronico: options.adminEmail,
        usuario_activo: true,
        correo_verificado_en: new Date(),
      },
      skipDuplicates: true,
    })
    const admin = await tx.usuarios.findUniqueOrThrow({ where: { correo_electronico: options.adminEmail }, select: { usuario_id: true } })
    const activeRole = await tx.asignaciones_rol.findFirst({
      where: { usuario_id: admin.usuario_id, rol: "administrador", carrera_id: null, asignacion_rol_activa: true },
      select: { asignacion_rol_id: true },
    })
    if (!activeRole) await tx.asignaciones_rol.create({ data: { asignacion_rol_id: uuid7(), usuario_id: admin.usuario_id, rol: "administrador", carrera_id: null, asignacion_rol_activa: true } })
    await tx.cuentas_usuario.createMany({
      data: {
        id: uuid7(),
        account_id: admin.usuario_id,
        provider_id: CREDENTIAL_PROVIDER,
        user_id: admin.usuario_id,
        password: await bcryptHash(options.adminPassword, options.bcryptRounds),
      },
      skipDuplicates: true,
    })
    const templateId = await provisionOfficialTemplate(provisionTxOn(tx))
    return { adminCreated: inserted.count === 1, adminRoleCreated: !activeRole, templateId }
  }, TRANSACTION_OPTIONS)
}
