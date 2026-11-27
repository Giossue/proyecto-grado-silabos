// @vitest-environment node
import { describe, expect, it } from "vitest"
import { destroyCareerTeacher, reactivateCareerTeacher, resendCareerTeacherActivation, storeCareerTeacher } from "./careerTeachers"
import { account, ACTOR, CAREER, FORBIDDEN, grant, harness, jsonRequest, NOW, OTHER_CAREER } from "./testing"

const TEACHER = "01a1c5bc-2222-7000-8000-000000000001"
const TEACHER_ROLE = "01a1c5bc-2222-7000-8000-0000000000a1"
const FOREIGN = "01a1c5bc-2222-7000-8000-000000000002"
const PENDING = "01a1c5bc-2222-7000-8000-000000000003"
const PENDING_ROLE = "01a1c5bc-2222-7000-8000-0000000000a3"

function coordination() {
  const test = harness({ role: "coordinador", careerId: CAREER })
  test.identity.accounts[0] = account({ id: ACTOR, name: "COORDINADOR DEMO", email: "coordinador@silabos.test" })
  test.identity.accounts.push(
    account({ id: TEACHER, name: "DOCENTE DEMO", email: "docente@silabos.test" }),
    account({ id: FOREIGN, name: "DOCENTE DERECHO", email: "derecho@silabos.test" }),
    account({ id: PENDING, name: "DOCENTE PENDIENTE", email: "pendiente@silabos.test", verified: false }),
  )
  test.identity.grants.push(
    grant({ id: TEACHER_ROLE, userId: TEACHER, role: "docente", careerId: CAREER }),
    grant({ id: "01a1c5bc-2222-7000-8000-0000000000a2", userId: FOREIGN, role: "docente", careerId: OTHER_CAREER }),
    grant({ id: PENDING_ROLE, userId: PENDING, role: "docente", careerId: CAREER }),
  )
  return test
}

const store = (test: ReturnType<typeof harness>, body: unknown) => storeCareerTeacher(jsonRequest("/api/v1/coordination/academic/teachers", "POST", body), test.deps)
const remove = (test: ReturnType<typeof harness>, id: string) =>
  destroyCareerTeacher(jsonRequest(`/api/v1/coordination/academic/teachers/${id}`, "DELETE", undefined), id, test.deps)
const resend = (test: ReturnType<typeof harness>, id: string) =>
  resendCareerTeacherActivation(jsonRequest(`/api/v1/coordination/academic/teachers/${id}/resend-activation`, "POST", undefined), id, test.deps)

describe("POST /api/v1/coordination/academic/teachers", () => {
  it("creates only a teacher of the current career and is idempotent", async () => {
    const test = coordination()
    const first = await store(test, { nombres: "Nueva", apellidos: "Docente Uno", correo_electronico: "  Nueva.Docente@Silabos.test " })
    expect(await first.text()).toBe('{"message":"Docente creado para su carrera. Recibirá un enlace de activación por correo."}')
    const created = test.identity.accounts.at(-1)
    expect(created).toMatchObject({ name: "NUEVA DOCENTE UNO", email: "nueva.docente@silabos.test", verified: false })
    expect(test.identity.grants.filter((row) => row.userId === created?.id).map((row) => [row.role, row.careerId, row.active])).toEqual([["docente", CAREER, true]])
    expect(test.identity.mails.map((mail) => [mail.to, mail.data])).toEqual([
      ["nueva.docente@silabos.test", expect.objectContaining({ roleName: "Docente", careerName: "Software" })],
    ])
    const again = await store(test, { nombres: "Otro", apellidos: "Nombre", correo_electronico: "nueva.docente@silabos.test" })
    expect(await again.json()).toEqual({ message: "El docente ya está disponible en su carrera. Conserva su nombre y acceso actuales." })
    expect(test.identity.accounts.filter((row) => row.email === "nueva.docente@silabos.test")).toHaveLength(1)
    expect(test.identity.mails).toHaveLength(1)
  })

  it("incorporates a verified teacher of another career without touching its identity", async () => {
    const test = coordination()
    const response = await store(test, { nombres: "Cualquier", apellidos: "Nombre", correo_electronico: "derecho@silabos.test" })
    expect(await response.json()).toEqual({ message: "Docente incorporado a su carrera. Conserva su nombre y acceso actuales." })
    expect(test.identity.accounts.find((row) => row.id === FOREIGN)?.name).toBe("DOCENTE DERECHO")
    expect(test.identity.grants.filter((row) => row.userId === FOREIGN && row.active).map((row) => [row.role, row.careerId])).toContainEqual(["docente", CAREER])
    expect(test.identity.mails).toEqual([])
  })

  it("sends a new link to a pending teacher whose invitation expired", async () => {
    const test = coordination()
    test.identity.invitations.push({ userId: PENDING, hash: "old", expiresAt: NOW - 1, issuerId: ACTOR, createdAt: NOW - 9, usedAt: null, invalidatedAt: null })
    await store(test, { nombres: "Docente", apellidos: "Pendiente", correo_electronico: "pendiente@silabos.test" })
    expect(test.identity.invitations.map((row) => [row.userId, row.invalidatedAt])).toEqual([
      [PENDING, NOW],
      [PENDING, null],
    ])
    expect(test.identity.mails).toHaveLength(1)
  })

  it("reactivates a removed teacher and refuses administrators, librarians and disabled accounts", async () => {
    const test = coordination()
    test.identity.grants.find((row) => row.id === TEACHER_ROLE)!.active = false
    const back = await store(test, { nombres: "Docente", apellidos: "Demo", correo_electronico: "docente@silabos.test" })
    expect((await back.json()).message).toBe("Docente incorporado a su carrera. Conserva su nombre y acceso actuales.")
    expect(test.identity.grants.find((row) => row.id === TEACHER_ROLE)?.active).toBe(true)
    test.identity.accounts.push(
      account({ id: "01a1c5bc-2222-7000-8000-00000000000a", email: "admin2@silabos.test" }),
      account({ id: "01a1c5bc-2222-7000-8000-00000000000b", email: "biblio@silabos.test" }),
      account({ id: "01a1c5bc-2222-7000-8000-00000000000c", email: "inactivo@silabos.test", active: false }),
    )
    test.identity.grants.push(
      grant({ id: "01a1c5bc-2222-7000-8000-0000000000ba", userId: "01a1c5bc-2222-7000-8000-00000000000a", role: "administrador", careerId: null }),
      grant({ id: "01a1c5bc-2222-7000-8000-0000000000bb", userId: "01a1c5bc-2222-7000-8000-00000000000b", role: "bibliotecario", careerId: null }),
    )
    const errors = async (email: string) => (await (await store(test, { nombres: "Ana", apellidos: "Paz", correo_electronico: email })).json()).errors
    expect(await errors("admin2@silabos.test")).toEqual({ correo_electronico: ["No se puede incorporar como docente una cuenta con el rol Administrador."] })
    expect(await errors("biblio@silabos.test")).toEqual({ correo_electronico: ["No se puede incorporar como docente una cuenta con el rol Bibliotecario."] })
    expect(await errors("inactivo@silabos.test")).toEqual({
      correo_electronico: ["No se puede incorporar esta cuenta. Solicite a Administración que revise su acceso."],
    })
  })

  it("does not let the coordinator choose the role, the career or the account state", async () => {
    const test = coordination()
    const response = await store(test, {
      nombre: "Ana Paz",
      correo_electronico: "ana@silabos.test",
      password: "x",
      role_code: "administrador",
      career_id: OTHER_CAREER,
      user_id: TEACHER,
      active: true,
      activo: true,
    })
    expect(await response.json()).toEqual({
      message: "Los nombres son obligatorios. (y 8 errores más)",
      errors: {
        nombres: ["Los nombres son obligatorios."],
        apellidos: ["Los apellidos son obligatorios."],
        nombre: ["El campo nombre está prohibido."],
        password: ["El campo contraseña está prohibido."],
        role_code: ["El campo rol está prohibido."],
        career_id: ["El campo carrera está prohibido."],
        user_id: ["El campo usuario está prohibido."],
        active: ["El campo activo está prohibido."],
        activo: ["El campo activo está prohibido."],
      },
    })
    expect(test.identity.accounts).toHaveLength(4)
  })

  it("is forbidden for other roles and for an inactive career", async () => {
    const teacher = harness({ role: "docente", careerId: CAREER })
    expect(await (await store(teacher, { nombres: "Ana", apellidos: "Paz", correo_electronico: "ana@silabos.test" })).text()).toBe(FORBIDDEN)
    const test = coordination()
    test.identity.careers[0].active = false
    expect((await store(test, { nombres: "Ana", apellidos: "Paz", correo_electronico: "ana@silabos.test" })).status).toBe(403)
  })
})

describe("DELETE /api/v1/coordination/academic/teachers/{user}", () => {
  it("deactivates the teacher in the career and its parallels lose their teacher", async () => {
    const test = coordination()
    test.identity.grants.push(grant({ id: "01a1c5bc-2222-7000-8000-0000000000c1", userId: TEACHER, role: "docente", careerId: OTHER_CAREER }))
    test.identity.parallels.push({ id: "p-1", grantId: TEACHER_ROLE, active: true }, { id: "p-2", grantId: TEACHER_ROLE, active: true })
    test.identity.sessions.push({ id: "teacher-session", userId: TEACHER })
    const response = await remove(test, TEACHER)
    expect(await response.json()).toEqual({ message: "Docente desactivado en su carrera; sus 2 paralelos quedaron sin docente." })
    expect(test.identity.parallels).toEqual([])
    expect(test.identity.sessions.some((row) => row.userId === TEACHER)).toBe(true)
    expect(test.identity.grants.find((row) => row.id === TEACHER_ROLE)?.active).toBe(false)
  })

  it("cancels the pending invitation and the sessions of a teacher left without roles", async () => {
    const test = coordination()
    test.identity.invitations.push({ userId: PENDING, hash: "h", expiresAt: NOW + 50, issuerId: ACTOR, createdAt: NOW - 9, usedAt: null, invalidatedAt: null })
    test.identity.sessions.push({ id: "pending-session", userId: PENDING })
    expect(await (await remove(test, PENDING)).text()).toBe('{"message":"Docente desactivado en su carrera."}')
    expect(test.identity.invitations[0].invalidatedAt).toBe(NOW)
    expect(test.identity.sessions.some((row) => row.userId === PENDING)).toBe(false)
  })

  it("waits while the convocation of the career is open and refuses teachers of another career", async () => {
    const test = coordination()
    test.identity.careers[0].locked = true
    expect(await (await remove(test, TEACHER)).json()).toEqual({ message: "Proceso de sílabos activo", errors: { process: ["Proceso de sílabos activo"] } })
    expect(test.identity.grants.find((row) => row.id === TEACHER_ROLE)?.active).toBe(true)
    expect((await remove(test, FOREIGN)).status).toBe(403)
  })
})

describe("POST /api/v1/coordination/academic/teachers/{user}/reactivate", () => {
  const reactivate = (test: ReturnType<typeof harness>, id: string) =>
    reactivateCareerTeacher(jsonRequest(`/api/v1/coordination/academic/teachers/${id}/reactivate`, "POST", undefined), id, test.deps)
  const activeIn = (test: ReturnType<typeof harness>, id: string) => test.identity.grants.filter((row) => row.userId === id && row.active).map((row) => row.careerId)

  it("gives a deactivated teacher the career back without restoring parallels, even during the convocation", async () => {
    const test = coordination()
    test.identity.parallels.push({ id: "p-1", grantId: TEACHER_ROLE, active: true })
    await remove(test, TEACHER)
    test.identity.careers[0].locked = true
    const response = await reactivate(test, TEACHER)
    expect(await response.json()).toEqual({ message: "Docente reactivado en su carrera." })
    expect(activeIn(test, TEACHER)).toEqual([CAREER])
    expect(test.identity.grants.filter((row) => row.userId === TEACHER)).toHaveLength(1)
    expect(test.identity.parallels).toEqual([])
    expect(test.identity.mails).toEqual([])
  })

  it("sends a new activation link to a pending teacher, whose invitation was cancelled on deactivation", async () => {
    const test = coordination()
    await remove(test, PENDING)
    expect((await reactivate(test, PENDING)).status).toBe(200)
    expect(test.identity.mails.map((mail) => mail.to)).toEqual(["pendiente@silabos.test"])
  })

  it("only reaches people who taught in this career and changes nothing otherwise", async () => {
    const test = coordination()
    expect((await reactivate(test, FOREIGN)).status).toBe(403)
    expect(activeIn(test, FOREIGN)).toEqual([OTHER_CAREER])
    test.identity.grants.find((row) => row.id === TEACHER_ROLE)!.active = false
    test.identity.accounts.find((row) => row.id === TEACHER)!.active = false
    expect((await reactivate(test, TEACHER)).status).toBe(403)
    expect(activeIn(test, TEACHER)).toEqual([])
    const librarian = harness({ role: "bibliotecario", careerId: null })
    librarian.identity.accounts.push(account({ id: TEACHER, email: "docente@silabos.test" }))
    librarian.identity.grants.push(grant({ id: TEACHER_ROLE, userId: TEACHER, role: "docente", careerId: CAREER, active: false }))
    expect((await reactivate(librarian, TEACHER)).status).toBe(403)
    expect(activeIn(librarian, TEACHER)).toEqual([])
  })

  it("changes nobody if the email stops being this teacher's before the write", async () => {
    const test = coordination()
    test.identity.grants.find((row) => row.id === TEACHER_ROLE)!.active = false
    const run = test.deps.accounts.transaction.bind(test.deps.accounts)
    test.deps.accounts.transaction = (work) => {
      test.identity.accounts.find((row) => row.id === TEACHER)!.email = "nuevo.correo@silabos.test"
      test.identity.accounts.find((row) => row.id === FOREIGN)!.email = "docente@silabos.test"
      return run(work)
    }
    const grants = JSON.stringify(test.identity.grants)
    expect((await reactivate(test, TEACHER)).status).toBe(404)
    expect(JSON.stringify(test.identity.grants)).toBe(grants)
    expect(test.identity.accounts).toHaveLength(4)
    expect(test.identity.mails).toEqual([])
  })

  it("refuses a former teacher who now holds a role that cannot teach", async () => {
    const test = coordination()
    test.identity.grants.find((row) => row.id === TEACHER_ROLE)!.active = false
    test.identity.grants.push(grant({ id: "01a1c5bc-2222-7000-8000-0000000000bc", userId: TEACHER, role: "bibliotecario", careerId: null }))
    expect((await (await reactivate(test, TEACHER)).json()).errors).toEqual({ correo_electronico: ["No se puede incorporar como docente una cuenta con el rol Bibliotecario."] })
    expect(test.identity.grants.find((row) => row.id === TEACHER_ROLE)?.active).toBe(false)
  })

  it("lets the administrator reactivate in the requested career, never a coordinator who sends one", async () => {
    const path = `/api/v1/admin/careers/${CAREER}/academic/teachers/${TEACHER}/reactivate`
    const test = harness()
    test.identity.accounts.push(account({ id: TEACHER, email: "docente@silabos.test" }))
    test.identity.grants.push(grant({ id: TEACHER_ROLE, userId: TEACHER, role: "docente", careerId: CAREER, active: false }))
    expect((await reactivateCareerTeacher(jsonRequest(path, "POST", undefined), TEACHER, test.deps, CAREER)).status).toBe(200)
    expect(activeIn(test, TEACHER)).toEqual([CAREER])
    const other = coordination()
    other.identity.grants.find((row) => row.id === TEACHER_ROLE)!.active = false
    expect((await reactivateCareerTeacher(jsonRequest(path, "POST", undefined), TEACHER, other.deps, CAREER)).status).toBe(403)
    expect(activeIn(other, TEACHER)).toEqual([])
  })
})

describe("POST /api/v1/coordination/academic/teachers/{user}/resend-activation", () => {
  it("resends only once the invitation expired and only to teachers of its career", async () => {
    const test = coordination()
    test.identity.invitations.push({ userId: PENDING, hash: "h", expiresAt: NOW + 50, issuerId: ACTOR, createdAt: NOW - 9, usedAt: null, invalidatedAt: null })
    expect((await (await resend(test, PENDING)).json()).errors).toEqual({ user: ["La invitación sigue vigente; podrá reenviarla cuando venza."] })
    test.identity.invitations[0].expiresAt = NOW - 1
    const response = await resend(test, PENDING)
    expect(await response.json()).toEqual({ message: "Invitación de activación enviada a pendiente@silabos.test." })
    expect(test.identity.mails).toHaveLength(1)
    const other = coordination()
    other.identity.accounts.find((row) => row.id === FOREIGN)!.verified = false
    expect((await resend(other, FOREIGN)).status).toBe(403)
    expect((await resend(other, TEACHER)).status).toBe(403)
  })
})

describe("career teachers through /api/v1/admin/careers/{career}/academic/teachers", () => {
  const adminPath = (careerId: string, rest = "") => `/api/v1/admin/careers/${careerId}/academic/teachers${rest}`

  function administration() {
    const test = harness()
    test.identity.accounts.push(account({ id: FOREIGN, name: "DOCENTE DERECHO", email: "derecho@silabos.test" }))
    test.identity.grants.push(grant({ id: "01a1c5bc-2222-7000-8000-0000000000a2", userId: FOREIGN, role: "docente", careerId: OTHER_CAREER }))
    return test
  }

  it("lets the administrator add and remove teachers of the requested career", async () => {
    const test = administration()
    const created = await storeCareerTeacher(jsonRequest(adminPath(OTHER_CAREER), "POST", { nombres: "Nueva", apellidos: "Docente", correo_electronico: "nueva@silabos.test" }), test.deps, OTHER_CAREER)
    expect(created.status).toBe(200)
    const account = test.identity.accounts.find((row) => row.email === "nueva@silabos.test")
    expect(test.identity.grants.filter((row) => row.userId === account?.id).map((row) => [row.role, row.careerId])).toEqual([["docente", OTHER_CAREER]])
    const removed = await destroyCareerTeacher(jsonRequest(adminPath(OTHER_CAREER, `/${FOREIGN}`), "DELETE", undefined), FOREIGN, test.deps, OTHER_CAREER)
    expect(removed.status).toBe(200)
    expect(test.identity.grants.find((row) => row.userId === FOREIGN)?.active).toBe(false)
  })

  it("keeps refusing the administrator on the coordinator routes", async () => {
    const test = administration()
    expect(await (await storeCareerTeacher(jsonRequest("/api/v1/coordination/academic/teachers", "POST", { nombres: "Ana", apellidos: "Paz", correo_electronico: "ana@silabos.test" }), test.deps)).text()).toBe(FORBIDDEN)
  })

  it("refuses a coordinator who sends another career and changes nothing", async () => {
    const test = coordination()
    const created = await storeCareerTeacher(jsonRequest(adminPath(OTHER_CAREER), "POST", { nombres: "Ana", apellidos: "Paz", correo_electronico: "ana@silabos.test" }), test.deps, OTHER_CAREER)
    expect(await created.text()).toBe(FORBIDDEN)
    const removed = await destroyCareerTeacher(jsonRequest(adminPath(OTHER_CAREER, `/${FOREIGN}`), "DELETE", undefined), FOREIGN, test.deps, OTHER_CAREER)
    expect(removed.status).toBe(403)
    expect(test.identity.accounts).toHaveLength(4)
    expect(test.identity.grants.find((row) => row.userId === FOREIGN)?.active).toBe(true)
  })
})
