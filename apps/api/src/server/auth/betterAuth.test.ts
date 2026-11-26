// @vitest-environment node
import { describe, expect, it } from "vitest"
import { authSettings } from "./betterAuth"
import { authWorld, ORIGIN } from "./betterAuthTesting"

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

describe("session cleanup", () => {
  it("deletes expired sessions and verifications of every user when a new session is created, keeping live ones", async () => {
    const world = authWorld()
    await world.addUser({ id: "user-a", email: "ana@ueb.edu.ec" }, "secreta")
    const past = new Date(Date.now() - 60_000)
    const future = new Date(Date.now() + 3_600_000)
    const session = (id: string, userId: string, expiresAt: Date) => ({ id, token: `token-${id}`, userId, expiresAt, createdAt: past, updatedAt: past })
    world.db.session.push(session("expired-a", "user-a", past), session("expired-b", "user-b", past), session("live-b", "user-b", future))
    world.db.verification.push({ id: "old", identifier: "x", value: "y", expiresAt: past, createdAt: past, updatedAt: past }, { id: "new", identifier: "x", value: "z", expiresAt: future, createdAt: past, updatedAt: past })

    await world.auth.api.signInEmail({ body: { email: "ana@ueb.edu.ec", password: "secreta" }, headers: new Headers({ origin: ORIGIN }) })

    const ids = world.db.session.map((row) => row.id)
    expect(ids).not.toContain("expired-a")
    expect(ids).not.toContain("expired-b")
    expect(ids).toContain("live-b")
    expect(world.db.session.filter((row) => row.userId === "user-a")).toHaveLength(1)
    expect(world.db.verification.map((row) => row.id)).toEqual(["new"])
  })
})
