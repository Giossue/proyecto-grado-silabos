import { describe, expect, it } from "vitest"
import { userArgs, userData, userResult } from "./prismaAuthDatabase"

const AT = new Date("2026-11-25T12:00:00Z")

describe("Better Auth users on the usuarios table", () => {
  it("addresses the user id as usuario_id in filters, selections and order", () => {
    expect(
      userArgs({
        where: { AND: [{ id: { equals: "u-1" } }, { correo_electronico: { equals: "ana@x.ec", mode: "insensitive" } }], OR: [{ id: { in: ["u-2"] } }] },
        select: { id: true, nombre_usuario: true, image: true, createdAt: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual({
      where: { AND: [{ usuario_id: { equals: "u-1" } }, { correo_electronico: { equals: "ana@x.ec", mode: "insensitive" } }], OR: [{ usuario_id: { in: ["u-2"] } }] },
      select: { usuario_id: true, nombre_usuario: true },
      orderBy: { usuario_id: "asc" },
    })
  })

  it("stores the verified flag as the moment it was set and drops columns the table lacks", () => {
    expect(userData({ correo_verificado_en: true, updatedAt: AT, image: null, nombre_usuario: "ANA", dos_factores_confirmado_en: true }, () => AT)).toEqual({ correo_verificado_en: AT, nombre_usuario: "ANA" })
    expect(userData({ correo_verificado_en: false }, () => AT)).toEqual({ correo_verificado_en: null })
  })

  it("reads the moments back as flags and the usuario_id as the id", () => {
    const row = { usuario_id: "u-1", nombre_usuario: "ANA", correo_verificado_en: AT, usuario_activo: false }
    expect(userResult(row)).toEqual({ id: "u-1", nombre_usuario: "ANA", correo_verificado_en: true, usuario_activo: false })
    expect(userResult([row])).toEqual([userResult(row)])
    expect(userResult(null)).toBeNull()
    expect(userResult(3)).toBe(3)
    expect(userResult({ count: 2 })).toEqual({ count: 2 })
    expect(userResult({ correo_verificado_en: new Date("2026-01-01T00:00:00Z") })).toEqual({ correo_verificado_en: true })
  })
})
