// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/email-golden.json"
import { collapseName, emailShape, isValidFullName, isValidNamePart, normalizeName, randomString } from "./accountRules"

describe("emailShape", () => {
  it("only decides what egulias RFCValidation decides the same way", () => {
    for (const { email, valid } of golden) {
      const shape = emailShape(email)
      if (shape !== "unknown") expect([email, shape]).toEqual([email, valid ? "valid" : "invalid"])
    }
  })

  it("decides the common addresses without asking Laravel", () => {
    expect(emailShape("nueva.docente@silabos.test")).toBe("valid")
    expect(emailShape("sin-arroba")).toBe("invalid")
    expect(emailShape("docente@")).toBe("invalid")
    expect(emailShape('"doc ente"@ueb.edu.ec')).toBe("unknown")
  })
})

describe("person names", () => {
  it("collapses whitespace and uppercases like PersonName::normalize", () => {
    expect(collapseName("  Ana\u00a0 María \n Pérez ")).toBe("Ana María Pérez")
    expect(normalizeName("ana maría pérez gómez")).toBe("ANA MARÍA PÉREZ GÓMEZ")
  })

  it("accepts letters joined by a space, apostrophe or hyphen", () => {
    expect(isValidNamePart("De la Cruz-O'Neil")).toBe(true)
    expect(isValidNamePart("María José")).toBe(true)
    expect(isValidNamePart("Juan2")).toBe(false)
    expect(isValidNamePart("Ana--Luz")).toBe(false)
    expect(isValidFullName("Ana Pérez")).toBe(true)
    expect(isValidFullName("Ana")).toBe(false)
  })
})

describe("randomString", () => {
  it("returns alphanumeric strings of the requested length", () => {
    expect(randomString(64)).toMatch(/^[A-Za-z0-9]{64}$/)
  })
})
