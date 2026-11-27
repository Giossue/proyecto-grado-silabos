// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Db } from "../../prisma/db"
import { teacherAssistantEnabledOn } from "./systemSettings"

function dbWith(rows: [string, unknown][]) {
  const queries: string[] = []
  const db = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      queries.push(strings.join("?"))
      return rows.map(([clave_ajuste, valor_ajuste]) => ({ clave_ajuste, valor_ajuste }))
    },
  }
  return { db: db as unknown as Db, queries }
}

describe("teacherAssistantEnabledOn", () => {
  it("is off until Administration turns it on, whatever the AI provider settings say", async () => {
    const { db, queries } = dbWith([["ai.driver", "deepseek"], ["notifications.emails", true]])

    expect(await teacherAssistantEnabledOn(db)).toBe(false)
    expect(queries).toEqual(["select clave_ajuste, valor_ajuste from ajustes_sistema"])
  })

  it("reads the switch saved in the database on every call", async () => {
    expect(await teacherAssistantEnabledOn(dbWith([["teacher_assistant.enabled", true]]).db)).toBe(true)
    for (const value of [false, "1", "true", 1, null]) expect(await teacherAssistantEnabledOn(dbWith([["teacher_assistant.enabled", value]]).db), String(value)).toBe(false)
  })

  it("stays off when the settings cannot be read", async () => {
    const db = { $queryRaw: async () => Promise.reject(new Error("sin base")) } as unknown as Db

    expect(await teacherAssistantEnabledOn(db)).toBe(false)
  })
})
