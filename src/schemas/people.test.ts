// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { careerTeacherSchema, managedUserEditFormSchema, managedUserFiltersSchema, managedUserFormSchema, managedUserSchema, newManagedUserSchema } from "./people"

const CAREER = "0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

describe("name columns", () => {
  it("validate like the server: required, up to 90 characters and only letters, spaces, apostrophe and hyphen", async () => {
    const schema = careerTeacherSchema()
    const email = { correo_electronico: "ana@ueb.edu.ec" }
    expect(await schemaErrors(schema, { nombres: "MARÍA JOSÉ", apellidos: "DE LA CRUZ-O'NEIL", ...email })).toEqual({})
    expect(await schemaErrors(schema, { nombres: "  ", apellidos: "", ...email })).toEqual({ nombres: ["Los nombres son obligatorios."], apellidos: ["Los apellidos son obligatorios."] })
    expect(await schemaErrors(schema, { nombres: "ANA 2", apellidos: "PÉREZ", ...email })).toEqual({ nombres: ["Los nombres solo admiten letras, espacios, apóstrofo y guion."] })
    expect(await schemaErrors(schema, { nombres: "ANA", apellidos: "A".repeat(91), ...email })).toEqual({ apellidos: ["Los apellidos admiten hasta 90 caracteres."] })
  })

  it("collapse repeated spaces before checking, as the server does", async () => {
    expect(await schemaErrors(careerTeacherSchema(), { nombres: " ANA   MARÍA ", apellidos: "PÉREZ", correo_electronico: "ana@ueb.edu.ec" })).toEqual({})
  })
})

describe("newManagedUserSchema", () => {
  it("asks for the career of a scoped role and rejects forbidden fields", async () => {
    expect(await schemaErrors(newManagedUserSchema({ roleCode: "docente" }), { nombres: "ANA", apellidos: "PAZ", correo_electronico: "ana@ueb.edu.ec", role_code: "docente", password: "x" })).toEqual({
      password: ["El campo contraseña está prohibido."],
      career_id: ["Seleccione la carrera que limita este rol."],
    })
  })

  it("checks uniqueness and the active career only when the value is otherwise valid", async () => {
    const unique = async () => false
    const careerExists = async () => false
    expect(await schemaErrors(newManagedUserSchema({ roleCode: "docente", unique, careerExists }), { nombres: "ANA", apellidos: "PAZ", correo_electronico: "ana@ueb.edu.ec", role_code: "docente", career_id: CAREER })).toEqual({
      correo_electronico: ["Ya existe una cuenta con este correo."],
      career_id: ["El valor seleccionado en carrera no es válido."],
    })
    expect(await schemaErrors(newManagedUserSchema({ roleCode: "x", unique }), { nombres: "ANA", apellidos: "PAZ", correo_electronico: "ana", role_code: "x", career_id: "abc" })).toEqual({
      correo_electronico: ["El campo correo electrónico debe ser un correo electrónico válido."],
      role_code: ["El valor seleccionado en rol no es válido."],
      career_id: ["El campo carrera debe ser un UUID válido."],
    })
  })
})

describe("managedUserSchema", () => {
  it("keeps a stored name that the name rule would reject and asks for the career with the required_unless message", async () => {
    const schema = managedUserSchema({ roleCode: "coordinador", currentName: "ADMINISTRADOR" })
    expect(await schemaErrors(schema, { nombre: "Administrador", correo_electronico: "a@ueb.edu.ec", role_code: "coordinador" })).toEqual({
      career_id: ["El campo carrera es obligatorio a menos que rol esté en administrador, bibliotecario."],
    })
    expect(await schemaErrors(managedUserSchema({ roleCode: undefined, currentName: "ANA PAZ" }), { nombre: "Ana", correo_electronico: "a@ueb.edu.ec" })).toEqual({
      nombre: ["Escriba los nombres y los apellidos, solo con letras."],
    })
  })
})

describe("client forms built from the same fields", () => {
  it("validates the creation form like the server", async () => {
    expect(await schemaErrors(managedUserFormSchema({ teacher: false, roleCode: "docente" }), { nombres: "ANA", apellidos: "PAZ", correo_electronico: "ana@ueb.edu.ec", role_code: "docente", career_id: "" })).toEqual({
      career_id: ["Seleccione la carrera que limita este rol."],
    })
    expect(await schemaErrors(managedUserFormSchema({ teacher: true, roleCode: "" }), { nombres: "ANA", apellidos: "PAZ", correo_electronico: "ana@ueb.edu.ec", role_code: "", career_id: "" })).toEqual({})
  })

  it("skips the name rule in the edit form while the name is unchanged", async () => {
    const values = { nombres: "ADMIN", apellidos: "2", correo_electronico: "a@ueb.edu.ec", role_code: "", career_id: "" }
    expect(await schemaErrors(managedUserEditFormSchema({ checkNames: false, roleCode: "" }), values)).toEqual({})
    expect(await schemaErrors(managedUserEditFormSchema({ checkNames: true, roleCode: "" }), values)).toEqual({ apellidos: ["Los apellidos solo admiten letras, espacios, apóstrofo y guion."] })
  })
})

describe("managedUserFiltersSchema", () => {
  it("validates the list filters with Laravel's messages", async () => {
    expect(await schemaErrors(managedUserFiltersSchema, { q: "x".repeat(121), status: "otro", role: "all", page: "0" })).toEqual({
      q: ["El campo búsqueda no debe tener más de 120 caracteres."],
      status: ["El valor seleccionado en estado no es válido."],
      page: ["El campo página debe ser al menos 1."],
    })
    expect(await schemaErrors(managedUserFiltersSchema, { page: "abc" })).toEqual({ page: ["El campo página debe ser un número entero."] })
  })
})
