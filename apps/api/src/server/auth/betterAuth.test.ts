// @vitest-environment node
import { describe, expect, it } from "vitest"
import { authSettings } from "./betterAuth"

const base = { BETTER_AUTH_SECRET: "s".repeat(40) }

describe("authSettings", () => {
  it("takes the lifetime, the trusted origins and the first frontend URL from the environment", () => {
    const settings = authSettings({ ...base, SESSION_LIFETIME: "30", STATEFUL_DOMAINS: "localhost:3600, silabos.ueb.edu.ec", FRONTEND_URL: "http://localhost:3000,http://127.0.0.1:4173" })
    expect(settings.lifetimeMinutes).toBe(30)
    expect(settings.baseURL).toBe("http://localhost:3000")
    expect(settings.trustedOrigins).toEqual(["http://localhost:3600", "https://localhost:3600", "http://silabos.ueb.edu.ec", "https://silabos.ueb.edu.ec"])
  })

  it("keeps 240 minutes by default, prefers BETTER_AUTH_URL and refuses to run without a secret", () => {
    expect(authSettings({ ...base, BETTER_AUTH_URL: "https://silabos.ueb.edu.ec" })).toMatchObject({ lifetimeMinutes: 240, baseURL: "https://silabos.ueb.edu.ec", trustedOrigins: ["http://localhost:3000", "https://localhost:3000"] })
    expect(() => authSettings({})).toThrow("BETTER_AUTH_SECRET is not configured.")
  })
})
