import { describe, expect, it } from "vitest"
import { sqlState } from "./errors"

describe("sqlState", () => {
  it("reads the SQLSTATE adapter-pg leaves on the error or its causes", () => {
    expect(sqlState({ code: "P2010", meta: { code: "55P03" } })).toBe("55P03")
    expect(sqlState({ code: "P2034", cause: { originalCode: "40001" } })).toBe("40001")
    expect(sqlState({ name: "DriverAdapterError", cause: { kind: "postgres", code: "23505", originalCode: "23505" } })).toBe("23505")
    expect(sqlState({ driverAdapterError: { cause: { originalCode: "57014" } } })).toBe("57014")
  })

  it("ignores Prisma's own codes and anything that is not an error object", () => {
    expect(sqlState({ code: "P2002" })).toBeNull()
    expect(sqlState(new Error("plain"))).toBeNull()
    expect(sqlState("23505")).toBeNull()
    expect(sqlState(null)).toBeNull()
  })
})
