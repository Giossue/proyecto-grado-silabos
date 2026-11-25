// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-golden.json"
import { DecryptError, decrypt, encrypt, parseAppKey } from "./encrypter"
import { cookiePrefix, parseCookieHeader, stripValidCookiePrefix } from "./cookies"
import { serializeString, unserializeString } from "./phpSerialize"
import { hashPasswordForCookie, loginSessionKey, recallerCookieName } from "./sessionGuard"

const key = parseAppKey(golden.appKey)

function tamperMac(payload: string): string {
  const envelope = JSON.parse(Buffer.from(payload, "base64").toString("utf8"))
  envelope.mac = envelope.mac.replace(/^./, (c: string) => (c === "a" ? "b" : "a"))
  return Buffer.from(JSON.stringify(envelope)).toString("base64")
}

describe("Laravel encrypter", () => {
  it("decrypts the session payload written by PHP and returns the serialized JSON", () => {
    const raw = Buffer.from(golden.sessionPayload, "base64").toString("utf8")
    const serialized = decrypt(raw, key, false)
    const json = unserializeString(serialized)
    expect(JSON.parse(json)).toEqual(golden.attributes)
    expect(decrypt(raw, key, true)).toBe(json)
  })

  it("round-trips a value encrypted in TypeScript", () => {
    const value = "Sesión «ñ» 😀"
    expect(decrypt(encrypt(value, key, true), key, true)).toBe(value)
    expect(decrypt(encrypt(value, key, false), key, false)).toBe(value)
  })

  it("rejects a payload whose MAC does not match", () => {
    expect(() => decrypt(tamperMac(golden.sessionCookie), key, false)).toThrow(DecryptError)
  })

  it("rejects a payload encrypted with another key", () => {
    const raw = Buffer.from(golden.sessionPayloadWithOtherKey, "base64").toString("utf8")
    expect(() => decrypt(raw, key, true)).toThrow(DecryptError)
  })

  it("rejects a payload that is not a Laravel envelope", () => {
    expect(() => decrypt("not-base64-json", key, false)).toThrow(DecryptError)
    expect(() => decrypt(Buffer.from('{"iv":"x"}').toString("base64"), key, false)).toThrow(DecryptError)
  })

  it("rejects an app key without the expected length", () => {
    expect(() => parseAppKey("base64:" + Buffer.from("short").toString("base64"))).toThrow()
  })
})

describe("Laravel cookies", () => {
  it("decrypts the session cookie and strips its HMAC prefix", () => {
    const plain = decrypt(golden.sessionCookie, key, false)
    expect(plain.startsWith(cookiePrefix(golden.cookieName, key))).toBe(true)
    expect(stripValidCookiePrefix(golden.cookieName, plain, key)).toBe(golden.sessionId)
  })

  it("refuses a value whose prefix belongs to another cookie", () => {
    const plain = decrypt(golden.sessionCookie, key, false)
    expect(stripValidCookiePrefix("XSRF-TOKEN", plain, key)).toBeNull()
  })

  it("reads the XSRF header the SPA sends", () => {
    const plain = decrypt(golden.xsrfHeader, key, false)
    expect(stripValidCookiePrefix("XSRF-TOKEN", plain, key)).toBe(golden.csrfToken)
  })

  it("parses a cookie header with encoded values", () => {
    expect(parseCookieHeader("a=1; silabos-ueb-session=eyJ%3D; b=x=y")).toEqual(
      new Map([["a", "1"], ["silabos-ueb-session", "eyJ="], ["b", "x=y"]]),
    )
    expect(parseCookieHeader(null)).toEqual(new Map())
  })
})

describe("PHP serialization", () => {
  it("unserializes multibyte strings by byte length", () => {
    const value = "«ñ» 😀 \"quoted\";"
    expect(unserializeString(serializeString(value))).toBe(value)
    expect(serializeString("ñ")).toBe('s:2:"ñ";')
  })

  it("rejects anything that is not a serialized string", () => {
    expect(() => unserializeString('a:0:{}')).toThrow()
    expect(() => unserializeString('s:5:"abc";')).toThrow()
    expect(() => unserializeString('s:3:"abc"')).toThrow()
  })
})

describe("Session guard keys", () => {
  it("uses the same login key and recaller cookie name as SessionGuard", () => {
    expect(loginSessionKey()).toBe(golden.loginKey)
    expect(recallerCookieName()).toBe(golden.loginKey.replace("login_", "remember_"))
  })

  it("hashes the password with the app key string as HMAC key", () => {
    expect(hashPasswordForCookie(golden.passwordHash, golden.appKey)).toBe(golden.passwordHashForCookie)
  })
})
