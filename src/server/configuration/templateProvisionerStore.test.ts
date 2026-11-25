import { drizzle } from "drizzle-orm/node-postgres"
import { describe, expect, it } from "vitest"
import * as schema from "@/db/schema"
import { officialSections } from "./officialTemplate"
import type { ProvisionTx } from "./templateProvisioner"
import { provisionOfficialTemplate, provisionTx } from "./templateProvisionerStore"
import type { DocumentSection, StoredField } from "./templateStructure"

function sequence(prefix: string) {
  let next = 0
  return () => `${prefix}-${++next}`
}

describe("provisionOfficialTemplate", () => {
  it("creates the official structure with blocks numbered before their section and fields after the document", async () => {
    const synced: DocumentSection[][] = []
    const fields: StoredField[] = []
    const tx = {
      anyTemplate: async () => false,
      insertTemplate: async () => undefined,
      syncDocument: async (_templateId: string, sections: DocumentSection[]) => {
        synced.push(sections)
      },
      insertField: async (field: StoredField) => {
        fields.push(field)
      },
    } as unknown as ProvisionTx
    const ids = { template: () => "template", block: sequence("block"), field: sequence("field") } as unknown as Parameters<typeof provisionOfficialTemplate>[1]
    const templateId = await provisionOfficialTemplate(tx, ids)
    const official = officialSections()
    expect(templateId).toBe("template")
    expect(synced[0]).toEqual([])
    expect(synced[1].map((section) => section.key)).toEqual(official.map((section) => section.key))
    const first = synced[1][0]
    expect(first.blocks.map((block) => block.id)).toEqual(official[0].fields.map((_, index) => `block-${index + 1}`))
    expect(first.id).toBe(`block-${official[0].fields.length + 1}`)
    expect(first.position).toBe(1)
    expect(fields.map((field) => field.id)).toEqual(official.flatMap((section) => section.fields).map((_, index) => `field-${index + 1}`))
    expect(fields[0]).toMatchObject({ templateId: "template", blockId: "block-1", responsible: official[0].fields[0].responsible })
  })

  it("does nothing when a template already exists", async () => {
    const tx = { anyTemplate: async () => true } as unknown as ProvisionTx
    expect(await provisionOfficialTemplate(tx)).toBeNull()
  })
})

describe("provisionTx.hasStructure", () => {
  it("stops at the first missing part of the structure", async () => {
    const statements: string[] = []
    const client = {
      query: async (query: { text: string }) => {
        statements.push(query.text)
        return { rows: [], rowCount: 0, fields: [] }
      },
    }
    const db = drizzle({ client: client as never, schema })
    expect(await provisionTx(db).hasStructure("01a1c5ba-10b4-7129-925f-c28a9489323c")).toBe(false)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('from "secciones_plantilla"')
  })
})
