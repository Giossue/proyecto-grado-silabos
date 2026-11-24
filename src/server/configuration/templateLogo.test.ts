// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { decodePng } from "../files/png"
import { createStorageWriter, type StorageWriter } from "../laravel/storageWriter"
import type { TemplateStore } from "./templateStore"
import { uploadTemplateLogo } from "./templateLogo"

const TEMPLATE = "01a1c5bc-7d00-7000-8000-000000000001"
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const logo = (name: string) => readFileSync(path.join(__dirname, "..", "files", "__fixtures__", "logos", name))

let world: FakeWorld
let root: string
let storage: StorageWriter

const deps = () => ({
  bridge: fakeDeps(world),
  store: { template: async () => ({ id: TEMPLATE }) } as unknown as TemplateStore,
  storage,
  maxPostSize: 32 * 1024 * 1024,
})

function post(templateId: string, file: { name: string; content: Buffer | string } | null, headers: Record<string, string> = {}): Request {
  const form = new FormData()
  if (file !== null) form.append("logo", new File([typeof file.content === "string" ? file.content : new Uint8Array(file.content)], file.name))
  return new Request(`http://localhost:3000/api/v1/admin/template/${templateId}/logo`, {
    method: "POST",
    body: form,
    headers: { accept: "application/json", referer: "http://localhost:3000/plantilla", cookie, "x-csrf-token": golden.csrfToken, ...headers },
  })
}

beforeEach(() => {
  world = { sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]), users: [makeUser()], assignments: [makeAssignment({ role: "administrador", careerId: null })] }
  root = mkdtempSync(path.join(tmpdir(), "silabos-logo-"))
  storage = createStorageWriter(root)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("POST /api/v1/admin/template/{template}/logo", () => {
  it("stores the institution logo fitted to 1012 x 190 and answers its versioned URL", async () => {
    const response = await uploadTemplateLogo(post(TEMPLATE, { name: "logo.png", content: logo("rgba-800x400.png") }), TEMPLATE, deps())
    const stored = storage.path("private", "logos/institucion.png")
    const version = String(Math.floor(statSync(stored).mtimeMs / 1000))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(`{"message":"Logo actualizado.","logo":"http:\\/\\/localhost:3000\\/logos\\/institucion?v=${version}"}`)
    const image = decodePng(readFileSync(stored))
    expect([image.width, image.height]).toEqual([1012, 190])
    expect(statSync(stored).mode & 0o777).toBe(0o600)
  })

  it("rejects a logo that is not a transparent PNG with Laravel's messages", async () => {
    expect(await (await uploadTemplateLogo(post(TEMPLATE, { name: "logo.png", content: logo("opaque-64.png") }), TEMPLATE, deps())).text()).toBe(
      '{"message":"El logo debe ser un PNG sin fondo (con transparencia).","errors":{"logo":["El logo debe ser un PNG sin fondo (con transparencia)."]}}',
    )
    expect(await (await uploadTemplateLogo(post(TEMPLATE, null), TEMPLATE, deps())).text()).toBe('{"message":"El campo imagen del logo es obligatorio.","errors":{"logo":["El campo imagen del logo es obligatorio."]}}')
    expect(await storage.exists("private", "logos/institucion.png")).toBe(false)
  })

  it("answers 403 to other roles and forwards unknown templates to Laravel", async () => {
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect(await (await uploadTemplateLogo(post(TEMPLATE, { name: "logo.png", content: logo("rgba-800x400.png") }), TEMPLATE, deps())).text()).toBe('{"message":"No tiene permiso para hacer esto."}')
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    expect((await uploadTemplateLogo(post("01a1c5bc-7d00-7000-8000-000000000999", null), "01a1c5bc-7d00-7000-8000-000000000999", deps())).status).toBe(299)
  })

  it("answers 413 above the server limit", async () => {
    expect((await uploadTemplateLogo(post(TEMPLATE, null, { "content-length": "99999999" }), TEMPLATE, deps())).status).toBe(413)
  })
})
