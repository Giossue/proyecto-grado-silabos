// @vitest-environment node
import { describe, expect, it } from "vitest"
import { generateTotpSecret, replayCacheKey, totpCode, totpCounter, verifyTotp, type TotpReplayCache } from "./totp"

const SECRET = "JBSWY3DPEHPK3PXP"
const NOW = 1_800_000_015

function memoryCache(): TotpReplayCache & { entries: Map<string, { value: number; seconds: number }> } {
  const entries = new Map<string, { value: number; seconds: number }>()
  return {
    entries,
    get: async (key) => entries.get(key)?.value ?? null,
    put: async (key, value, seconds) => void entries.set(key, { value, seconds }),
  }
}

describe("TOTP, as pragmarx/google2fa verifies it for Fortify", () => {
  it("computes the RFC 6238 codes google2fa computes", () => {
    expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", totpCounter(59))).toBe("287082")
    expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", totpCounter(1111111109))).toBe("081804")
  })

  it("accepts the code of the previous, current and next period and caches the current counter", async () => {
    const counter = totpCounter(NOW)
    for (const offset of [-1, 0, 1]) {
      const cache = memoryCache()
      const code = totpCode(SECRET, counter + offset)
      expect(await verifyTotp(SECRET, code, cache, NOW)).toBe(true)
      expect(cache.entries.get(replayCacheKey(code))).toEqual({ value: counter, seconds: 60 })
    }
    for (const offset of [-2, 2]) expect(await verifyTotp(SECRET, totpCode(SECRET, counter + offset), memoryCache(), NOW)).toBe(false)
  })

  it("refuses a code already used in the same or a later period, like verifyKeyNewer", async () => {
    const cache = memoryCache()
    const code = totpCode(SECRET, totpCounter(NOW))
    expect(await verifyTotp(SECRET, code, cache, NOW)).toBe(true)
    expect(await verifyTotp(SECRET, code, cache, NOW)).toBe(false)
    const next = totpCode(SECRET, totpCounter(NOW) + 1)
    expect(await verifyTotp(SECRET, next, cache, NOW)).toBe(true)
    expect(cache.entries.get(replayCacheKey(next))?.value).toBe(totpCounter(NOW))
  })

  it("compares the code exactly, without trimming or padding", async () => {
    const code = totpCode(SECRET, totpCounter(NOW))
    expect(await verifyTotp(SECRET, ` ${code}`, memoryCache(), NOW)).toBe(false)
    expect(await verifyTotp(SECRET, code.slice(1), memoryCache(), NOW)).toBe(false)
  })

  it("generates 16 base32 characters, like generateSecretKey(16)", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{16}$/)
  })
})
