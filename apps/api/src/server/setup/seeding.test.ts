import { describe, expect, it } from "vitest"
import { officialSections } from "../configuration/officialTemplate"
import type { ProvisionTx } from "../configuration/templateProvisioner"
import type { DocumentSection, StoredField } from "../configuration/templateStructure"
import { provisionOfficialTemplate, seedOptions } from "./seeding"

describe("seedOptions", () => {
  it("requires the administrator email and password", () => {
    expect(() => seedOptions({})).toThrow("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed the administrator")
    expect(() => seedOptions({ SEED_ADMIN_EMAIL: "admin@example.test" })).toThrow("SEED_ADMIN_PASSWORD")
    expect(() => seedOptions({ SEED_ADMIN_EMAIL: " ", SEED_ADMIN_PASSWORD: "secret" })).toThrow("SEED_ADMIN_EMAIL")
  })

  it("normalizes the email and applies the defaults", () => {
    expect(seedOptions({ SEED_ADMIN_EMAIL: " Admin@Example.TEST ", SEED_ADMIN_PASSWORD: "secret" })).toEqual({
      adminName: "Administrador",
      adminEmail: "admin@example.test",
      adminPassword: "secret",
      bcryptRounds: 12,
    })
    expect(seedOptions({ SEED_ADMIN_EMAIL: "a@example.test", SEED_ADMIN_PASSWORD: "x", SEED_ADMIN_NAME: "Soporte", BCRYPT_ROUNDS: "10" })).toMatchObject({ adminName: "Soporte", bcryptRounds: 10 })
  })
})

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
