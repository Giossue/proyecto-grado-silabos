// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readBook, xlsx } from "../excel/testing"
import { importTeachers, importUsers, teacherImportTemplate, userImportTemplate, type IdentityImportDeps } from "./imports"
import { account, ACTOR, CAREER, COOKIE, FORBIDDEN, grant, harness, NOW, OTHER_CAREER, type Harness } from "./testing"

const USERS = ["Nombres", "Apellidos", "Correo", "Rol", "Carrera"]
const TEACHERS = ["Nombres", "Apellidos", "Correo"]

function importDeps(test: Harness): IdentityImportDeps {
  return {
    ...test.deps,
    now: () => NOW,
    store: {
      activeCareers: async () =>
        test.identity.careers.filter((career) => career.active).map((career) => ({ id: career.id, name: career.label, code: career.label.slice(0, 3).toUpperCase(), label: career.label })),
      templateCareerLabels: async () => test.identity.careers.filter((career) => career.active).map((career) => career.label).sort(),
    },
  }
}

function upload(path: string, file: Buffer | null, fields: Record<string, string> = {}): Request {
  const form = new FormData()
  if (file !== null) form.append("file", new File([new Uint8Array(file)], "datos.xlsx"))
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { accept: "application/json", referer: "http://localhost:3000/usuarios", "sec-fetch-site": "same-origin", cookie: COOKIE },
    body: form,
  })
}

const download = (path: string) => new Request(`http://localhost:3000${path}`, { headers: { accept: "application/json", referer: "http://localhost:3000/usuarios", cookie: COOKIE } })
const users = (test: Harness, file: Buffer | null, fields: Record<string, string> = {}) => importUsers(upload("/api/v1/admin/users/import", file, fields), importDeps(test))
const teachers = (test: Harness, file: Buffer | null, fields: Record<string, string> = {}) =>
  importTeachers(upload("/api/v1/coordination/academic/teachers/import", file, fields), importDeps(test))
const json = async (response: Response) => JSON.parse(await response.text())
const errorsOf = (body: { rows: { errors: string[] }[] }) => body.rows.map((row) => row.errors)
const emails = (test: Harness) => test.identity.accounts.map((row) => row.email)

function coordination(): Harness {
  const test = harness({ role: "coordinador", careerId: CAREER })
  test.identity.accounts[0] = account({ id: ACTOR, name: "COORDINADOR DEMO", email: "coordinador@silabos.test" })
  return test
}

describe("POST /api/v1/admin/users/import", () => {
  it("previews, then imports the users in one transaction with their invitations after commit", async () => {
    const test = harness()
    const file = await xlsx([USERS, ["Ana Luz", "Uno Cinco", "Ana.Uno@silabos.test", "Docente", "software"], ["Luis Pedro", "Dos Tres", "luis.dos@silabos.test", "bibliotecario", ""]])
    const preview = await users(test, file)
    expect(await preview.text()).toBe(
      '{"rows":[{"line":2,"values":{"nombre":"ANA LUZ UNO CINCO","correo":"Ana.Uno@silabos.test","rol":"Docente","carrera":"software"},"errors":[]},' +
        '{"line":3,"values":{"nombre":"LUIS PEDRO DOS TRES","correo":"luis.dos@silabos.test","rol":"bibliotecario","carrera":""},"errors":[]}],"valid":true,"created":0}',
    )
    expect(emails(test)).not.toContain("ana.uno@silabos.test")
    const created = await json(await users(test, file, { confirm: "1" }))
    expect(created).toMatchObject({ valid: true, created: 2 })
    expect(emails(test)).toEqual(expect.arrayContaining(["ana.uno@silabos.test", "luis.dos@silabos.test"]))
    const ana = test.identity.accounts.find((row) => row.email === "ana.uno@silabos.test")!
    expect(test.identity.grants.find((row) => row.userId === ana.id)).toMatchObject({ role: "docente", careerId: CAREER })
    expect(test.identity.mails.map((mail) => mail.to)).toEqual(["ana.uno@silabos.test", "luis.dos@silabos.test"])
  })

  it("reports row errors and creates nothing", async () => {
    const test = harness()
    const file = await xlsx([
      USERS,
      ["Ana", "Uno", "ana.uno@silabos.test", "Docente", "Carrera inexistente"],
      ["Luis Pedro", "Dos Tres", "luis.dos@silabos.test", "Bibliotecario", ""],
      ["Eva Pedro", "", "eva.dos@silabos.test", "Bibliotecario", ""],
      ["Rita", "Cuatro", "admin@silabos.test", "Rector", ""],
      ["Pía", "Siete", "ANA.UNO@silabos.test", "Coordinador", ""],
    ])
    const body = await json(await users(test, file, { confirm: "1" }))
    expect(body).toMatchObject({ valid: false, created: 0 })
    expect(errorsOf(body)).toEqual([
      ["El campo carrera debe ser un UUID válido."],
      [],
      ["Los apellidos son obligatorios."],
      ["Ya existe una cuenta con este correo.", "El valor seleccionado en rol no es válido.", "Seleccione la carrera que limita este rol."],
      ["Seleccione la carrera que limita este rol.", "El correo se repite en la fila 2."],
    ])
    expect(emails(test)).toEqual(["admin@silabos.test"])
    expect(test.identity.mails).toEqual([])
  })

  it("rejects names over the form limit", async () => {
    const test = harness()
    const file = await xlsx([USERS, ["Ana Luz", "B".repeat(91), "largo2@silabos.test", "Administrador", ""]])
    const body = await json(await users(test, file, { confirm: "1" }))
    expect(errorsOf(body)).toEqual([["Los apellidos admiten hasta 90 caracteres."]])
    expect(body.created).toBe(0)
  })

  it("rolls everything back when a row cannot be created and accepts addresses with a domain literal", async () => {
    const test = harness()
    test.identity.accounts.push(account({ id: "01a1c5bc-3333-7000-8000-000000000001", name: "COORDINADORA ACTUAL", email: "actual@silabos.test" }))
    test.identity.grants.push(grant({ id: "01a1c5bc-3333-7000-8000-0000000000a1", userId: "01a1c5bc-3333-7000-8000-000000000001", role: "coordinador", careerId: CAREER }))
    const file = await xlsx([USERS, ["Luis", "Dos", "luis.dos@silabos.test", "Bibliotecario", ""], ["Nuevo", "Coordinador", "nuevo@silabos.test", "Coordinador", "Software"]])
    const rejected = await users(test, file, { confirm: "1" })
    expect(rejected.status).toBe(422)
    expect(emails(test)).not.toContain("luis.dos@silabos.test")
    expect(test.identity.mails).toEqual([])
    const unusual = await xlsx([USERS, ["Ana", "Uno", "ana+uno@[127.0.0.1]", "Bibliotecario", ""]])
    expect((await users(test, unusual)).status).toBe(200)
  })

  it("is only for administrators, after validating the upload", async () => {
    const test = coordination()
    expect((await users(test, null)).status).toBe(422)
    const file = await xlsx([USERS, ["Ana", "Uno", "ana@silabos.test", "Bibliotecario", ""]])
    expect(await (await users(test, file)).text()).toBe(FORBIDDEN)
  })
})

describe("GET /api/v1/admin/users/import-template", () => {
  it("downloads the users template with role and career lists", async () => {
    const test = harness()
    const response = await userImportTemplate(download("/api/v1/admin/users/import-template"), importDeps(test))
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=plantilla-usuarios.xlsx")
    const book = await readBook(Buffer.from(await response.arrayBuffer()))
    const sheet = book.getWorksheet("Datos")!
    expect(["A1", "B1", "D1", "G1"].map((cell) => sheet.getCell(cell).value)).toEqual(["Nombres", "Apellidos", "Rol", "Indicaciones"])
    expect(sheet.getCell("D2").dataValidation).toMatchObject({ type: "list", formulae: ["Listas!$D$1:$D$4"] })
    expect(sheet.getCell("E2").dataValidation).toMatchObject({ type: "list", formulae: ["Listas!$E$1:$E$2"] })
    expect(String(sheet.getCell("G2").value)).toContain("Nombres")
    expect(book.getWorksheet("Listas")!.getCell("E1").value).toBe("Derecho")
    expect(await (await userImportTemplate(download("/api/v1/admin/users/import-template"), importDeps(coordination()))).text()).toBe(FORBIDDEN)
  })
})

describe("POST /api/v1/coordination/academic/teachers/import", () => {
  it("imports teachers of the coordination career and others cannot", async () => {
    const test = coordination()
    const repeated = await xlsx([TEACHERS, ["Doc Ana", "Uno Mía", "doc.uno@silabos.test"], ["Doc Ana", "Dos Mía", "doc.uno@silabos.test"]])
    expect(await json(await teachers(test, repeated, { confirm: "1" }))).toMatchObject({ valid: false, created: 0 })
    const file = await xlsx([TEACHERS, ["Doc Ana", "Uno Mía", "doc.uno@silabos.test"]])
    expect(await json(await teachers(test, file, { confirm: "1" }))).toMatchObject({ valid: true, created: 1 })
    const created = test.identity.accounts.find((row) => row.email === "doc.uno@silabos.test")!
    expect(test.identity.grants.find((row) => row.userId === created.id)).toMatchObject({ role: "docente", careerId: CAREER })
    expect(test.identity.mails.map((mail) => mail.to)).toEqual(["doc.uno@silabos.test"])
    const teacher = harness({ role: "docente", careerId: CAREER })
    expect(await (await teachers(teacher, file)).text()).toBe(FORBIDDEN)
  })

  it("requires names and surnames written with letters", async () => {
    const test = coordination()
    const file = await xlsx([
      TEACHERS,
      ["", "Uno Dos", "sin.nombres@silabos.test"],
      ["Ana", "", "sin.apellidos@silabos.test"],
      ["Ana2", "Uno", "con.numero@silabos.test"],
      ["María José", "De la Cruz-O'Neil", "compuesto@silabos.test"],
      ["Ana", "Uno", "un.nombre.un.apellido@silabos.test"],
      ["A".repeat(91), "Uno Dos", "largo@silabos.test"],
    ])
    const body = await json(await teachers(test, file, { confirm: "1" }))
    expect(body).toMatchObject({ valid: false, created: 0 })
    expect(errorsOf(body)).toEqual([
      ["Los nombres son obligatorios."],
      ["Los apellidos son obligatorios."],
      ["Los nombres solo admiten letras, espacios, apóstrofo y guion."],
      [],
      [],
      ["Los nombres admiten hasta 90 caracteres."],
    ])
    expect(emails(test)).not.toContain("compuesto@silabos.test")
  })

  it("flags accounts that cannot join instead of failing the whole file", async () => {
    const test = coordination()
    test.identity.accounts.push(
      account({ id: "01a1c5bc-4444-7000-8000-000000000001", email: "inactivo@silabos.test", active: false }),
      account({ id: "01a1c5bc-4444-7000-8000-000000000002", email: "admin@silabos.test" }),
      account({ id: "01a1c5bc-4444-7000-8000-000000000003", email: "docente@silabos.test" }),
    )
    test.identity.grants.push(
      grant({ id: "01a1c5bc-4444-7000-8000-0000000000a2", userId: "01a1c5bc-4444-7000-8000-000000000002", role: "administrador", careerId: null }),
      grant({ id: "01a1c5bc-4444-7000-8000-0000000000a3", userId: "01a1c5bc-4444-7000-8000-000000000003", role: "docente", careerId: OTHER_CAREER }),
    )
    const file = await xlsx([
      TEACHERS,
      ["Ana Luz", "Uno Dos", "inactivo@silabos.test"],
      ["Ada Luz", "Uno Dos", "Admin@Silabos.test"],
      ["Eva Luz", "Uno Dos", "nuevo.docente@silabos.test"],
      ["Otra", "Carrera", "docente@silabos.test"],
    ])
    const body = await json(await teachers(test, file, { confirm: "1" }))
    expect(errorsOf(body)).toEqual([
      ["No se puede incorporar esta cuenta. Solicite a Administración que revise su acceso."],
      ["No se puede incorporar como docente una cuenta con el rol Administrador."],
      [],
      [],
    ])
    expect(emails(test)).not.toContain("nuevo.docente@silabos.test")
  })
})

describe("GET /api/v1/coordination/academic/teachers/import-template", () => {
  it("downloads the teachers template with names for the coordination", async () => {
    const response = await teacherImportTemplate(download("/api/v1/coordination/academic/teachers/import-template"), importDeps(coordination()))
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=plantilla-docentes.xlsx")
    const sheet = (await readBook(Buffer.from(await response.arrayBuffer()))).getWorksheet("Datos")!
    expect(sheet.getCell("B1").value).toBe("Apellidos")
    expect(String(sheet.getCell("E2").value)).toContain("Todas las columnas son obligatorias")
    expect(await (await teacherImportTemplate(download("/api/v1/coordination/academic/teachers/import-template"), importDeps(harness()))).text()).toBe(FORBIDDEN)
  })
})

describe("teacher import through /api/v1/admin/careers/{career}/academic/teachers/import", () => {
  const path = (careerId: string) => `/api/v1/admin/careers/${careerId}/academic/teachers/import`

  it("imports teachers into the requested career for the administrator", async () => {
    const test = harness()
    const file = await xlsx([TEACHERS, ["Doc Ana", "Uno Mía", "doc.admin@silabos.test"]])
    expect(await json(await importTeachers(upload(path(OTHER_CAREER), file, { confirm: "1" }), importDeps(test), OTHER_CAREER))).toMatchObject({ valid: true, created: 1 })
    const created = test.identity.accounts.find((row) => row.email === "doc.admin@silabos.test")!
    expect(test.identity.grants.find((row) => row.userId === created.id)).toMatchObject({ role: "docente", careerId: OTHER_CAREER })
    expect((await teacherImportTemplate(download(`/api/v1/admin/careers/${OTHER_CAREER}/academic/teachers/import-template`), importDeps(test), OTHER_CAREER)).status).toBe(200)
  })

  it("refuses a coordinator who sends another career and creates nothing", async () => {
    const test = coordination()
    const file = await xlsx([TEACHERS, ["Doc Ana", "Uno Mía", "doc.otra@silabos.test"]])
    expect(await (await importTeachers(upload(path(OTHER_CAREER), file, { confirm: "1" }), importDeps(test), OTHER_CAREER)).text()).toBe(FORBIDDEN)
    expect(emails(test)).not.toContain("doc.otra@silabos.test")
  })
})
