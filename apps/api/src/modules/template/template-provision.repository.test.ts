// @vitest-environment node
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { Db } from "../../prisma/db"
import { initialAiReadableKeys } from "../../server/ai/readableFields"
import { officialDefinition, officialSections } from "../../server/configuration/officialTemplate"
import { buildStructure } from "../../server/configuration/templateProvisioner"
import { provisionOfficialTemplate } from "../../server/setup/seeding"
import { provisionTxOn } from "./template-provision.repository"
import { structureTxOn } from "./template-structure.repository"

function recordingDb() {
  const permissionStatements: { sql: string; values: unknown[] }[] = []
  const nothing = async () => ({ count: 0 })
  const model = { findMany: async () => [], findFirst: async () => null, create: nothing, updateMany: nothing, deleteMany: nothing }
  const db = {
    campos_plantilla: model,
    definiciones_campo: model,
    secciones_plantilla: model,
    $queryRaw: async () => [],
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?").replace(/\s+/g, " ").trim()
      if (sql.includes("permisos_lectura_ia")) permissionStatements.push({ sql, values })
      return 1
    },
  }
  return { db: db as unknown as Db, permissionStatements }
}

const initial = initialAiReadableKeys(officialSections(), officialDefinition())

describe("AI read permissions of the provisioning transaction", () => {
  it("applies the initial values when the seed script creates the official template for the first time", async () => {
    const { db, permissionStatements } = recordingDb()

    const templateId = await provisionOfficialTemplate(provisionTxOn(db))

    expect(permissionStatements).toHaveLength(1)
    expect(permissionStatements[0].sql).toMatch(/^insert into permisos_lectura_ia .*on conflict .* do nothing$/)
    expect(permissionStatements[0].values).toEqual([templateId, initial])
    expect(initial).toContain("bibliografia")
    expect(initial).not.toContain("asignatura")
  })

  it("turns nothing on when it rebuilds the structure of a template that already existed", async () => {
    const { db, permissionStatements } = recordingDb()

    await buildStructure(provisionTxOn(db), { newBlockId: randomUUID, newFieldId: randomUUID }, randomUUID(), officialSections(), officialDefinition())

    expect(permissionStatements).toEqual([])
  })

  it("retains only the named keys, from the provisioning and the structure transactions", async () => {
    const templateId = randomUUID()
    for (const txOn of [provisionTxOn, structureTxOn]) {
      const { db, permissionStatements } = recordingDb()

      await txOn(db).retainAiPermissions(templateId, ["descripcion"])

      expect(permissionStatements).toEqual([{ sql: "delete from permisos_lectura_ia where plantilla_id = ?::uuid and not (clave_campo_plantilla = any(?::text[]))", values: [templateId, ["descripcion"]] }])
    }
  })
})
