import { describe, expect, it } from "vitest"
import { seedOptions } from "./seeding"

describe("seedOptions", () => {
  it("requires the administrator email and password", () => {
    expect(() => seedOptions({})).toThrow("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed the administrator")
    expect(() => seedOptions({ SEED_ADMIN_EMAIL: "admin@example.test" })).toThrow("SEED_ADMIN_PASSWORD")
    expect(() => seedOptions({ SEED_ADMIN_EMAIL: " ", SEED_ADMIN_PASSWORD: "secret" })).toThrow("SEED_ADMIN_EMAIL")
  })

  it("normalizes the email and applies the defaults", () => {
    expect(seedOptions({ SEED_ADMIN_EMAIL: " Admin@Example.TEST ", SEED_ADMIN_PASSWORD: "secret" })).toEqual({
      adminName: "Administrador",
      adminEmail: "admin@example.test",
      adminPassword: "secret",
      bcryptRounds: 12,
    })
    expect(seedOptions({ SEED_ADMIN_EMAIL: "a@example.test", SEED_ADMIN_PASSWORD: "x", SEED_ADMIN_NAME: "Soporte", BCRYPT_ROUNDS: "10" })).toMatchObject({ adminName: "Soporte", bcryptRounds: 10 })
  })
})
