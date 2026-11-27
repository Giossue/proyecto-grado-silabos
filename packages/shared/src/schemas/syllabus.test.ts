// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { changeRequestSchema, deadlineExtensionSchema, draftFieldSchema, listingFiltersSchema, submissionSchema, teacherAssistantRequestSchema, TEACHER_ASSISTANT_MESSAGE_MAX, lockVersionSchema } from "./syllabus"

describe("syllabus schemas", () => {
  it("validate listing filters", async () => {
    expect(await schemaErrors(listingFiltersSchema(["borrador"]), { q: "a".repeat(121), state: "x", page: 0 })).toEqual({
      q: ["El campo búsqueda no debe tener más de 120 caracteres."],
      state: ["El valor seleccionado en estado no es válido."],
      page: ["El campo página debe ser al menos 1."],
    })
  })

  it("validate review decisions", async () => {
    expect(await schemaErrors(changeRequestSchema, { justification: "corto" })).toEqual({ justification: ["El campo justificación debe tener al menos 10 caracteres."] })
  })

  it("validate drafts and submissions", async () => {
    expect(await schemaErrors(draftFieldSchema, { version_bloqueo: "dos" })).toEqual({ version_bloqueo: ["El campo versión de edición debe ser un número entero."], value: ["El campo valor debe estar presente."] })
    expect(await schemaErrors(draftFieldSchema, { version_bloqueo: 0, value: null })).toEqual({})
    expect(await schemaErrors(submissionSchema, { version_bloqueo: -1, idempotency_key: "x", signature: "x" })).toEqual({
      version_bloqueo: ["El campo versión de edición debe ser al menos 0."],
      idempotency_key: ["El campo identificador de la solicitud debe ser un UUID válido."],
      signature: ["El campo firma electrónica debe ser una lista."],
    })
  })

  it("validate process changes with their own messages", async () => {
    expect(await schemaErrors(deadlineExtensionSchema, { stage: "x", due_at: "mañana" })).toEqual({
      stage: ["La prórroga solo modifica la fecha límite de entrega."],
      due_at: ["El campo fecha límite debe ser una fecha válida."],
    })
  })
})

describe("teacher assistant request", () => {
  const valid = { message: "Mejore la descripción", idempotency_key: "90000000-0000-4000-8000-000000000001" }

  it("asks for a text of up to 4000 characters and a request identifier", async () => {
    expect(TEACHER_ASSISTANT_MESSAGE_MAX).toBe(4000)
    expect(await schemaErrors(teacherAssistantRequestSchema(), valid)).toEqual({})
    expect(await schemaErrors(teacherAssistantRequestSchema(), { ...valid, message: "x".repeat(4000) })).toEqual({})
    expect(await schemaErrors(teacherAssistantRequestSchema(), { message: "x".repeat(4001), idempotency_key: "otra" })).toEqual({
      message: ["El campo pedido no debe tener más de 4000 caracteres."],
      idempotency_key: ["El campo clave del pedido debe ser un UUID válido."],
    })
    expect(Object.keys(await schemaErrors(teacherAssistantRequestSchema(10), { ...valid, message: null }))).toEqual(["message"])
  })

  it("leaves the schema of a lock version as it was", async () => {
    expect(await schemaErrors(lockVersionSchema, { version_bloqueo: 0 })).toEqual({})
    expect(Object.keys(await schemaErrors(lockVersionSchema, {}))).toEqual(["version_bloqueo"])
  })
})
