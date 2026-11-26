// @vitest-environment node
import { describe, expect, it } from "vitest"
import { resendOwnActivation, updateProfile } from "./selfService"
import { account, ACTOR, ACTOR_ROLE, CAREER, FORBIDDEN, harness, jsonRequest, NOW } from "./testing"

const ISSUER = "01a1c5bc-3333-7000-8000-000000000001"

function payload(name: string, extra: Record<string, unknown> = {}) {
  return {
    user: { id: ACTOR, name, email: "admin@silabos.test", email_verified: true, can_edit_identity: true, ...extra },
    active_role: { id: ACTOR_ROLE, code: "administrador", career_id: null, career_name: null },
    available_roles: [{ id: ACTOR_ROLE, code: "administrador", career_id: null, career_name: null }],
    institution: { today: "2027-01-15", timezone: "America/Guayaquil" },
  }
}

describe("PUT /api/v1/authentication/profile", () => {
  const put = (test: ReturnType<typeof harness>, body: unknown) => updateProfile(jsonRequest("/api/v1/authentication/profile", "PUT", body), test.deps)

  it("corrects the own name and answers the session payload", async () => {
    const test = harness()
    const response = await put(test, { nombre: "carlos  ruiz", correo_electronico: "admin@silabos.test" })
    expect(await response.json()).toEqual(payload("CARLOS RUIZ"))
    expect(test.identity.accounts.find((row) => row.id === ACTOR)?.name).toBe("CARLOS RUIZ")
  })

  it("keeps the email of the activated account and validates like ProfileUpdateRequest", async () => {
    const test = harness()
    test.identity.accounts.push(account({ id: ISSUER, email: "otra@silabos.test" }))
    expect((await (await put(test, { nombre: "Carlos Ruiz", correo_electronico: "nueva@silabos.test" })).json()).errors).toEqual({
      correo_electronico: ["La cuenta ya fue activada y su correo no se puede cambiar. Si otra persona asume sus funciones, cree su cuenta y asígnele el rol."],
    })
    expect((await (await put(test, { correo_electronico: "otra@silabos.test" })).json()).errors).toEqual({
      nombre: ["El campo nombre es obligatorio."],
      correo_electronico: ["El valor del campo correo electrónico ya está en uso."],
    })
    expect((await (await put(test, { nombre: "Carlos", correo_electronico: "sin-arroba" })).json()).errors).toEqual({
      correo_electronico: ["El campo correo electrónico debe ser un correo electrónico válido."],
    })
    expect(test.identity.accounts.find((row) => row.id === ACTOR)?.email).toBe("admin@silabos.test")
  })

  it("is only for the administrator role", async () => {
    const test = harness({ role: "docente", careerId: CAREER })
    expect(await (await put(test, { nombre: "Ana Paz", correo_electronico: "admin@silabos.test" })).text()).toBe(FORBIDDEN)
  })
})

describe("POST /api/v1/authentication/account-activation/resend", () => {
  const post = (test: ReturnType<typeof harness>) => resendOwnActivation(jsonRequest("/api/v1/authentication/account-activation/resend", "POST", undefined), test.deps)

  it("answers the same for an activated account and sends nothing", async () => {
    const test = harness()
    const response = await post(test)
    expect(response.status).toBe(202)
    expect(await response.text()).toBe('{"message":"Si su cuenta aún no estaba activada, se envió un enlace de activación."}')
    expect(test.identity.invitations).toEqual([])
  })

  it("issues the link on behalf of whoever sent the last invitation", async () => {
    const test = harness()
    test.bridge.users[0].emailVerifiedAt = null
    test.identity.accounts[0].verified = false
    test.identity.accounts.push(account({ id: ISSUER }))
    test.identity.invitations.push({ userId: ACTOR, hash: "h", expiresAt: NOW + 9, issuerId: ISSUER, createdAt: NOW - 9, usedAt: null, invalidatedAt: null })
    expect((await post(test)).status).toBe(202)
    expect(test.identity.invitations[1]).toMatchObject({ issuerId: ISSUER })
    expect(test.identity.mails.map((mail) => mail.to)).toEqual(["admin@silabos.test"])
  })
})
