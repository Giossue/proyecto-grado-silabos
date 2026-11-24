// @vitest-environment node
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { destroyManagedUser, removeManagedUserRole, resendManagedUserActivation, storeManagedUser, updateManagedUser } from "./accountWrites"
import { account, ACTOR, ACTOR_ROLE, CAREER, FORBIDDEN, grant, harness, jsonRequest, NOW, OTHER_CAREER, SESSION_ID } from "./testing"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Models\\${model}] ${id}` }, null, 4)

const TEACHER = "01a1c5bc-1111-7000-8000-000000000001"
const TEACHER_ROLE = "01a1c5bc-1111-7000-8000-0000000000a1"
const COORDINATOR = "01a1c5bc-1111-7000-8000-000000000002"
const COORDINATOR_ROLE = "01a1c5bc-1111-7000-8000-0000000000a2"
const PENDING = "01a1c5bc-1111-7000-8000-000000000003"
const TOKEN_HASH = createHash("sha256").update("a".repeat(64)).digest("hex")

function seeded() {
  const test = harness()
  const { identity } = test
  identity.accounts.push(
    account({ id: TEACHER, name: "DOCENTE DEMO", email: "docente@silabos.test" }),
    account({ id: COORDINATOR, name: "COORDINADOR DEMO", email: "coordinador@silabos.test" }),
    account({ id: PENDING, name: "PENDIENTE DEMO", email: "pendiente@silabos.test", verified: false }),
  )
  identity.grants.push(
    grant({ id: TEACHER_ROLE, userId: TEACHER, role: "docente", careerId: CAREER }),
    grant({ id: COORDINATOR_ROLE, userId: COORDINATOR, role: "coordinador", careerId: CAREER }),
    grant({ id: "01a1c5bc-1111-7000-8000-0000000000a3", userId: PENDING, role: "docente", careerId: CAREER }),
  )
  identity.sessions.push({ id: "teacher-session", userId: TEACHER }, { id: "coordinator-session", userId: COORDINATOR })
  return test
}

const actions = (test: ReturnType<typeof harness>) => test.identity.audits.map((event) => event.action)
const identityOf = (id: string, test: ReturnType<typeof harness>) => {
  const row = test.identity.accounts.find((candidate) => candidate.id === id)
  return { nombre: row?.name, correo_electronico: row?.email }
}

describe("POST /api/v1/admin/users", () => {
  const create = (test: ReturnType<typeof harness>, body: unknown) => storeManagedUser(jsonRequest("/api/v1/admin/users", "POST", body), test.deps)

  it("creates the account with its scoped role, audits it and queues the activation mail after commit", async () => {
    const test = seeded()
    const response = await create(test, {
      nombres: "Nueva  Luz",
      apellidos: "Docente Prueba",
      correo_electronico: "Nueva.Docente@silabos.test",
      role_code: "docente",
      career_id: CAREER,
    })
    const created = test.identity.accounts.at(-1)
    expect(response.status).toBe(201)
    expect(await response.text()).toBe(
      `{"message":"Cuenta creada con su rol inicial.","user":{"id":"${created?.id}","nombre":"NUEVA LUZ DOCENTE PRUEBA","correo_electronico":"nueva.docente@silabos.test"}}`,
    )
    expect(created).toMatchObject({ name: "NUEVA LUZ DOCENTE PRUEBA", email: "nueva.docente@silabos.test", active: true, verified: false, passwordHash: "hashed:64" })
    expect(test.identity.grants.at(-1)).toMatchObject({ userId: created?.id, role: "docente", careerId: CAREER, active: true })
    expect(actions(test)).toEqual(["usuario.rol_asignado", "usuario.creado", "usuario.invitacion_activacion_enviada"])
    expect(test.identity.audits[1]).toMatchObject({ actorId: ACTOR, roleAssignmentId: ACTOR_ROLE, resourceId: created?.id, metadata: { initial_role: "docente" } })
    expect(test.identity.invitations).toEqual([
      { userId: created?.id, hash: TOKEN_HASH, expiresAt: NOW + 7 * 86400, issuerId: ACTOR, createdAt: NOW, usedAt: null, invalidatedAt: null },
    ])
    expect(test.identity.mails).toEqual([
      {
        mailable: "activation",
        to: "nueva.docente@silabos.test",
        data: { name: "NUEVA LUZ DOCENTE PRUEBA", roleName: "Docente", activationUrl: `http://localhost:3000/activar-cuenta?token=${"a".repeat(64)}`, careerName: "Software" },
      },
    ])
  })

  it("requires an active career for a scoped role and writes nothing", async () => {
    const test = seeded()
    const response = await create(test, { nombres: "Docente Luz", apellidos: "Carrera Prueba", correo_electronico: "sin.carrera@silabos.test", role_code: "docente" })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ message: "Seleccione la carrera que limita este rol.", errors: { career_id: ["Seleccione la carrera que limita este rol."] } })
    expect(test.identity.accounts).toHaveLength(4)
  })

  it("reports the name columns, the repeated email and the forbidden fields like Laravel", async () => {
    const test = seeded()
    const response = await create(test, { nombres: "Ana2", apellidos: "", correo_electronico: "docente@silabos.test", role_code: "rector", nombre: "X", faculty_id: "f" })
    expect(await response.json()).toEqual({
      message: "Los nombres solo admiten letras, espacios, apóstrofo y guion. (y 6 errores más)",
      errors: {
        nombres: ["Los nombres solo admiten letras, espacios, apóstrofo y guion."],
        apellidos: ["Los apellidos son obligatorios."],
        nombre: ["El campo nombre está prohibido."],
        correo_electronico: ["Ya existe una cuenta con este correo."],
        role_code: ["El valor seleccionado en rol no es válido."],
        career_id: ["Seleccione la carrera que limita este rol."],
        faculty_id: ["El campo facultad está prohibido."],
      },
    })
  })

  it("asks Laravel when the email needs the full RFC parser", async () => {
    const test = seeded()
    const response = await create(test, { nombres: "Ana", apellidos: "Paz", correo_electronico: '"ana paz"@silabos.test', role_code: "bibliotecario" })
    expect(response.status).toBe(299)
    expect(test.forwarded).toHaveLength(1)
    expect(await test.forwarded[0].json()).toMatchObject({ nombres: "Ana" })
  })

  it("is forbidden without the administrator role", async () => {
    const test = harness({ role: "coordinador", careerId: CAREER })
    const response = await create(test, { nombres: "Ana", apellidos: "Paz", correo_electronico: "ana@silabos.test", role_code: "docente", career_id: CAREER })
    expect(response.status).toBe(403)
    expect(await response.text()).toBe(FORBIDDEN)
  })
})

describe("PATCH /api/v1/admin/users/{user}", () => {
  const update = (test: ReturnType<typeof harness>, id: string, body: unknown) => updateManagedUser(jsonRequest(`/api/v1/admin/users/${id}`, "PATCH", body), id, test.deps)

  it("edits the identity and deactivates the account in one save", async () => {
    const test = seeded()
    test.identity.parallels.push({ id: "p-1", grantId: TEACHER_ROLE, active: true })
    const response = await update(test, TEACHER, { nombre: "Ana María Pérez Gómez", correo_electronico: "docente@silabos.test", active: false })
    expect(await response.text()).toBe('{"message":"Cuenta actualizada."}')
    expect(test.identity.accounts.find((row) => row.id === TEACHER)).toMatchObject({ name: "ANA MARÍA PÉREZ GÓMEZ", active: false, rememberToken: "a".repeat(60) })
    expect(test.identity.sessions.map((row) => row.userId)).not.toContain(TEACHER)
    expect(test.identity.parallels[0].active).toBe(false)
    expect(actions(test)).toEqual(["usuario.perfil_actualizado", "usuario.desactivado"])
    expect(test.identity.audits[0].metadata).toEqual({ previous_name: "DOCENTE DEMO", previous_email: "docente@silabos.test", name_changed: true, email_changed: false })
    expect(test.identity.audits[1].metadata).toEqual({ closed_teacher_assignments: 1, closed_coordinations: "" })
  })

  it("keeps the email of an activated account", async () => {
    const test = seeded()
    const response = await update(test, TEACHER, { nombre: "Ana María Pérez Gómez", correo_electronico: "otra.persona@silabos.test", active: true })
    expect(response.status).toBe(422)
    expect(Object.keys((await response.json()).errors)).toEqual(["correo_electronico"])
    expect(test.identity.accounts.find((row) => row.id === TEACHER)?.name).toBe("DOCENTE DEMO")
  })

  it("adds a role in the same save and keeps the previous one", async () => {
    const test = seeded()
    await update(test, COORDINATOR, { ...identityOf(COORDINATOR, test), active: true, role_code: "docente", career_id: CAREER })
    expect(test.identity.grants.filter((row) => row.userId === COORDINATOR && row.active).map((row) => row.role)).toEqual(["coordinador", "docente"])
    expect(actions(test)).toEqual(["usuario.rol_asignado"])
  })

  it("registers nothing extra when only the identity changes", async () => {
    const test = seeded()
    await update(test, TEACHER, { nombre: "Luisa Fernanda Mora Díaz", correo_electronico: "docente@silabos.test", active: true })
    expect(actions(test)).toEqual(["usuario.perfil_actualizado"])
  })

  it("lets the own account only correct its identity", async () => {
    const test = seeded()
    expect((await update(test, ACTOR, { nombre: "Carlos Andrés Ruiz Vega", correo_electronico: "admin@silabos.test" })).status).toBe(200)
    expect(await (await update(test, ACTOR, { nombre: "Carlos Andrés Ruiz Vega", correo_electronico: "admin@silabos.test", active: false })).text()).toBe(FORBIDDEN)
    expect((await update(test, ACTOR, { nombre: "Carlos Andrés Ruiz Vega", correo_electronico: "admin@silabos.test", role_code: "administrador" })).status).toBe(403)
  })

  it("is forbidden for a coordinator", async () => {
    const test = harness({ role: "coordinador", careerId: CAREER })
    test.identity.accounts.push(account({ id: TEACHER }))
    expect((await update(test, TEACHER, { nombre: "Intento", correo_electronico: "intento@silabos.test" })).status).toBe(403)
  })

  it("requires the career of a scoped role with the default required_unless message", async () => {
    const test = seeded()
    const response = await update(test, TEACHER, { ...identityOf(TEACHER, test), active: true, role_code: "docente" })
    expect((await response.json()).errors).toEqual({ career_id: ["El campo carrera es obligatorio a menos que rol esté en administrador, bibliotecario."] })
  })

  it("asks to confirm a coordinator replacement and then replaces it", async () => {
    const test = seeded()
    const asked = await update(test, TEACHER, { ...identityOf(TEACHER, test), role_code: "coordinador", career_id: CAREER })
    expect((await asked.json()).errors).toEqual({ replace_coordinator: ["La carrera ya tiene como coordinador a COORDINADOR DEMO."] })
    expect(test.identity.audits).toEqual([])
    await update(test, TEACHER, { ...identityOf(TEACHER, test), role_code: "coordinador", career_id: CAREER, replace_coordinator: true })
    expect(test.identity.grants.find((row) => row.id === COORDINATOR_ROLE)?.active).toBe(false)
    expect(actions(test)).toEqual(["academico.coordinacion.reemplazada", "usuario.rol_asignado"])
    expect(test.identity.audits[0]).toMatchObject({
      resourceType: "carrera",
      resourceId: CAREER,
      metadata: { previous_user_id: COORDINATOR, incoming_user_id: TEACHER, returned_to_review: 0 },
    })
  })

  it("leaves a replacement that returns reviewed syllabi to Laravel without writing", async () => {
    const test = seeded()
    test.identity.careers[0].reviewed = true
    const response = await update(test, TEACHER, { ...identityOf(TEACHER, test), role_code: "coordinador", career_id: CAREER, replace_coordinator: true })
    expect(response.status).toBe(299)
    expect(test.identity.grants.find((row) => row.id === COORDINATOR_ROLE)?.active).toBe(true)
    expect(test.identity.audits).toEqual([])
    expect(await test.forwarded[0].json()).toMatchObject({ replace_coordinator: true })
  })

  it("rejects incompatible roles", async () => {
    const test = seeded()
    const exclusive = await update(test, ACTOR, { ...identityOf(ACTOR, test) })
    expect(exclusive.status).toBe(200)
    const librarian = await update(test, TEACHER, { ...identityOf(TEACHER, test), role_code: "bibliotecario" })
    expect((await librarian.json()).errors).toEqual({ role_code: ["Administración y Biblioteca no pueden tener los roles Docente ni Coordinador."] })
    const administrator = await update(test, TEACHER, { ...identityOf(TEACHER, test), role_code: "administrador" })
    expect((await administrator.json()).errors).toEqual({
      role_code: ["El rol Administrador es exclusivo y no puede agregarse mientras la cuenta conserve otro rol activo."],
    })
  })

  it("does not deactivate the last administrator nor a teacher with syllabi in progress", async () => {
    const test = seeded()
    test.identity.accounts.push(account({ id: "01a1c5bc-1111-7000-8000-000000000009", name: "OTRA ADMIN" }))
    test.identity.grants.push(grant({ id: "01a1c5bc-1111-7000-8000-0000000000a9", userId: "01a1c5bc-1111-7000-8000-000000000009", role: "administrador", careerId: null }))
    test.identity.grants.find((row) => row.id === ACTOR_ROLE)!.active = false
    const last = await update(test, "01a1c5bc-1111-7000-8000-000000000009", { nombre: "Otra Admin", correo_electronico: "01a1c5bc@silabos.test", active: false })
    test.identity.grants.find((row) => row.id === ACTOR_ROLE)!.active = true
    expect((await last.json()).errors).toEqual({ active: ["Es la única cuenta de administración activa. Nombre otra antes de desactivarla."] })
    test.identity.inProgress[TEACHER] = [
      { careerLabel: "Software", total: 2 },
      { careerLabel: "Derecho", total: 1 },
    ]
    const busy = await update(test, TEACHER, { ...identityOf(TEACHER, test), active: false })
    expect((await busy.json()).errors).toEqual({
      active: ["Tiene sílabos en curso (2 en Software, 1 en Derecho). Coordinación debe asignar otro docente a sus paralelos antes de desactivar la cuenta."],
    })
    expect(test.identity.accounts.find((row) => row.id === TEACHER)?.active).toBe(true)
  })

  it("closes the coordinations of a deactivated account", async () => {
    const test = seeded()
    await update(test, COORDINATOR, { ...identityOf(COORDINATOR, test), active: false })
    expect(test.identity.grants.find((row) => row.id === COORDINATOR_ROLE)?.active).toBe(false)
    expect(test.identity.audits[0].metadata).toEqual({ closed_teacher_assignments: 0, closed_coordinations: "Software" })
  })

  it("sends the access again to the corrected email of a pending account", async () => {
    const test = seeded()
    test.identity.invitations.push({ userId: PENDING, hash: "old", expiresAt: NOW + 100, issuerId: ACTOR, createdAt: NOW - 100, usedAt: null, invalidatedAt: null })
    await update(test, PENDING, { nombre: "Pendiente Demo", correo_electronico: "Corregido@Silabos.test" })
    expect(test.identity.invitations[0].invalidatedAt).toBe(NOW)
    expect(test.identity.invitations[1]).toMatchObject({ userId: PENDING, hash: TOKEN_HASH })
    expect(actions(test)).toEqual(["usuario.perfil_actualizado", "usuario.invitacion_activacion_enviada"])
    expect(test.identity.audits[1].metadata).toEqual({ reason: "correo_corregido" })
    expect(test.identity.mails.map((mail) => mail.to)).toEqual(["corregido@silabos.test"])
  })

  it("leaves unknown or malformed ids to Laravel", async () => {
    const test = seeded()
    for (const id of ["no-uuid", "01a1c5bc-1111-7000-8000-00000000ffff"]) {
      const response = await update(test, id, {})
      expect({ status: response.status, text: await response.text() }).toEqual({ status: 404, text: modelNotFound("User", id) })
    }
    expect(test.forwarded).toHaveLength(0)
  })
})

describe("POST /api/v1/admin/users/{user}/resend-activation", () => {
  const resend = (test: ReturnType<typeof harness>, id: string) => resendManagedUserActivation(jsonRequest(`/api/v1/admin/users/${id}/resend-activation`, "POST", undefined), id, test.deps)

  it("sends a new invitation once the previous one expired", async () => {
    const test = seeded()
    test.identity.invitations.push({ userId: PENDING, hash: "old", expiresAt: NOW - 1, issuerId: ACTOR, createdAt: NOW - 100, usedAt: null, invalidatedAt: null })
    const response = await resend(test, PENDING)
    expect(await response.text()).toBe('{"message":"Invitaci\\u00f3n de activaci\\u00f3n enviada a pendiente@silabos.test."}')
    expect(response.headers.get("x-ratelimit-limit")).toBe("3")
    expect(response.headers.get("x-ratelimit-remaining")).toBe("2")
    expect(test.identity.audits[0].metadata).toEqual({ reason: "reenvio" })
    expect(test.identity.mails).toHaveLength(1)
  })

  it("keeps a valid invitation and refuses an activated account", async () => {
    const test = seeded()
    test.identity.invitations.push({ userId: PENDING, hash: "old", expiresAt: NOW + 100, issuerId: ACTOR, createdAt: NOW - 100, usedAt: null, invalidatedAt: null })
    const still = await resend(test, PENDING)
    expect(await still.json()).toEqual({
      message: "La invitación sigue vigente; podrá reenviarla cuando venza.",
      errors: { user: ["La invitación sigue vigente; podrá reenviarla cuando venza."] },
    })
    expect((await resend(test, TEACHER)).status).toBe(403)
    expect(test.identity.mails).toEqual([])
  })

  it("limits the attempts like throttle:password-recovery", async () => {
    const test = seeded()
    for (let attempt = 0; attempt < 3; attempt += 1) await resend(test, TEACHER)
    const limited = await resend(test, TEACHER)
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
  })
})

describe("DELETE /api/v1/admin/users/{user}", () => {
  const destroy = (test: ReturnType<typeof harness>, id: string) => destroyManagedUser(jsonRequest(`/api/v1/admin/users/${id}`, "DELETE", undefined), id, test.deps)

  it("deletes a pending account without activity and archives a used one", async () => {
    const test = seeded()
    test.identity.notifications.push({ userId: PENDING })
    expect(await (await destroy(test, PENDING)).text()).toBe('{"message":"Cuenta eliminada."}')
    expect(test.identity.accounts.some((row) => row.id === PENDING)).toBe(false)
    expect(test.identity.notifications).toEqual([])
    expect(test.identity.audits[0]).toMatchObject({ action: "usuario.eliminado", resourceId: PENDING, metadata: { email: "pendiente@silabos.test", name: "PENDIENTE DEMO" } })
    const other = seeded()
    other.identity.activity.push(PENDING)
    expect((await (await destroy(other, PENDING)).json()).errors).toEqual({ user: ["La cuenta ya tiene actividad registrada. Desactívela en lugar de eliminarla."] })
    expect((await destroy(other, TEACHER)).status).toBe(403)
  })
})

describe("DELETE /api/v1/admin/users/{user}/roles/{assignment}", () => {
  const remove = (test: ReturnType<typeof harness>, id: string, assignment: string) =>
    removeManagedUserRole(jsonRequest(`/api/v1/admin/users/${id}/roles/${assignment}`, "DELETE", undefined), id, assignment, test.deps)

  it("removes one role, its parallels and the sessions, keeping the history", async () => {
    const test = seeded()
    test.identity.grants.push(grant({ id: "01a1c5bc-1111-7000-8000-0000000000b1", userId: COORDINATOR, role: "docente", careerId: OTHER_CAREER }))
    test.identity.parallels.push({ id: "p-9", grantId: "01a1c5bc-1111-7000-8000-0000000000b1", active: true })
    const response = await remove(test, COORDINATOR, "01a1c5bc-1111-7000-8000-0000000000b1")
    expect(await response.text()).toBe('{"message":"Rol retirado."}')
    expect(test.identity.grants.find((row) => row.id === "01a1c5bc-1111-7000-8000-0000000000b1")?.active).toBe(false)
    expect(test.identity.parallels).toEqual([])
    expect(test.identity.sessions.some((row) => row.userId === COORDINATOR)).toBe(false)
    expect(test.identity.audits[0].metadata).toEqual({ role: "docente", career_id: OTHER_CAREER, removed_parallel_assignments: 1 })
  })

  it("refuses the only role, a role of another account and a non administrator", async () => {
    const test = seeded()
    expect((await (await remove(test, COORDINATOR, COORDINATOR_ROLE)).json()).errors).toEqual({
      role: ["Es el único rol de la cuenta. Deshabilite el acceso en lugar de quitarlo."],
    })
    const notFound = await remove(test, TEACHER, COORDINATOR_ROLE)
    expect(notFound.status).toBe(404)
    expect(await notFound.text()).toBe('{\n    "message": ""\n}')
    const coordinator = harness({ role: "coordinador", careerId: CAREER })
    coordinator.identity.accounts.push(account({ id: COORDINATOR }))
    coordinator.identity.grants.push(grant({ id: COORDINATOR_ROLE, userId: COORDINATOR, role: "coordinador" }))
    expect((await remove(coordinator, COORDINATOR, COORDINATOR_ROLE)).status).toBe(403)
  })
})

describe("the session of the caller", () => {
  it("is never rewritten: only its last activity moves", async () => {
    const test = seeded()
    const before = test.bridge.sessions.get(SESSION_ID)?.payload
    await updateManagedUser(jsonRequest(`/api/v1/admin/users/${TEACHER}`, "PATCH", { ...identityOf(TEACHER, test), active: false }), TEACHER, test.deps)
    expect(test.bridge.sessions.get(SESSION_ID)?.payload).toBe(before)
    expect(test.identity.sessions.some((row) => row.id === SESSION_ID)).toBe(true)
  })
})
