import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { NEW_PARALLELS_INCOMPLETE, newParallelsSchema, supportDocumentFormSchema } from "./academic"
import { signingFormSchema } from "./signature"
import { convocationTransitionSchema } from "./syllabus"
import { CONDITION_OPTIONS_REQUIRED, assistantMessageSchema, conditionChoiceSchema, fieldLimitFormSchema } from "./template"

const UUID = "01a1c5ba-2222-7000-8000-999999999999"

describe("client form schemas", () => {
  it("require the assistant request and cap its length", async () => {
    expect(await schemaErrors(assistantMessageSchema(5), { message: "" })).toEqual({ message: ["El campo pedido es obligatorio."] })
    expect(Object.keys(await schemaErrors(assistantMessageSchema(5), { message: "demasiado" }))).toEqual(["message"])
    expect(await schemaErrors(assistantMessageSchema(5), { message: "hola" })).toEqual({})
  })

  it("only accept pausing or resuming a convocation", async () => {
    expect(await schemaErrors(convocationTransitionSchema, { transition: "pausar" })).toEqual({})
    expect(Object.keys(await schemaErrors(convocationTransitionSchema, { transition: "cerrar" }))).toEqual(["transition"])
  })

  it("ask for the signature file and its password", async () => {
    expect(await schemaErrors(signingFormSchema, { certificate: null, password: "" })).toEqual({
      certificate: ["Elija su archivo .p12 o .pfx"],
      password: ["Escriba la clave de su firma"],
    })
    expect(await schemaErrors(signingFormSchema, { certificate: new File(["x"], "firma.p12"), password: "clave" })).toEqual({})
  })

  it("ask for the support document file and a trimmed name of up to 180 characters", async () => {
    expect(await schemaErrors(supportDocumentFormSchema, { file: null, title: "   " })).toEqual({
      file: ["Elija el archivo."],
      title: ["Escriba el nombre del documento."],
    })
    expect(await schemaErrors(supportDocumentFormSchema, { file: new File(["x"], "guia.pdf"), title: "a".repeat(181) })).toEqual({ title: ["El nombre no puede pasar de 180 caracteres."] })
  })

  it("require the shift and the teacher of new parallels", async () => {
    expect(Object.keys(await schemaErrors(newParallelsSchema(), { shift: "", user_id: "" })).sort()).toEqual(["shift", "user_id"])
    expect(await schemaErrors(newParallelsSchema(), { shift: "matutina", user_id: UUID })).toEqual({})
    expect(NEW_PARALLELS_INCOMPLETE).toBe("Elija la jornada y el docente de los nuevos paralelos")
  })

  it("accept a whole field limit inside the allowed range", async () => {
    const schema = fieldLimitFormSchema("Fuera de rango")
    expect(await schemaErrors(schema, { limit: " 500 " })).toEqual({})
    for (const limit of ["", "0", "50001", "12.5", "abc"]) expect(await schemaErrors(schema, { limit })).toEqual({ limit: ["Fuera de rango"] })
  })

  it("need at least one option once a condition source is chosen", async () => {
    expect(await schemaErrors(conditionChoiceSchema, { source: "", options: [] })).toEqual({})
    expect(await schemaErrors(conditionChoiceSchema, { source: "campo", options: [] })).toEqual({ options: [CONDITION_OPTIONS_REQUIRED] })
    expect(await schemaErrors(conditionChoiceSchema, { source: "campo", options: ["a"] })).toEqual({})
  })
})
