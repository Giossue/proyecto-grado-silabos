import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { NEW_PARALLELS_INCOMPLETE, newParallelsSchema, supportDocumentFormSchema } from "./academic"
import { signingFormSchema } from "./signature"
import { convocationTransitionSchema } from "./syllabus"
import { CONDITION_OPTIONS_REQUIRED, RESPONSE_OPTIONS_REQUIRED, assistantMessageSchema, conditionChoiceSchema, fieldLimitFormSchema, responseToolSchema, tableDesignSchema, tableDesignerSchema } from "./template"

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

describe("response tool schema", () => {
  const values = { kind: "texto", options: [], required: true, help: "", maxLength: "", minChoices: "", maxChoices: "", display: "lista", condition: { source: "", options: [] } }
  const two = [{ const: "o1", title: "Aula" }, { const: "o2", title: "Campo" }]

  it("checks the character limit and how many choices to pick against the options", async () => {
    const free = responseToolSchema({ fixed: false, requireOptions: false, conditional: false, current: null })
    expect(await schemaErrors(free, { ...values, maxLength: "5000" })).toEqual({ settings: ["El límite de caracteres va de 1 a 3000."] })
    expect(await schemaErrors(free, { ...values, kind: "varias", minChoices: "1" })).toEqual({ settings: ["Escriba las opciones antes de fijar cuántas elegir."] })
    expect(await schemaErrors(free, { ...values, kind: "varias", options: two, minChoices: "3" })).toEqual({ settings: ["Cuántas elegir va de 1 a 2, el número de opciones."] })
    expect(await schemaErrors(free, { ...values, kind: "varias", options: two, minChoices: "2", maxChoices: "1" })).toEqual({ settings: ["El mínimo para elegir no puede superar el máximo."] })
    expect(await schemaErrors(free, { ...values, kind: "varias", options: two, minChoices: "1", maxChoices: "2" })).toEqual({})
  })

  it("asks for options and keeps the fixed choice counts when Administración fixed the response", async () => {
    const fixed = responseToolSchema({ fixed: true, requireOptions: false, conditional: false, current: { minChoices: 3 } })
    expect(Object.keys(await schemaErrors(fixed, { ...values, kind: "varias" }))).toEqual(["options", "settings"])
    expect(await schemaErrors(fixed, { ...values, kind: "varias", options: two })).toEqual({ settings: ["Esta respuesta pide elegir al menos 3: deje al menos 3 opciones."] })
    const capped = responseToolSchema({ fixed: true, requireOptions: false, conditional: false, current: { maxChoices: 1 } })
    expect(await schemaErrors(capped, { ...values, kind: "una", options: [] })).toEqual({ options: [RESPONSE_OPTIONS_REQUIRED], settings: ["Esta respuesta permite elegir hasta 1: deje al menos 1 opción."] })
  })

  it("asks for an option of «Mostrar solo si» only when the condition is shown", async () => {
    const condition = { source: "campo:0", options: [] }
    expect(await schemaErrors(responseToolSchema({ fixed: false, requireOptions: false, conditional: true, current: null }), { ...values, condition })).toEqual({ condition: ["Elija al menos una opción para «Mostrar solo si»"] })
    expect(await schemaErrors(responseToolSchema({ fixed: false, requireOptions: false, conditional: false, current: null }), { ...values, condition })).toEqual({})
  })

  it("turns the written settings into numbers", () => {
    const parsed = responseToolSchema({ fixed: false, requireOptions: false, conditional: false, current: null }).parse({ ...values, kind: "varias", options: two, help: "Ayuda", minChoices: " 1 ", maxChoices: "" })
    expect(parsed.settings).toEqual({ required: true, help: "Ayuda", maxLength: undefined, minChoices: 1, maxChoices: undefined, display: "lista" })
  })
})

describe("table designer schema", () => {
  const draft = {
    kind: "libros", label: "  Libros ", list: "filas", item: " libro ", min: "1", max: " 20 ", initial: "x", band: null, extras: { rules: [] },
    columns: [
      { key: "autor", title: " Autor ", type: "text", max_length: "200", multiline: true, maximum: "999.99", decimals: "2", width: "", required: true, options: [] },
      { title: "Horas", type: "number", max_length: "1000", multiline: false, maximum: "12,5", decimals: "1", width: "90", required: false, options: [] },
      { title: "Lugar", type: "choice", max_length: "1000", multiline: false, maximum: "999.99", decimals: "2", width: "abc", required: false, options: [{ value: "o1", label: "Aula" }, { label: "Campo" }] },
    ],
  }

  it("converts the draft into the design the server validates with tableDesignSchema", async () => {
    const design = tableDesignerSchema.parse(draft)
    expect(design).toEqual({
      kind: "libros", label: "Libros", list: "filas", item: "libro", min: 1, max: 20, initial: "x", band: null, extras: { rules: [] },
      columns: [
        { key: "autor", title: "Autor", type: "text", width: null, required: true, max_length: 200, multiline: true },
        { title: "Horas", type: "number", width: 90, required: false, maximum: 12.5, decimals: 1 },
        { title: "Lugar", type: "choice", width: "abc", required: false, options: [{ value: "o1", label: "Aula" }, { label: "Campo" }] },
      ],
    })
    expect(await schemaErrors(tableDesignSchema(design), design)).toEqual({ initial: ["El campo filas al empezar debe ser un número entero.", "«Al empezar» debe estar entre el mínimo y el máximo."], "columns.2.width": ["El campo ancho debe ser un número entero.", "El campo ancho debe ser al menos 20."] })
  })

  it("leaves out the extras the design does not have", () => {
    expect(tableDesignerSchema.parse({ ...draft, extras: undefined })).not.toHaveProperty("extras")
  })
})
