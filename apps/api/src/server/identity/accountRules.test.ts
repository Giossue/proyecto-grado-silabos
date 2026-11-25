// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/email-golden.json"
import { collapseName, emailShape, isValidFullName, isValidNamePart, normalizeName, randomString } from "./accountRules"

describe("emailShape", () => {
  it("decides every address like egulias RFCValidation", () => {
    expect(golden.map(({ email }) => [email, emailShape(email)])).toEqual(golden.map(({ email, valid }) => [email, valid ? "valid" : "invalid"]))
  })

  it("decides quoted local parts, comments and domain literals natively", () => {
    expect(emailShape("nueva.docente@silabos.test")).toBe("valid")
    expect(emailShape("sin-arroba")).toBe("invalid")
    expect(emailShape("docente@")).toBe("invalid")
    expect(emailShape('"doc ente"@ueb.edu.ec')).toBe("valid")
    expect(emailShape('"doc@ente"@ueb.edu.ec')).toBe("valid")
    expect(emailShape("doc(nota)@ueb.edu.ec")).toBe("valid")
    expect(emailShape("docente@[IPv6:2001:db8::1]")).toBe("valid")
    expect(emailShape(5)).toBe("invalid")
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
