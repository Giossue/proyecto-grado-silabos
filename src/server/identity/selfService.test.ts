// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loginSessionKey, recallerCookieName } from "../http/sessionGuard"
import { destroyOtherSessions, destroySession, resendOwnActivation, updateAccessibility, updateFormation, updateProfile } from "./selfService"
import { account, ACTOR, ACTOR_ROLE, CAREER, COOKIE, FORBIDDEN, harness, jsonRequest, NOW, SESSION_ID } from "./testing"
import golden from "../http/__fixtures__/laravel-golden.json"
import { storedJson, testKey } from "../auth/testing"
import { decrypt } from "../http/encrypter"

const ISSUER = "01a1c5bc-3333-7000-8000-000000000001"

function payload(name: string, extra: Record<string, unknown> = {}) {
  return {
    user: { id: ACTOR, name, email: "admin@silabos.test", email_verified: true, can_edit_identity: true, formation: null, accessibility: null, ...extra },
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

describe("PUT /api/v1/authentication/accessibility", () => {
  const put = (test: ReturnType<typeof harness>, body: unknown) => updateAccessibility(jsonRequest("/api/v1/authentication/accessibility", "PUT", body), test.deps)

  it("stores the preferences and answers them in the order Laravel set them", async () => {
    const test = harness()
    const response = await put(test, { wide_spacing: "1", no_motion: false, text_size: "130", high_contrast: true })
    expect(await response.text()).toContain('"accessibility":{"high_contrast":true,"text_size":"130","no_motion":false,"wide_spacing":true}')
    expect(test.identity.accounts[0].accessibility).toEqual({ high_contrast: true, text_size: "130", no_motion: false, wide_spacing: true })
  })

  it("names the fields in Spanish", async () => {
    const test = harness()
    expect((await (await put(test, { high_contrast: "si", text_size: 115, no_motion: true })).json()).errors).toEqual({
      high_contrast: ["El campo alto contraste debe ser verdadero o falso."],
      text_size: ["El campo tamaño del texto debe ser una cadena de texto."],
      wide_spacing: ["El campo texto espaciado es obligatorio."],
    })
  })

  it("picks the only role of a session that has none and saves the preferences, like Laravel", async () => {
    const test = harness({ role: "docente", careerId: CAREER }, { active_role_assignment_id: undefined })
    const response = await put(test, { high_contrast: true, text_size: "100", no_motion: true, wide_spacing: true })
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()).active_role.code).toBe("docente")
    expect(test.identity.accounts[0].accessibility).toEqual({ high_contrast: true, text_size: "100", no_motion: true, wide_spacing: true })
  })
})

describe("PUT /api/v1/authentication/formation", () => {
  const put = (test: ReturnType<typeof harness>, body: unknown) => updateFormation(jsonRequest("/api/v1/authentication/formation", "PUT", body), test.deps)

  it("trims the text and answers the session payload", async () => {
    const test = harness({ role: "docente", careerId: CAREER })
    const response = await put(test, { formacion_experiencia: "  Magíster en Software  " })
    expect((await response.json()).user.formation).toBe("Magíster en Software")
    expect(test.identity.accounts.find((row) => row.id === ACTOR)?.formation).toBe("Magíster en Software")
    expect((await (await put(test, { formacion_experiencia: "Magíster en Software" })).json()).user.formation).toBe("Magíster en Software")
    expect((await (await put(test, { formacion_experiencia: "   " })).json()).errors).toEqual({
      formacion_experiencia: ["El campo formación y experiencia es obligatorio."],
    })
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

describe("DELETE /api/v1/authentication/sessions/{session}", () => {
  const remove = (test: ReturnType<typeof harness>, id: string) => destroySession(jsonRequest(`/api/v1/authentication/sessions/${id}`, "DELETE", undefined), id, test.deps)

  it("closes another session of the same account", async () => {
    const test = harness()
    test.identity.sessions.push({ id: "otra-sesion", userId: ACTOR })
    expect(await (await remove(test, "otra-sesion")).text()).toBe('{"message":"La sesión seleccionada fue cerrada."}')
    expect(test.identity.sessions.map((row) => row.id)).toEqual([SESSION_ID])
  })

  it("refuses to close the current session", async () => {
    const test = harness()
    const response = await remove(test, SESSION_ID)
    expect(response.status).toBe(422)
    expect(await response.text()).toBe('{"message":"La sesión actual se cierra desde la opción Cerrar sesión."}')
  })
})

describe("DELETE /api/v1/authentication/sessions/others", () => {
  const remove = (test: ReturnType<typeof harness>, body: unknown, cookie = COOKIE) =>
    destroyOtherSessions(jsonRequest("/api/v1/authentication/sessions/others", "DELETE", body, { cookie }), test.deps)

  it("checks the current password, closes the other sessions and rotates the remember token", async () => {
    const test = harness()
    expect((await (await remove(test, { current_password: "otra" })).json()).errors).toEqual({ current_password: ["La contraseña actual no es correcta."] })
    test.identity.sessions.push({ id: "uno", userId: ACTOR }, { id: "dos", userId: ACTOR })
    const response = await remove(test, { current_password: "secreto-actual" })
    expect(await response.json()).toEqual({ message: "Se cerraron 2 sesiones adicionales.", closed_sessions: 2 })
    expect(test.identity.sessions.map((row) => row.id)).toEqual([SESSION_ID])
    expect(test.identity.accounts[0].rememberToken).toBe("a".repeat(60))
  })

  it("logs a remembered device in again with a new session and a renewed remember cookie, like Laravel", async () => {
    const test = harness()
    test.identity.sessions.push({ id: "uno", userId: ACTOR })
    const response = await remove(test, { current_password: "secreto-actual" }, `${COOKIE}; ${recallerCookieName()}=valor`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"message":"Se cerró una sesión adicional.","closed_sessions":1}')
    const headers = response.headers.getSetCookie()
    expect(headers.map((header) => header.slice(0, header.indexOf("=")))).toEqual(["XSRF-TOKEN", golden.cookieName, recallerCookieName()])
    const value = (header: string) => decrypt(decodeURIComponent(header.slice(header.indexOf("=") + 1, header.indexOf(";"))), testKey, false).slice(41)
    expect(value(headers[1])).toBe("a".repeat(40))
    expect(value(headers[2])).toBe(`${ACTOR}|${"a".repeat(60)}|${golden.passwordHashForCookie}`)
    expect(headers[2].slice(headers[2].indexOf(";"))).toBe(`; expires=${new Date((NOW + 34560000) * 1000).toUTCString()}; Max-Age=34560000; path=/; httponly; samesite=lax`)
    expect(test.bridge.sessions.has(SESSION_ID)).toBe(false)
    expect(JSON.parse(storedJson(test.bridge, "a".repeat(40)) ?? "{}")[loginSessionKey()]).toBe(ACTOR)
    expect(test.identity.sessions.map((row) => row.id)).toEqual([SESSION_ID])
  })

  it("answers 401 to a device that only has a remember cookie Laravel would not accept", async () => {
    const test = harness()
    test.bridge.sessions.clear()
    const response = await remove(test, { current_password: "secreto-actual" }, `${COOKIE}; ${recallerCookieName()}=valor`)
    expect(response.status).toBe(401)
    expect(test.identity.sessions.map((row) => row.userId)).toEqual([ACTOR])
  })
})
