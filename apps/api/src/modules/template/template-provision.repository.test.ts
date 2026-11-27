// @vitest-environment node
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { Db } from "../../prisma/db"
import { allowedAiKeysOn, saveAiPermissionOn } from "../../server/ai/readPermissionStore"
import { initialAiReadableKeys } from "../../server/ai/readableFields"
import { officialDefinition, officialSections } from "../../server/configuration/officialTemplate"
import { buildStructure } from "../../server/configuration/templateProvisioner"
import { provisionOfficialTemplate } from "../../server/setup/seeding"
import { provisionTxOn } from "./template-provision.repository"

type Statement = { sql: string; values: unknown[] }

function recordingDb(rows: { key: string }[] = []) {
  const permissionStatements: Statement[] = []
  const nothing = async () => ({ count: 0 })
  const model = { findMany: async () => [], findFirst: async () => null, create: nothing, updateMany: nothing, deleteMany: nothing }
  const record = (strings: TemplateStringsArray, values: unknown[]) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim()
    if (sql.includes("lectura_ia_permitida")) permissionStatements.push({ sql, values })
    return sql
  }
  const db = {
    campos_plantilla: model,
    definiciones_campo: model,
    secciones_plantilla: model,
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (record(strings, values).includes("lectura_ia_permitida") ? rows : []),
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (record(strings, values), 1),
  }
  return { db: db as unknown as Db, permissionStatements }
}

const initial = initialAiReadableKeys(officialSections(), officialDefinition())
const ALLOW =
  "update campos_plantilla set lectura_ia_permitida = true where plantilla_id = ?::uuid and vigente_en_plantilla and clave_campo_plantilla = any(?::text[])"
const READ = "select clave_campo_plantilla as key from campos_plantilla where plantilla_id = ?::uuid and vigente_en_plantilla and lectura_ia_permitida"

describe("AI read permission stored on the template field", () => {
  it("applies the initial values when the seed script creates the official template for the first time", async () => {
    const { db, permissionStatements } = recordingDb()

    const templateId = await provisionOfficialTemplate(provisionTxOn(db))

    expect(permissionStatements).toEqual([{ sql: ALLOW, values: [templateId, initial] }])
    expect(initial).toContain("bibliografia")
    expect(initial).not.toContain("asignatura")
  })

  it("turns nothing on when it rebuilds the structure of a template that already existed", async () => {
    const { db, permissionStatements } = recordingDb()

    await buildStructure(provisionTxOn(db), { newBlockId: randomUUID, newFieldId: randomUUID }, randomUUID(), officialSections(), officialDefinition())

    expect(permissionStatements).toEqual([])
  })

  it("reads the permission only from the fields that are still in the template", async () => {
    const templateId = randomUUID()
    const { db, permissionStatements } = recordingDb([{ key: "descripcion" }, { key: "unidades" }])

    expect(await allowedAiKeysOn(db, templateId)).toEqual(new Set(["descripcion", "unidades"]))
    expect(await provisionTxOn(db).aiReadableKeys(templateId)).toEqual(new Set(["descripcion", "unidades"]))

    expect(permissionStatements).toEqual([
      { sql: READ, values: [templateId] },
      { sql: READ, values: [templateId] },
    ])
  })

  it("changes only the permission column of the live field", async () => {
    const templateId = randomUUID()
    const { db, permissionStatements } = recordingDb()

    await saveAiPermissionOn(db, templateId, "descripcion", false)

    expect(permissionStatements).toEqual([
      {
        sql: "update campos_plantilla set lectura_ia_permitida = ? where plantilla_id = ?::uuid and vigente_en_plantilla and clave_campo_plantilla = ?",
        values: [false, templateId, "descripcion"],
      },
    ])
  })
})
