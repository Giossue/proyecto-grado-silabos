// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { Db } from "../../prisma/db"
import { digestPendingOn } from "./dailyDigestQueries"
import { digestSettingsOn } from "./dailyDigestRuntime"

const sqlOf = (parts: TemplateStringsArray, values: unknown[]): { sql: string; values: unknown[] } => {
  const flat: unknown[] = []
  const text = parts.reduce((all, part, index) => {
    if (index === 0) return part
    const value = values[index - 1] as { sql?: string; values?: unknown[] }
    if (value && typeof value.sql === "string") flat.push(...(value.values ?? []))
    else flat.push(value)
    return `${all}${value && typeof value.sql === "string" ? value.sql : "?"}${part}`
  }, "")
  return { sql: text, values: flat }
}

describe("what counts as pending", () => {
  it("only asks while the delivery date, extensions included, has not passed, for the three roles", async () => {
    const queries: { sql: string; values: unknown[] }[] = []
    const db = {
      $queryRaw: vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
        const query = sqlOf(parts, values)
        queries.push(query)
        return query.sql.includes('as "careerId"') ? [{ id: "c", name: "C", email: "c@x", preferences: null, careerId: "00000000-0000-0000-0000-000000000000" }] : []
      }),
    }
    await digestPendingOn(db as unknown as Db, "2026-11-26")
    const withWork = queries.filter((query) => !query.sql.includes('as "careerId"'))
    expect(withWork).toHaveLength(3)
    for (const query of withWork) {
      expect(query.sql).toContain("fecha_entrega")
      expect(query.values).toContain("2026-11-26")
    }
  })
})

describe("summary settings", () => {
  it("does not fall back to the defaults when the saved ones cannot be read", async () => {
    const db = { $queryRaw: async () => Promise.reject(new Error("sin base")) }
    await expect(digestSettingsOn(db as unknown as Db, {})()).rejects.toThrow("sin base")
  })

  it("prefers the saved hour and switch over the defaults", async () => {
    const db = { $queryRaw: async () => [{ clave_ajuste: "notifications.emails", valor_ajuste: false }, { clave_ajuste: "notifications.digest_time", valor_ajuste: "14:30" }] }
    expect(await digestSettingsOn(db as unknown as Db, {})()).toEqual({ enabled: false, time: "14:30" })
    expect(await digestSettingsOn({ $queryRaw: async () => [] } as unknown as Db, {})()).toEqual({ enabled: true, time: "08:00" })
  })
})
