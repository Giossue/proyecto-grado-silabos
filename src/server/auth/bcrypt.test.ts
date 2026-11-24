// @vitest-environment node
import { describe, expect, it } from "vitest"
import { bcryptCrypt, bcryptHash, bcryptVerify } from "./bcrypt"

const PHP_VECTORS: [string, string, string][] = [
  ["U*U", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW"],
  ["", "$2y$04$abcdefghijklmnopqrstuu", "$2y$04$abcdefghijklmnopqrstuubyCG3zY1GIXMyxfivm.ClDiInHzxjiq"],
  ["x".repeat(80), "$2y$04$0123456789abcdefghijkl", "$2y$04$0123456789abcdefghijkeQTbmm.RcNPT0JaHsD9KFomKrKSIRYFm"],
  ["contraseña", "$2y$05$ZYXWVUTSRQPONMLKJIHGFe", "$2y$05$ZYXWVUTSRQPONMLKJIHGFeRGzVl9QCAr2QQGIq4N8DYfyw/rM98Ru"],
]

describe("bcrypt", () => {
  it("produces the same output as PHP crypt()", () => {
    for (const [password, setting, expected] of PHP_VECTORS) expect(bcryptCrypt(password, setting)).toBe(expected)
  })

  it("verifies a hash made by PHP password_hash and rejects a wrong password", async () => {
    const hash = "$2y$04$KELNt7GJhdOWca26a0YpZuW.leMalyoAyjW6G1msiRK365yeTGzc2"
    expect(await bcryptVerify("secreto-de-prueba", hash)).toBe(true)
    expect(await bcryptVerify("otra", hash)).toBe(false)
  })

  it("makes $2y$ hashes with the requested cost that verify again", async () => {
    const hash = await bcryptHash("una clave", 4)
    expect(hash).toMatch(/^\$2y\$04\$[./A-Za-z0-9]{53}$/)
    expect(await bcryptVerify("una clave", hash)).toBe(true)
  })

  it("does not recognize hashes of another algorithm", async () => {
    expect(await bcryptVerify("x", "$argon2id$v=19$m=65536,t=4,p=1$abc$def")).toBeNull()
  })
})
