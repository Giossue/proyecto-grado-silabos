// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { encrypt } from "../http/encrypter"
import { authWorld, cookieHeaderFrom, totpCode, type AuthWorld } from "./betterAuthTesting"
import { importLegacyTwoFactor } from "./legacyAuth"
import { testKey } from "./testing"

const USER = "0193a3c2-1111-7000-8000-000000000001"
const PASSWORD = "Demo-2026!"
const EMAIL = "docente@silabos.test"
const LEGACY_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DP"
const LEGACY_CODES = ["AAAAAAAAAA-BBBBBBBBBB", "CCCCCCCCCC-DDDDDDDDDD"]

let world: AuthWorld

async function signIn(): Promise<string> {
  const { headers, response } = await world.auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, headers: new Headers({ origin: "http://localhost:3000" }), returnHeaders: true })
  expect(response).toMatchObject({ twoFactorRedirect: true })
  return cookieHeaderFrom(headers.getSetCookie())
}

beforeEach(async () => {
  world = authWorld()
  await world.addUser({ id: USER, email: EMAIL, twoFactorEnabled: true }, PASSWORD)
})

describe("importLegacyTwoFactor", () => {
  const legacy = () => [{ userId: USER, secret: encrypt(LEGACY_SECRET, testKey, true), recoveryCodes: encrypt(JSON.stringify(LEGACY_CODES), testKey, true) }]

  it("moves an APP_KEY-sealed Fortify secret into the plugin so the same authenticator keeps working", async () => {
    expect(await importLegacyTwoFactor(world.auth, legacy(), testKey)).toBe(1)
    expect(world.db.twoFactor).toHaveLength(1)
    expect(String(world.db.twoFactor[0].secret)).not.toContain(LEGACY_SECRET)
    const cookie = await signIn()
    const { headers } = await world.auth.api.verifyTOTP({ body: { code: totpCode(LEGACY_SECRET) }, headers: new Headers({ cookie }), returnHeaders: true })
    expect(headers.getSetCookie().some((header) => header.startsWith("silabos-ueb.session_token="))).toBe(true)
  })

  it("keeps the legacy recovery codes valid once each", async () => {
    await importLegacyTwoFactor(world.auth, legacy(), testKey)
    const first = await signIn()
    await world.auth.api.verifyBackupCode({ body: { code: LEGACY_CODES[1] }, headers: new Headers({ cookie: first }) })
    const second = await signIn()
    await expect(world.auth.api.verifyBackupCode({ body: { code: LEGACY_CODES[1] }, headers: new Headers({ cookie: second }) })).rejects.toMatchObject({ body: { code: "INVALID_BACKUP_CODE" } })
  })

  it("is idempotent", async () => {
    await importLegacyTwoFactor(world.auth, legacy(), testKey)
    expect(await importLegacyTwoFactor(world.auth, legacy(), testKey)).toBe(0)
    expect(world.db.twoFactor).toHaveLength(1)
  })
})
