import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ApiError } from "@/api/client"
import { applyApiErrors, schemaResolver } from "@/lib/forms"

const schema = z.object({ name: z.string().min(1, "Escriba el nombre.") })
const resolve = (keepPeriods?: boolean) =>
  schemaResolver(schema, keepPeriods === undefined ? undefined : { keepPeriods })({ name: "" }, undefined, { fields: {}, shouldUseNativeValidation: false, criteriaMode: "all" })

describe("schemaResolver", () => {
  it("drops the final period of the messages by default", async () => {
    expect((await resolve()).errors.name?.message).toBe("Escriba el nombre")
  })

  it("keeps the final period when the form asks for it", async () => {
    const { errors } = await resolve(true)
    expect(errors.name?.message).toBe("Escriba el nombre.")
    expect(Object.values(errors.name?.types ?? {}).flat()).toEqual(["Escriba el nombre."])
  })
})

describe("applyApiErrors", () => {
  it("focuses only the first field that the server rejected", () => {
    const setError = vi.fn()
    applyApiErrors(setError, new ApiError("Datos inválidos", 422, { email: ["El correo ya existe"], name: ["Falta el nombre"] }), { fallback: "No se pudo guardar" })

    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError.mock.calls[0]).toEqual(["email", expect.objectContaining({ type: "server", message: "El correo ya existe" }), { shouldFocus: true }])
    expect(setError.mock.calls[1]).toEqual(["name", expect.objectContaining({ type: "server", message: "Falta el nombre" }), { shouldFocus: false }])
  })

  it("keeps the general message without moving the focus when no field was rejected", () => {
    const setError = vi.fn()
    applyApiErrors(setError, new Error("sin red"), { fallback: "No se pudo guardar" })

    expect(setError).toHaveBeenCalledWith("root.server", { type: "server", message: "No se pudo guardar" })
  })
})
