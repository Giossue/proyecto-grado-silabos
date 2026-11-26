// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { careerSchema, facultySchema, MALLA_STATE_LABELS, mallaSchema, mallaTargetSchema, parallelsSchema, periodSchema, requirementSchema, STUDY_MODALITIES, studyModalityLabel, subjectSchema } from "./academic"

const UUID = "01a1c5ba-2222-7000-8000-999999999999"

describe("academic schemas", () => {
  it("validate a faculty and its catalog libraries", async () => {
    expect(await schemaErrors(facultySchema({ updating: false }), { nombre: "FCA", campus: "Campus X", catalog_libraries: ["A1", "A1", "con espacio"] })).toEqual({
      "catalog_libraries.0": ["El campo catalog_libraries.0 tiene un valor duplicado."],
      "catalog_libraries.1": ["El campo catalog_libraries.1 tiene un valor duplicado."],
      "catalog_libraries.2": ["El formato del campo catalog_libraries.2 no es válido."],
    })
  })

  it("no longer asks for a campus nor a requirement type", async () => {
    expect(await schemaErrors(facultySchema({ updating: false }), { nombre: "FCA" })).toEqual({})
    expect(await schemaErrors(requirementSchema({ subjectId: UUID, hasSubject: true }), { subject_id: UUID, requirement_id: "01a1c5ba-2222-7000-8000-111111111111" })).toEqual({})
  })

  it("validate a career with its unique code", async () => {
    const schema = careerSchema({ facultyExists: async () => true, codeAvailable: async () => false, updating: false })
    expect(await schemaErrors(schema, { faculty_id: UUID, modality: "presencial", code: "ADM", nombre: "Administración", cycle_count: 31 })).toEqual({
      code: ["Ya existe una carrera con ese código."],
      cycle_count: ["El campo cantidad de ciclos no debe ser mayor que 30."],
    })
  })

  it("store study modalities as technical values and show them with their labels", async () => {
    const schema = careerSchema({ facultyExists: async () => true, codeAvailable: async () => true, updating: false })
    const career = { faculty_id: UUID, code: "ADM", nombre: "Administración", cycle_count: 10 }
    expect(STUDY_MODALITIES).toEqual(["presencial", "semipresencial", "en_linea", "a_distancia", "hibrida"])
    expect(STUDY_MODALITIES.map(studyModalityLabel)).toEqual(["Presencial", "Semipresencial", "En línea", "A distancia", "Híbrida"])
    expect(studyModalityLabel(null)).toBeNull()
    expect(await schemaErrors(schema, { ...career, modality: "en_linea" })).toEqual({})
    expect(Object.keys(await schemaErrors(schema, { ...career, modality: "En línea" }))).toEqual(["modality"])
  })

  it("validate period dates, and the order of the dates when editing", async () => {
    expect(await schemaErrors(periodSchema({ startsOn: "2026-05-01", creating: false }), { starts_on: "2026-05-01", ends_on: "2026-04-01", teaching_weeks: 53 })).toEqual({
      ends_on: ["El campo fecha de fin debe ser una fecha posterior o igual a fecha de inicio."],
      teaching_weeks: ["El campo teaching weeks no debe ser mayor que 52."],
    })
    expect(await schemaErrors(periodSchema({ startsOn: "x", creating: true }), { starts_on: "x" })).toEqual({
      starts_on: ["El campo fecha de inicio debe ser una fecha válida."],
      ends_on: ["El campo fecha de fin es obligatorio."],
    })
  })

  it("validate subjects, requirements and parallels", async () => {
    expect(await schemaErrors(subjectSchema(), { code: "A1", nombre: "Mate", cycle: 1, organization_unit: "basica", creditos: "x", horas_totales: 1, horas_ac: -1, horas_pae: 1, horas_aa: 1 })).toEqual({
      creditos: ["El campo creditos debe ser un número."],
      horas_ac: ["El campo horas ac debe ser al menos 0."],
    })
    expect(await schemaErrors(requirementSchema({ subjectId: UUID, hasSubject: true }), { subject_id: UUID, requirement_id: UUID, type: "correquisito" })).toEqual({
      requirement_id: ["Los campos materia requisito y materia deben ser diferentes."],
    })
    expect(await schemaErrors(parallelsSchema(), { subject_id: UUID, codes: ["A", "A"], shift: "matutina" })).toEqual({
      user_id: ["Seleccione el docente del paralelo."],
      "codes.0": ["El campo código de paralelo tiene un valor duplicado."],
      "codes.1": ["El campo código de paralelo tiene un valor duplicado."],
    })
  })

  it("validate a new malla: name unique in the career, cycles and state", async () => {
    const taken = mallaSchema({ nameAvailable: async () => false, updating: false })
    expect(await schemaErrors(taken, { name: "Malla 2025", cycle_count: 0, state: "abierta" })).toEqual({
      name: ["Ya existe una malla con ese nombre en esta carrera."],
      cycle_count: ["El campo cantidad de ciclos debe ser al menos 1."],
      state: ["El valor seleccionado en estado no es válido."],
    })
    expect(await schemaErrors(taken, {})).toEqual({
      name: ["El campo nombre es obligatorio."],
      cycle_count: ["El campo cantidad de ciclos es obligatorio."],
      state: ["El campo estado es obligatorio."],
    })
    const free = mallaSchema({ nameAvailable: async () => true, updating: false })
    expect(await schemaErrors(free, { name: "Malla 2025", cycle_count: 9, state: "vigente" })).toEqual({})
  })

  it("a malla is only vigente or cerrada", async () => {
    const schema = mallaSchema({ nameAvailable: async () => true, updating: false })
    expect(await schemaErrors(schema, { name: "Malla 2025", cycle_count: 9, state: "en_transicion" })).toEqual({ state: ["El valor seleccionado en estado no es válido."] })
    expect(await schemaErrors(schema, { name: "Malla 2025", cycle_count: 9, state: "cerrada" })).toEqual({})
    expect(MALLA_STATE_LABELS).toEqual({ vigente: "Vigente", cerrada: "Cerrada" })
  })

  it("a malla has no resolution: the field is ignored, not validated", async () => {
    const schema = mallaSchema({ nameAvailable: async () => true, updating: true })
    expect(await schemaErrors(schema, { resolution: "R".repeat(500) })).toEqual({})
    expect(Object.keys(schema.shape)).not.toContain("resolution")
  })

  it("validate a malla edit: every field optional, no cycle count", async () => {
    const schema = mallaSchema({ nameAvailable: async () => true, updating: true })
    expect(await schemaErrors(schema, {})).toEqual({})
    expect(await schemaErrors(schema, { state: "cerrada" })).toEqual({})
    expect(await schemaErrors(schema, { name: "", state: "x" })).toEqual({ name: ["El campo nombre es obligatorio."], state: ["El valor seleccionado en estado no es válido."] })
  })

  it("require the malla that receives subjects and check it belongs to the career", async () => {
    expect(await schemaErrors(mallaTargetSchema({ mallaExists: async () => true }), {})).toEqual({ malla_id: ["El campo malla es obligatorio."] })
    expect(await schemaErrors(mallaTargetSchema({ mallaExists: async () => false }), { malla_id: UUID })).toEqual({ malla_id: ["El valor seleccionado en malla no es válido."] })
    expect(await schemaErrors(mallaTargetSchema({ mallaExists: async () => true }), { malla_id: UUID })).toEqual({})
  })
})
