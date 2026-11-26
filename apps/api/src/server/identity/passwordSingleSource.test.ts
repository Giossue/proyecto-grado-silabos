import { describe, expect, it, vi } from "vitest"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { storeCredentialPassword } from "../../modules/auth/repositories/credentials.repository"
import { sessionStoreOn } from "../../modules/auth/repositories/session-store.repository"
import { seedDatabase } from "../setup/seeding"
import { accountTx } from "./accountStore"

vi.mock("../http/uuid7", () => ({ uuid7: () => "01a1c5ba-0000-7000-8000-000000000099" }))
vi.mock("../auth/bcrypt", () => ({ bcryptHash: async (value: string) => `hash:${value}` }))

const USER = "01a1c5ba-10b4-7129-925f-c28a9489323c"

function recordingDatabase(rows: unknown[] = []) {
  const statements: Prisma.Sql[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, values: unknown[]) => {
    statements.push(query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values))
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), rows),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), 1),
  } as unknown as Db
  return { db, statements }
}

describe("the password hash lives only in the credential account", () => {
  it("has no password column on the user model", () => {
    expect(Object.keys(Prisma.UsuariosScalarFieldEnum)).not.toContain("contrasena")
    expect(Object.keys(Prisma.Cuentas_usuarioScalarFieldEnum)).toContain("password")
  })

  it("stores a new or reset password only in cuentas_usuario", async () => {
    const { db, statements } = recordingDatabase()
    await storeCredentialPassword(db, USER, "$2y$new", "account-1")
    expect(statements).toHaveLength(1)
    expect(statements[0].text).toContain("insert into cuentas_usuario")
    expect(statements[0].values).toEqual(["account-1", USER, "credential", USER, "$2y$new"])
    expect(statements.some((statement) => statement.text.includes("usuarios"))).toBe(false)
  })

  it("creates an account with the hash only in its credential row", async () => {
    const { db, statements } = recordingDatabase()
    await accountTx(db).insertAccount({ name: "Ana", email: "ana@x.ec", passwordHash: "$2y$h" })
    const [user, credential] = statements
    expect(user.text).toContain('insert into "usuarios"')
    expect(user.text).not.toContain("contrasena")
    expect(user.values).not.toContain("$2y$h")
    expect(credential.text).toContain('insert into "cuentas_usuario"')
    expect(credential.values).toContain("$2y$h")
  })

  it("reads the session user's hash from the credential account", async () => {
    const { db, statements } = recordingDatabase([{ usuario_id: USER, password: "$2y$12$hash", usuario_activo: true, correo_verificado_en: null, preferencias_correo_usuario: null }])
    expect(await sessionStoreOn(db).findUser(USER)).toMatchObject({ id: USER, passwordHash: "$2y$12$hash" })
    expect(statements[0].text).toContain("coalesce(c.password, '') as password")
    expect(statements[0].text).not.toContain("contrasena")
  })

  it("seeds the administrator with its hash in a credential row and keeps an existing one", async () => {
    const calls: Record<string, unknown[]> = { usuarios: [], cuentas_usuario: [] }
    const tx = {
      usuarios: {
        createMany: async (args: unknown) => (calls.usuarios.push(args), { count: 1 }),
        findUniqueOrThrow: async () => ({ usuario_id: USER }),
      },
      asignaciones_rol: { findFirst: async () => ({ asignacion_rol_id: "role" }), create: async () => undefined },
      cuentas_usuario: { createMany: async (args: unknown) => (calls.cuentas_usuario.push(args), { count: 1 }) },
      $queryRaw: async () => [{ id: "template" }],
      $executeRaw: async () => 1,
    }
    const prisma = { $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient
    await seedDatabase(prisma, { adminName: "Admin", adminEmail: "admin@x.ec", adminPassword: "secret", bcryptRounds: 4 })
    expect(JSON.stringify(calls.usuarios)).not.toContain("hash:secret")
    expect(calls.cuentas_usuario).toEqual([
      {
        data: { id: "01a1c5ba-0000-7000-8000-000000000099", account_id: USER, provider_id: "credential", user_id: USER, password: "hash:secret" },
        skipDuplicates: true,
      },
    ])
  })
})
