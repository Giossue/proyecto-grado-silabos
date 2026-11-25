// @vitest-environment node
import { describe, expect, it } from "vitest"
import { apiJson, jsonError, validationError } from "./responses"

describe("JSON responses", () => {
  it("writes plain JSON without PHP escapes", async () => {
    const response = apiJson({ message: "La cuenta está desactivada.", url: "http://localhost/a/b", hours: 2 })
    expect(await response.text()).toBe('{"message":"La cuenta está desactivada.","url":"http://localhost/a/b","hours":2}')
    expect(response.headers.get("Content-Type")).toBe("application/json")
    expect(response.headers.get("Cache-Control")).toBe("no-cache, private")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("keeps empty lists as lists", async () => {
    expect(await apiJson({ items: [] }).json()).toEqual({ items: [] })
  })

  it("writes error bodies on one line without security headers", async () => {
    const response = jsonError(419, "CSRF token mismatch.")
    expect(response.status).toBe(419)
    expect(await response.text()).toBe('{"message":"CSRF token mismatch."}')
    expect(response.headers.get("X-Content-Type-Options")).toBeNull()
    expect(response.headers.get("Content-Type")).toBe("application/json")
  })

  it("summarizes validation errors", async () => {
    const response = validationError({ email: ["Uno."], password: ["Dos.", "Tres."] })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ message: "Uno. (y 2 errores más)", errors: { email: ["Uno."], password: ["Dos.", "Tres."] } })
  })
})
