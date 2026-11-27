// @vitest-environment node
import "reflect-metadata"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import draftGolden from "../../server/configuration/__fixtures__/draft-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import type { LogoStore, StoredFaculty } from "../../server/configuration/institutionalLogos"
import { facultyLogo, institutionLogo, publicSyllabusImage } from "../../server/configuration/logoRoutes"
import { fakeTemplateStore, goldenTemplate, TEMPLATE_ID, type FakeTemplateWorld } from "../../server/configuration/testing"
import { designTemplateTable, templateIndex, templateShow, type TemplateLock, type TemplateLockStore } from "../../server/configuration/templateBuilder"
import { checkTemplateDraft, previewTemplateDraft, templateDraftImpact } from "../../server/configuration/templateDrafts"
import { uploadTemplateLogo } from "../../server/configuration/templateLogo"
import type { SyllabusTemplate } from "../../server/configuration/templatePresentation"
import { clearTemplate, createTemplate, formatTemplate, importTemplateJson, type ProvisionDeps, type ProvisionStore, type ProvisionTx } from "../../server/configuration/templateProvisioner"
import { exportTemplateJson, teacherPreview, templateExport, templateSchema } from "../../server/configuration/templateReads"
import type { RehearsalReads, RehearsalStore } from "../../server/configuration/templateRehearsal"
import {
  destroyField,
  destroySection,
  documentOf,
  reorderFields,
  reorderSections,
  storeField,
  storeSection,
  updateField,
  updateSection,
  type DocumentSection,
  type StructureDeps,
  type StructureStore,
} from "../../server/configuration/templateStructure"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { createStorageWriter, type StorageWriter } from "../../server/http/storageWriter"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { AssistantRepository } from "../ai/assistant.repository"
import { AI_BLOCKED_NOBODY, AI_BLOCKED_PROTECTED } from "../../server/ai/readableFields"
import type { AiReadPermissionStore } from "../../server/ai/readPermissionStore"
import { AiPermissionsRepository } from "./ai-permissions.repository"
import { FallbackModule } from "../fallback/fallback.module"
import { dispatchOracle, type OracleHandler, type OracleParams, type OracleRoute } from "../../common/testing/oracle-router"
import { LogosRepository } from "./logos.repository"
import { TemplateLocksRepository } from "./template-locks.repository"
import { TemplateProvisionRepository } from "./template-provision.repository"
import { TemplateRehearsalRepository } from "./template-rehearsal.repository"
import { TemplateStructureRepository } from "./template-structure.repository"
import { TemplateModule } from "./template.module"
import { TemplateRepository } from "./template.repository"
import { TEMPLATE_IDS, TEMPLATE_POST_LIMIT, TEMPLATE_STORAGE } from "./template.tokens"

const SESSION_ID = golden.sessionId
const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const ADMIN_ROLE = golden.roleId
const BASE = `/api/v1/admin/template/${TEMPLATE_ID}`
const MISSING = "01a1c5ba-10b4-7129-925f-c28a94890000"
const FACULTY = "0f0f0f0f-0000-4000-8000-000000000001"
const POST_LIMIT = 4096
const HEADERS = ["content-type", "content-length", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-ratelimit-reset", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy", "cross-origin-resource-policy", "last-modified", "accept-ranges"]
const draftPayload = (draftGolden as Record<string, { payload: unknown }>).official.payload
const logoFile = (name: string) => readFileSync(path.join(__dirname, "..", "..", "server", "files", "__fixtures__", "logos", name))

type State = {
  world: FakeWorld
  templates: FakeTemplateWorld
  openProcess: boolean
  lock: TemplateLock | null
  changedDuringPause: boolean
  exists: boolean
  paused: string | null
  faculties: StoredFaculty[]
  writes: string[]
  sequence: number
  permissions: Set<string>
  limiter: RateLimiter
  bridge: BridgeDeps
  storage: StorageWriter
}

type Body = { bytes: Uint8Array<ArrayBuffer>; type: string }

type Call = { method: string; path: string; body?: unknown; form?: Record<string, { name: string; content: Buffer }>; raw?: Body; cookie?: boolean; headers?: Record<string, string>; mask?: boolean }

type Answer = { status: number; body: string; headers: Record<string, string | null>; writes: string[]; sessions: string[] }

let scenario: () => Partial<State> = () => ({})
let state: State
const roots: string[] = []

function adminWorld(overrides: Partial<FakeWorld> = {}): FakeWorld {
  return {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ id: ADMIN_ROLE, role: "administrador", careerId: null })],
    ...overrides,
  }
}

function freshState(): State {
  const root = mkdtempSync(path.join(tmpdir(), "silabos-template-equivalence-"))
  roots.push(root)
  const base: State = {
    world: adminWorld(),
    templates: { template: goldenTemplate(), values: [] },
    openProcess: false,
    lock: null,
    changedDuringPause: false,
    exists: true,
    paused: null,
    faculties: [{ id: FACULTY, logo: null }],
    writes: [],
    sequence: 0,
    permissions: new Set(),
    limiter: createRateLimiter(),
    bridge: fakeDeps(adminWorld()),
    storage: createStorageWriter(root),
  }
  const merged = { ...base, ...scenario() }
  merged.bridge = fakeDeps(merged.world)
  return merged
}

const nextId = (prefix: string) => `${prefix}-0000-4000-8000-${String(++state.sequence).padStart(12, "0")}`

const ids = { newTemplateId: () => nextId("0a0a0a0a"), newBlockId: () => nextId("0b0b0b0b"), newFieldId: () => nextId("0c0c0c0c") }

function applySync(template: SyllabusTemplate, sections: DocumentSection[]): SyllabusTemplate {
  const fields = new Map(template.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields.map((field) => [block.id, field] as const))))
  return {
    ...template,
    sections: [...sections]
      .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
      .map((section) => ({
        ...section,
        blocks: [...section.blocks]
          .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
          .map((block) => {
            const field = fields.get(block.id)
            return { ...block, fields: field ? [{ ...field, key: block.key, label: block.title }] : [] }
          }),
      })),
  }
}

function addField(template: SyllabusTemplate, field: { id: string; blockId: string; responsible: string; content: unknown }): SyllabusTemplate {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => (block.id === field.blockId ? { ...block, fields: [{ id: field.id, blockId: block.id, key: block.key, label: block.title, responsible: field.responsible, content: field.content }] } : block)),
    })),
  }
}

const current = () => state.templates.template

async function withRollback<T>(work: () => Promise<T>): Promise<T> {
  const before = { template: structuredClone(state.templates.template), writes: state.writes.length }
  state.writes.push("begin")
  try {
    const result = await work()
    state.writes.push("commit")
    return result
  } catch (error) {
    state.templates.template = before.template
    state.writes.length = before.writes
    state.writes.push("rollback")
    throw error
  }
}

const templateStore = fakeTemplateStore({
  get template() {
    return state.templates.template
  },
  get values() {
    return state.templates.values
  },
})

const locks: TemplateLockStore = {
  processLock: async () => state.lock,
  changedDuringPause: async () => state.changedDuringPause,
}

const structureTx = {
  lockTemplate: async (id: string) => (state.writes.push(`lock:${id}`), current()?.id === id ? structuredClone(current()) : null),
  syncDocument: async (id: string, sections: DocumentSection[]) => {
    state.writes.push(`sync:${id}:${JSON.stringify(sections)}`)
    const template = current()
    if (template) state.templates.template = applySync(template, sections)
  },
  insertField: async (field: { id: string; templateId: string; blockId: string; responsible: string; content: unknown }) => {
    state.writes.push(`insert-field:${JSON.stringify(field)}`)
    const template = current()
    if (template) state.templates.template = addField(template, field)
  },
  updateField: async (id: string, changes: unknown) => void state.writes.push(`update-field:${id}:${JSON.stringify(changes)}`),
  retainAiPermissions: async (_id: string, keys: string[]) => void (state.permissions = new Set([...state.permissions].filter((key) => keys.includes(key)))),
}

const structure: StructureStore = {
  templateLocked: async () => state.openProcess,
  field: async (id) => {
    for (const section of current()?.sections ?? []) {
      for (const block of section.blocks) {
        for (const field of block.fields) if (field.id === id) return { id, templateId: TEMPLATE_ID, blockId: block.id, responsible: field.responsible, content: field.content, key: block.key, label: block.title }
      }
    }
    return id === "0d0d0d0d-0000-4000-8000-000000000001" ? { id, templateId: MISSING, blockId: "0d0d0d0d-0000-4000-8000-000000000002", responsible: "carrera", content: {}, key: "", label: "" } : null
  },
  liveKeyTaken: async (templateId, key) => templateId === TEMPLATE_ID && (current()?.sections ?? []).some((section) => section.blocks.some((block) => block.key === key)),
  liveFieldBlocks: async (_templateId, fieldIds) =>
    new Map((current()?.sections ?? []).flatMap((section) => section.blocks.flatMap((block) => block.fields.filter((field) => fieldIds.includes(field.id)).map((field) => [field.id, block.id] as [string, string])))),
  transaction: (work) => withRollback(() => work(structureTx)),
}

const provisionTx: ProvisionTx = {
  anyTemplate: async () => (state.writes.push("lock-all"), state.exists),
  lockTemplate: (id) => structureTx.lockTemplate(id),
  insertTemplate: async (id, definition) => void state.writes.push(`insert-template:${id}:${createHash("sha256").update(JSON.stringify(definition)).digest("hex")}`),
  hasStructure: async () => (current()?.sections.length ?? 0) > 0,
  syncDocument: (id, sections) => structureTx.syncDocument(id, sections),
  suffixRetiredSections: async (id) => void state.writes.push(`suffix:${id}`),
  insertField: (field) => structureTx.insertField(field),
  allowAiReading: async (_id, keys) => void keys.forEach((key) => state.permissions.add(key)),
  retainAiPermissions: (id, keys) => structureTx.retainAiPermissions(id, keys),
  saveDefinition: async (id, definition) => void state.writes.push(`definition:${id}:${createHash("sha256").update(JSON.stringify(definition)).digest("hex")}`),
  coordinationFields: async () =>
    new Map((current()?.sections ?? []).flatMap((section) => section.blocks.flatMap((block) => block.fields.filter((field) => field.responsible !== "institucional").map((field) => [block.key, field.id] as [string, string])))),
  moveSubjectValues: async (from, to) => void state.writes.push(`move:${from}:${to}`),
}

const provision: ProvisionStore = {
  templateLocked: async () => state.openProcess,
  transaction: (work) => withRollback(() => work(provisionTx)),
}

const permissionStore: AiReadPermissionStore = {
  allowedKeys: async () => new Set(state.permissions),
  transaction: (work) =>
    work({
      lockTemplate: (id) => structureTx.lockTemplate(id),
      allowedKeys: async () => new Set(state.permissions),
      save: async (templateId, key, allowed, actorId) => {
        state.writes.push(`ai-permission:${templateId}:${key}:${allowed}:${actorId}`)
        if (allowed) state.permissions.add(key)
        else state.permissions.delete(key)
      },
    }),
}

const rehearsal: RehearsalStore = {
  pausedProcess: async () => state.paused,
  async rehearse(work) {
    state.writes.push("rehearse")
    const reads: RehearsalReads = {
      lockTemplate: async (id) => void state.writes.push(`rehearse-lock:${id}`),
      currentTemplate: async () => current(),
      syllabi: async (processId) => (processId === state.paused ? [{ id: "5a5a5a5a-0000-4000-8000-000000000001", state: "en_borrador", subjectId: "5b5b5b5b-0000-4000-8000-000000000001", career: "Software" }] : []),
      syllabusValues: async () => [],
      fieldKeys: async (fieldIds) => new Map((current()?.sections ?? []).flatMap((section) => section.blocks.flatMap((block) => block.fields)).filter((field) => fieldIds.includes(field.id)).map((field) => [field.id, field.key])),
      store: templateStore,
    }
    return work(reads)
  },
}

const logos: LogoStore = { faculty: async (id) => state.faculties.find((faculty) => faculty.id === id) ?? null }

const storage: StorageWriter = {
  get root() {
    return state.storage.root
  },
  path: (disk, relative) => state.storage.path(disk, relative),
  put: async (disk, relative, contents) => {
    state.writes.push(`put:${disk}:${relative}:${createHash("sha256").update(contents).digest("hex")}`)
    await state.storage.put(disk, relative, contents)
  },
  get: (disk, relative) => state.storage.get(disk, relative),
  exists: (disk, relative) => state.storage.exists(disk, relative),
  size: (disk, relative) => state.storage.size(disk, relative),
  delete: (disk, relative) => state.storage.delete(disk, relative),
  deleteDirectory: (disk, relative) => state.storage.deleteDirectory(disk, relative),
}

const bridge: BridgeDeps = {
  store: { findUser: (id) => state.bridge.store.findUser(id), effectiveRoleAssignments: (id) => state.bridge.store.effectiveRoleAssignments(id) },
  sessions: {
    fromWebApp: (request) => state.bridge.sessions.fromWebApp(request),
    resolve: (request) => state.bridge.sessions.resolve(request),
    find: (token) => state.bridge.sessions.find(token),
    setActiveRole: (session, id) => state.bridge.sessions.setActiveRole(session, id),
    revokeUser: (id) => state.bridge.sessions.revokeUser(id),
  },
  config: fakeDeps({ sessions: new Map(), users: [], assignments: [] }).config,
  now: () => NOW,
}

const limiter: RateLimiter = {
  attempt: (key, max, decay, now) => state.limiter.attempt(key, max, decay, now),
  attempts: (key, now) => state.limiter.attempts(key, now),
}

const builderDeps = () => ({ bridge, store: templateStore, locks })
const structureDeps = (): StructureDeps => ({ bridge, store: templateStore, structure, newId: ids.newBlockId, newFieldId: ids.newFieldId })
const provisionDeps = (): ProvisionDeps => ({ bridge, store: templateStore, provision, ...ids })
const draftDeps = () => ({ bridge, store: templateStore, rehearsal, limiter })

const param = (params: OracleParams, name: string) => String(params[name])
const route = (pathname: string, handlers: Record<string, (request: Request, params: OracleParams) => Promise<Response> | Response>): OracleRoute => ({
  path: pathname,
  handlers: Object.fromEntries(
    Object.entries(handlers).map(([method, handler]): [string, OracleHandler] => [method, async (request, context) => handler(request, await context.params)]),
  ),
})

const LEGACY: OracleRoute[] = [
  route("api/v1/admin/template", { GET: (request) => templateIndex(request, builderDeps()), POST: (request) => createTemplate(request, provisionDeps()) }),
  route("api/v1/admin/template/[template]", { GET: (request, params) => templateShow(request, param(params, "template"), builderDeps()) }),
  route("api/v1/admin/template/[template]/teacher-preview", { GET: (request, params) => teacherPreview(request, param(params, "template"), builderDeps()) }),
  route("api/v1/admin/template/[template]/json", {
    GET: (request, params) => exportTemplateJson(request, param(params, "template"), builderDeps()),
    PUT: (request, params) => importTemplateJson(request, param(params, "template"), provisionDeps()),
  }),
  route("api/v1/admin/template/[template]/logo", {
    POST: (request, params) => uploadTemplateLogo(request, param(params, "template"), { bridge, store: templateStore, storage, maxPostSize: POST_LIMIT }),
  }),
  route("api/v1/admin/template/[template]/format", { POST: (request, params) => formatTemplate(request, param(params, "template"), provisionDeps()) }),
  route("api/v1/admin/template/[template]/blocks/design", { POST: (request, params) => designTemplateTable(request, param(params, "template"), builderDeps()) }),
  route("api/v1/admin/template/[template]/draft/check", { POST: (request, params) => checkTemplateDraft(request, param(params, "template"), draftDeps()) }),
  route("api/v1/admin/template/[template]/draft/impact", { POST: (request, params) => templateDraftImpact(request, param(params, "template"), draftDeps()) }),
  route("api/v1/admin/template/[template]/draft/preview", { POST: (request, params) => previewTemplateDraft(request, param(params, "template"), draftDeps()) }),
  route("api/v1/admin/template/[template]/structure", { DELETE: (request, params) => clearTemplate(request, param(params, "template"), provisionDeps()) }),
  route("api/v1/admin/template/[template]/structure/sections", { POST: (request, params) => storeSection(request, param(params, "template"), structureDeps()) }),
  route("api/v1/admin/template/[template]/structure/sections/order", {
    PATCH: (request, params) => reorderSections(request, param(params, "template"), structureDeps()),
    DELETE: (request, params) => destroySection(request, param(params, "template"), "order", structureDeps()),
  }),
  route("api/v1/admin/template/[template]/structure/sections/[section]", {
    PATCH: (request, params) => updateSection(request, param(params, "template"), param(params, "section"), structureDeps()),
    DELETE: (request, params) => destroySection(request, param(params, "template"), param(params, "section"), structureDeps()),
  }),
  route("api/v1/admin/template/[template]/structure/sections/[section]/fields", {
    POST: (request, params) => storeField(request, param(params, "template"), param(params, "section"), structureDeps()),
  }),
  route("api/v1/admin/template/[template]/structure/sections/[section]/fields/order", {
    PATCH: (request, params) => reorderFields(request, param(params, "template"), param(params, "section"), structureDeps()),
  }),
  route("api/v1/admin/template/[template]/structure/fields/[field]", {
    PATCH: (request, params) => updateField(request, param(params, "template"), param(params, "field"), structureDeps()),
    DELETE: (request, params) => destroyField(request, param(params, "template"), param(params, "field"), structureDeps()),
  }),
  route("plantilla.schema.json", { GET: (request) => templateSchema(request) }),
  route("logos/institucion", { GET: (request) => institutionLogo(request) }),
  route("logos/facultad/[faculty]", { GET: (request, params) => facultyLogo(request, param(params, "faculty"), { store: logos }) }),
  route("images/silabo/[file]", { GET: (request, params) => publicSyllabusImage(request, param(params, "file")) }),
]

async function encoded(call: Call): Promise<Body | undefined> {
  if (call.raw) return call.raw
  if (call.form) {
    const form = new FormData()
    for (const [name, file] of Object.entries(call.form)) form.append(name, new File([new Uint8Array(file.content)], file.name))
    const response = new Response(form)
    return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "" }
  }
  if (call.body === undefined) return undefined
  return { bytes: new TextEncoder().encode(JSON.stringify(call.body)), type: "application/json" }
}

function headersOf(call: Call, body: Body | undefined): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/administracion/plantilla",
    "x-csrf-token": golden.csrfToken,
    ...(call.cookie === false ? {} : { cookie: COOKIE }),
    ...(body === undefined ? {} : { "content-type": body.type, "content-length": String(body.bytes.length) }),
    ...call.headers,
  }
}

function normalized(call: Call, text: string): string {
  const versioned = text.replace(/\?v=\d+/g, "?v=N")
  if (!call.mask) return versioned
  const seen = new Map<string, string>()
  return versioned.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
    if (!seen.has(id)) seen.set(id, `id-${seen.size}`)
    return seen.get(id) as string
  })
}

async function answerOf(call: Call, response: Response): Promise<Omit<Answer, "writes" | "sessions">> {
  const bytes = Buffer.from(await response.arrayBuffer())
  const text = (response.headers.get("content-type") ?? "").startsWith("image/") ? `sha256:${createHash("sha256").update(bytes).digest("hex")}` : bytes.toString("utf8")
  const headers = Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)]))
  if (headers["content-length"] === null && response.status !== 204) headers["content-length"] = String(bytes.length)
  if (headers["last-modified"] !== null) headers["last-modified"] = "N"
  return { status: response.status, body: normalized(call, text), headers }
}

async function legacy(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const body = await encoded(call)
  const request = new Request(new URL(call.path, "http://localhost:3000"), { method: call.method, headers: headersOf(call, body), body: body === undefined ? undefined : body.bytes })
  return answerOf(call, await dispatchOracle(LEGACY, request))
}

let app: NestExpressApplication
let origin: string

async function nest(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const body = await encoded(call)
  const response = await fetch(`${origin}${call.path}`, {
    method: call.method,
    headers: { ...headersOf(call, body), "x-forwarded-host": "localhost:3000" },
    body: body === undefined ? undefined : body.bytes,
    redirect: "manual",
  })
  return answerOf(call, response)
}

async function both(...calls: Call[]): Promise<{ legacy: Answer[]; nest: Answer[] }> {
  const run = async (send: (call: Call) => Promise<Omit<Answer, "writes" | "sessions">>) => {
    state = freshState()
    const answers: Answer[] = []
    for (const call of calls) {
      const answer = await send(call)
      answers.push({ ...answer, writes: [...state.writes], sessions: [...state.world.sessions.values()].map((record) => record.payload) })
    }
    return answers
  }
  return { legacy: await run(legacy), nest: await run(nest) }
}

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await both(...calls)
  expect(after).toEqual(before)
  return after
}

const statuses = (answers: Answer[]) => answers.map((answer) => answer.status)

const assets = process.env.PUBLIC_ASSETS_PATH

beforeAll(async () => {
  process.env.PUBLIC_ASSETS_PATH = path.join(__dirname, "..", "..", "..", "..", "..", "assets")
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, TemplateModule, FallbackModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(bridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(limiter)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(TemplateRepository)
    .useValue(templateStore)
    .overrideProvider(TemplateLocksRepository)
    .useValue(locks)
    .overrideProvider(TemplateStructureRepository)
    .useValue({ store: structure })
    .overrideProvider(TemplateProvisionRepository)
    .useValue({ store: provision })
    .overrideProvider(AiPermissionsRepository)
    .useValue({ store: permissionStore })
    .overrideProvider(TemplateRehearsalRepository)
    .useValue(rehearsal)
    .overrideProvider(LogosRepository)
    .useValue(logos)
    .overrideProvider(AssistantRepository)
    .useValue({ store: {} })
    .overrideProvider(TEMPLATE_IDS)
    .useValue(ids)
    .overrideProvider(TEMPLATE_STORAGE)
    .useValue(storage)
    .overrideProvider(TEMPLATE_POST_LIMIT)
    .useValue(POST_LIMIT)
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.listen(0, "127.0.0.1")
  origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
})

afterAll(async () => {
  if (assets === undefined) delete process.env.PUBLIC_ASSETS_PATH
  else process.env.PUBLIC_ASSETS_PATH = assets
  await app?.close()
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  scenario = () => ({})
})

describe("template routes served by Nest answer exactly like the route handlers they replace", () => {
  it("opens the editor, the existing template, the teacher preview and the JSON export the same way", async () => {
    const answers = await expectSame(
      { method: "GET", path: "/api/v1/admin/template" },
      { method: "GET", path: BASE },
      { method: "GET", path: `/api/v1/admin/template/${TEMPLATE_ID.toUpperCase()}` },
      { method: "GET", path: `${BASE}/teacher-preview` },
      { method: "GET", path: `${BASE}/json` },
    )
    expect(statuses(answers)).toEqual([200, 200, 200, 200, 200])
  })

  it("shows the process lock and the change made during the pause the same way", async () => {
    scenario = () => ({ lock: { period: "2026-1", deliveryOn: "2026-12-01" }, changedDuringPause: true })
    await expectSame({ method: "GET", path: "/api/v1/admin/template" }, { method: "GET", path: BASE })
    scenario = () => ({ templates: { template: null, values: [] }, lock: { period: "2026-1", deliveryOn: "2026-12-01" } })
    const [answer] = await expectSame({ method: "GET", path: "/api/v1/admin/template" })
    expect(JSON.parse(answer.body)).toMatchObject({ template: null, processLock: "Proceso activo" })
  })

  it("answers a guest, another role, a session without an active role and an inactive account the same way", async () => {
    const reads = [
      { method: "GET", path: "/api/v1/admin/template" },
      { method: "GET", path: BASE },
      { method: "POST", path: `${BASE}/structure/sections`, body: { key: "nueva", title: "Nueva" } },
      { method: "PATCH", path: `${BASE}/structure/fields/${goldenTemplate().sections[0].blocks[0].fields[0].id}`, body: { label: "X" } },
    ]
    const guest = await expectSame(...reads.map((call) => ({ ...call, cookie: false })))
    expect(statuses(guest)).toEqual([401, 401, 401, 401])
    scenario = () => ({ world: adminWorld({ assignments: [makeAssignment({ id: ADMIN_ROLE, role: "docente" })] }) })
    expect(statuses(await expectSame(...reads))).toEqual([403, 403, 403, 403])
    scenario = () => ({ world: adminWorld({ assignments: [] }) })
    expect(statuses(await expectSame(...reads))).toEqual([409, 409, 409, 409])
    scenario = () => ({ world: adminWorld({ users: [makeUser({ active: false })] }) })
    await expectSame(reads[0])
    scenario = () => ({ world: adminWorld({ users: [makeUser({ emailVerifiedAt: null })] }) })
    await expectSame(...reads)
  })

  it("answers an unknown template, a malformed id and an unknown field with the same 404", async () => {
    const answers = await expectSame(
      { method: "GET", path: `/api/v1/admin/template/${MISSING}` },
      { method: "GET", path: "/api/v1/admin/template/no-es-uuid/json" },
      { method: "POST", path: `/api/v1/admin/template/${MISSING}/format` },
      { method: "PATCH", path: `${BASE}/structure/fields/${MISSING}`, body: { label: "X" } },
      { method: "DELETE", path: `${BASE}/structure/fields/no-es-uuid` },
      { method: "PATCH", path: `/api/v1/admin/template/${MISSING}/structure/fields/${goldenTemplate().sections[0].blocks[0].fields[0].id}`, body: { label: "X" } },
      { method: "PATCH", path: `${BASE}/structure/fields/0d0d0d0d-0000-4000-8000-000000000001`, body: { label: "X" } },
      { method: "DELETE", path: `${BASE}/structure/sections/${MISSING}` },
      { method: "DELETE", path: `${BASE}/structure/sections/order` },
    )
    expect(statuses(answers)).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404])
  })

  it("creates the template empty or with the official format, and refuses a second one, with the same writes", async () => {
    scenario = () => ({ exists: false })
    const created = await expectSame({ method: "POST", path: "/api/v1/admin/template", body: { official: true } })
    expect(created[0].status).toBe(201)
    scenario = () => ({ exists: false })
    await expectSame({ method: "POST", path: "/api/v1/admin/template" })
    scenario = () => ({})
    const refused = await expectSame({ method: "POST", path: "/api/v1/admin/template", body: { official: "quizas" } }, { method: "POST", path: "/api/v1/admin/template", body: {} })
    expect(statuses(refused)).toEqual([422, 422])
  })

  it("formats, clears and imports the template with the same writes", async () => {
    const payload = templateExport(new Request("http://localhost:3000/"), goldenTemplate(), goldenTemplate().definition)
    const answers = await expectSame(
      { method: "PUT", path: `${BASE}/json`, body: payload },
      { method: "POST", path: `${BASE}/format` },
      { method: "DELETE", path: `${BASE}/structure` },
      { method: "PUT", path: `${BASE}/json`, body: { version: 3, sections: [] } },
      { method: "PUT", path: `${BASE}/json`, body: { version: 2, sections: [{ key: "datos", title: "Datos", fields: [{ key: "resumen", label: "Resumen", quien_llena: "docente", content: `<p>${"x".repeat(2_000_100)}</p>` }] }] } },
    )
    expect(statuses(answers)).toEqual([200, 200, 200, 422, 422])
  })

  it("blocks every template write while a process is open with the same 422", async () => {
    scenario = () => ({ openProcess: true, exists: false })
    const field = goldenTemplate().sections[0].blocks[0].fields[0].id
    const section = goldenTemplate().sections[0].id
    const answers = await expectSame(
      { method: "POST", path: "/api/v1/admin/template" },
      { method: "PUT", path: `${BASE}/json`, body: { version: 2, sections: [] } },
      { method: "POST", path: `${BASE}/format` },
      { method: "DELETE", path: `${BASE}/structure` },
      { method: "POST", path: `${BASE}/structure/sections`, body: { key: "nueva", title: "Nueva" } },
      { method: "PATCH", path: `${BASE}/structure/sections/${section}`, body: { title: "Otra" } },
      { method: "DELETE", path: `${BASE}/structure/sections/${section}` },
      { method: "PATCH", path: `${BASE}/structure/fields/${field}`, body: { label: "Otra" } },
      { method: "DELETE", path: `${BASE}/structure/fields/${field}` },
    )
    expect(statuses(answers)).toEqual([422, 422, 422, 422, 422, 422, 422, 422, 422])
    expect(JSON.parse(answers[4].body)).toEqual({ message: "Proceso activo", errors: { process: ["Proceso activo"] } })
  })

  it("edits sections and fields with the same answers and writes", async () => {
    const template = goldenTemplate()
    const [first, second] = template.sections
    const field = first.blocks[0].fields[0].id
    const answers = await expectSame(
      { method: "POST", path: `${BASE}/structure/sections`, body: { key: "nueva", title: "Nueva", position: 1 } },
      { method: "PATCH", path: `${BASE}/structure/sections/${first.id}`, body: { title: "Primera", orientation: "landscape" } },
      { method: "PATCH", path: `${BASE}/structure/sections/order`, body: { section_ids: documentOf(template).map((section) => section.id).toReversed() } },
      { method: "POST", path: `${BASE}/structure/sections/${second.id}/fields`, body: { key: "campo_nuevo", label: "Campo nuevo", quien_llena: "carrera", position: 1, content: { type: "doc", content: [{ type: "paragraph" }] } } },
      { method: "PATCH", path: `${BASE}/structure/fields/${field}`, body: { label: "Etiqueta", quien_llena: "institucional" } },
      { method: "PATCH", path: `${BASE}/structure/sections/${first.id}/fields/order`, body: { field_ids: first.blocks.flatMap((block) => block.fields.map((item) => item.id)).toReversed() } },
      { method: "DELETE", path: `${BASE}/structure/fields/${field}` },
      { method: "DELETE", path: `${BASE}/structure/sections/${second.id}` },
    )
    expect(answers.map((answer) => answer.status)).toEqual([201, 200, 422, 201, 200, 200, 200, 200])
  })

  it("rejects invalid structure input with the same 422 and 404", async () => {
    const first = goldenTemplate().sections[0]
    await expectSame(
      { method: "POST", path: `${BASE}/structure/sections`, body: { key: first.key, title: "" } },
      { method: "POST", path: `${BASE}/structure/sections`, body: [] },
      { method: "PATCH", path: `${BASE}/structure/sections/${first.id}`, body: { title: "x".repeat(300) } },
      { method: "PATCH", path: `${BASE}/structure/sections/order`, body: { section_ids: [first.id] } },
      { method: "POST", path: `${BASE}/structure/sections/${first.id}/fields`, body: { key: "Mal Clave", quien_llena: "nadie" } },
      { method: "POST", path: `${BASE}/structure/sections/${MISSING}/fields`, body: { key: "otro_campo", label: "Otro", quien_llena: "carrera" } },
      { method: "PATCH", path: `${BASE}/structure/sections/${first.id}/fields/order`, body: { field_ids: [MISSING] } },
      { method: "PATCH", path: `${BASE}/structure/sections/${MISSING}/fields/order`, body: { field_ids: [] } },
      { method: "PATCH", path: `${BASE}/structure/fields/${first.blocks[0].fields[0].id}`, body: { content: { type: "doc", content: [{ type: "imagen" }] } } },
    )
  })

  it("designs a repeatable table and checks, previews and rehearses a draft the same way", async () => {
    const design = { kind: "tabla_nueva", label: "Tabla nueva", new: true, columns: [{ key: "tema", title: "Tema", type: "text" }] }
    await expectSame(
      { method: "POST", path: `${BASE}/blocks/design`, body: design },
      { method: "POST", path: `${BASE}/blocks/design`, body: { kind: "Mal" } },
      { method: "POST", path: `${BASE}/draft/check`, body: draftPayload },
      { method: "POST", path: `${BASE}/draft/check`, body: { version: 1, sections: [] } },
      { method: "POST", path: `${BASE}/draft/impact`, body: draftPayload },
      { method: "POST", path: `${BASE}/draft/impact`, body: { version: 9 } },
      { method: "POST", path: `${BASE}/draft/preview`, body: draftPayload, mask: true },
      { method: "POST", path: `${BASE}/draft/preview`, body: { version: 9 } },
    )
    scenario = () => ({ paused: "5c5c5c5c-0000-4000-8000-000000000001" })
    await expectSame({ method: "POST", path: `${BASE}/draft/impact`, body: draftPayload })
  })

  it("throttles the draft check after 120 a minute the same way", async () => {
    const answers = await expectSame(...Array.from({ length: 121 }, () => ({ method: "POST", path: `${BASE}/draft/check`, body: { version: 1, sections: [] } })))
    expect(answers.at(-1)?.status).toBe(429)
    expect(answers[0].headers["x-ratelimit-remaining"]).toBe("119")
  })

  it("uploads the institution logo, rejects a bad one and a body over post_max_size the same way", async () => {
    const answers = await expectSame(
      { method: "POST", path: `${BASE}/logo`, form: { logo: { name: "logo.png", content: logoFile("small-50x20.png") } } },
      { method: "POST", path: `${BASE}/logo`, form: { logo: { name: "logo.png", content: logoFile("jpeg-40.jpg") } } },
      { method: "POST", path: `${BASE}/logo`, form: {} },
      { method: "POST", path: `${BASE}/logo`, form: { logo: { name: "logo.png", content: Buffer.alloc(POST_LIMIT + 1) } } },
      { method: "POST", path: `/api/v1/admin/template/${MISSING}/logo`, form: { logo: { name: "logo.png", content: logoFile("small-50x20.png") } } },
    )
    expect(statuses(answers)).toEqual([200, 422, 422, 413, 404])
    expect(answers[3].writes).toEqual(answers[2].writes)
  })

  it("serves the public schema, logos and syllabus images the same way", async () => {
    scenario = () => ({ faculties: [{ id: FACULTY, logo: null }] })
    const answers = await expectSame(
      { method: "GET", path: "/plantilla.schema.json", cookie: false },
      { method: "GET", path: "/logos/institucion", cookie: false },
      { method: "GET", path: `/logos/facultad/${FACULTY}`, cookie: false },
      { method: "GET", path: `/logos/facultad/${MISSING}`, cookie: false },
      { method: "GET", path: `/logos/facultad/${MISSING}`, cookie: false, headers: { accept: "text/html" } },
      { method: "GET", path: "/images/silabo/ueb.jpeg", cookie: false },
      { method: "GET", path: "/images/silabo/otra.png", cookie: false },
      { method: "GET", path: "/images/silabo/..%2F..%2Fsecreto", cookie: false },
    )
    expect(statuses(answers)).toEqual([200, 200, 200, 404, 404, 200, 404, 404])
  })

  it.each([
    ["POST", "/images/silabo/ueb.jpeg"],
    ["PUT", "/api/v1/admin/template"],
    ["DELETE", "/api/v1/admin/template"],
    ["POST", BASE],
    ["DELETE", BASE],
    ["POST", `${BASE}/json`],
    ["GET", `${BASE}/logo`],
    ["GET", `${BASE}/format`],
    ["GET", `${BASE}/structure`],
    ["GET", `${BASE}/structure/sections`],
    ["POST", `${BASE}/structure/sections/order`],
    ["PUT", `${BASE}/structure/fields/${MISSING}`],
    ["GET", `${BASE}/draft/check`],
    ["GET", `${BASE}/otra-cosa`],
    ["POST", "/plantilla.schema.json"],
    ["DELETE", "/logos/institucion"],
  ])("answers %s %s with the router answer of the contract", async (method, pathname) => {
    await expectSame({ method, path: pathname, cookie: false })
  })
})

describe("AI read permission routes", () => {
  type Entry = { id: string; key: string; readable: boolean; blocked_reason: string | null }
  const path = `${BASE}/ai-permissions`
  const idOf = (key: string) => goldenTemplate().sections.flatMap((section) => section.blocks).find((block) => block.key === key)!.fields[0].id
  const put = (key: string, readable: unknown, extra: Partial<Call> = {}): Call => ({ method: "PUT", path: `${path}/${idOf(key)}`, body: { readable }, ...extra })
  const send = async (call: Call) => {
    const answer = await nest(call)
    return { status: answer.status, body: JSON.parse(answer.body) as Record<string, unknown> }
  }
  const list = async () => (await send({ method: "GET", path })).body.fields as Entry[]
  const entry = async (key: string) => (await list()).find((item) => item.key === key)

  beforeEach(() => {
    state = freshState()
  })

  it("lists every field with whether the AI reads it and why a field is blocked", async () => {
    state.permissions = new Set(["descripcion", "asignatura", "firmas"])

    const fields = await list()

    expect(fields.map((item) => item.key)).toEqual(goldenTemplate().sections.flatMap((section) => section.blocks.map((block) => block.key)))
    expect(fields.find((item) => item.key === "descripcion")).toEqual({ id: idOf("descripcion"), key: "descripcion", readable: true, blocked_reason: null })
    expect(fields.find((item) => item.key === "unidades")).toMatchObject({ readable: false, blocked_reason: null })
    expect(fields.find((item) => item.key === "asignatura")).toMatchObject({ readable: false, blocked_reason: AI_BLOCKED_PROTECTED })
    expect(fields.find((item) => item.key === "firmas")).toMatchObject({ readable: false, blocked_reason: AI_BLOCKED_NOBODY })
  })

  it("turns a permission on and off while a period is open, without writing the template", async () => {
    state.openProcess = true
    state.lock = { period: "2026-1", deliveryOn: "2026-12-01" }

    const on = await send(put("descripcion", true))
    expect(on).toEqual({ status: 200, body: { message: "La IA ya puede leer este campo.", field: { id: idOf("descripcion"), key: "descripcion", readable: true, blocked_reason: null } } })
    expect((await entry("descripcion"))?.readable).toBe(true)

    const off = await send(put("descripcion", false))
    expect(off.body).toMatchObject({ message: "La IA ya no lee este campo.", field: { readable: false } })
    expect((await entry("descripcion"))?.readable).toBe(false)

    expect(state.writes.filter((write) => !write.startsWith("lock:"))).toEqual([
      `ai-permission:${TEMPLATE_ID}:descripcion:true:${golden.userId}`,
      `ai-permission:${TEMPLATE_ID}:descripcion:false:${golden.userId}`,
    ])
  })

  it.each([
    ["asignatura", AI_BLOCKED_PROTECTED],
    ["firmas", AI_BLOCKED_NOBODY],
  ])("refuses to turn on the blocked field %s and still lets it be turned off", async (key, reason) => {
    expect(await send(put(key, true))).toEqual({ status: 422, body: { message: reason, errors: { readable: [reason] } } })
    expect(state.permissions.size).toBe(0)

    expect((await send(put(key, false))).status).toBe(200)
    expect(state.permissions.size).toBe(0)
  })

  it("rejects a value that is not true or false and writes nothing", async () => {
    for (const value of [undefined, null, "si", [true]]) {
      const answer = await send(put("descripcion", value))
      expect(answer.status, String(value)).toBe(422)
      expect(Object.keys(answer.body.errors as object)).toEqual(["readable"])
    }
    expect(state.writes).toEqual([])
  })

  it("answers 404 for an unknown template and for a field that is no longer in the template", async () => {
    expect((await send({ method: "GET", path: `/api/v1/admin/template/${MISSING}/ai-permissions` })).status).toBe(404)
    for (const field of [MISSING, "no-es-uuid"]) expect((await send({ method: "PUT", path: `${path}/${field}`, body: { readable: true } })).status).toBe(404)
    expect(state.permissions.size).toBe(0)
  })

  it("belongs to Administration only", async () => {
    const calls = [{ method: "GET", path }, put("descripcion", true)]
    for (const call of calls) expect((await send({ ...call, cookie: false })).status).toBe(401)
    for (const role of ["docente", "coordinador", "bibliotecario"]) {
      state = { ...state, bridge: fakeDeps(adminWorld({ assignments: [makeAssignment({ id: ADMIN_ROLE, role })] })) }
      for (const call of calls) expect((await send(call)).status, role).toBe(403)
    }
    state = { ...state, bridge: fakeDeps(adminWorld({ users: [makeUser({ active: false })] })) }
    expect([(await send(calls[0])).status, (await send(calls[1])).status]).toEqual([403, 401])
    expect(state.permissions.size).toBe(0)
  })

  it("keeps the permission of the fields that survive a save of the template, and never gives one to removed or new fields", async () => {
    await send(put("descripcion", true))
    await send(put("objetivo_general", true))
    await send(put("ambientes_aprendizaje", true))
    const saved = templateExport(new Request("http://localhost:3000/"), goldenTemplate(), goldenTemplate().definition) as { secciones: { clave: string; campos: { clave: string }[] }[] }
    const sections = saved.secciones.map((section) => ({ ...section, campos: section.campos.filter((field) => field.clave !== "ambientes_aprendizaje") }))
    const described = sections.find((section) => section.clave === "descripcion")!
    described.campos.push({ ...described.campos[0], clave: "campo_agregado" })

    expect((await send({ method: "PUT", path: `${BASE}/json`, body: { ...saved, secciones: sections } })).status).toBe(200)

    const fields = await list()
    expect(fields.filter((item) => item.readable).map((item) => item.key)).toEqual(["descripcion", "objetivo_general"])
    expect(fields.find((item) => item.key === "descripcion")!.id).not.toBe(idOf("descripcion"))
    expect(fields.find((item) => item.key === "campo_agregado")).toMatchObject({ readable: false, blocked_reason: null })
    expect(fields.some((item) => item.key === "ambientes_aprendizaje")).toBe(false)
    expect((await send(put("descripcion", false))).status).toBe(404)
  })

  it("saves the editor draft with new_fields, which only the permissions notice", async () => {
    const draft = draftPayload as Record<string, unknown>
    for (const check of ["check", "impact", "preview"]) {
      const answers: string[] = []
      for (const body of [draft, { ...draft, new_fields: ["descripcion"] }]) {
        state = freshState()
        answers.push((await nest({ method: "POST", path: `${BASE}/draft/${check}`, body, mask: true })).body)
      }
      expect(answers[1], check).toBe(answers[0])
    }
    state = freshState()
    state.permissions = new Set(["descripcion", "objetivo_general"])

    expect((await send({ method: "PUT", path: `${BASE}/json`, body: { ...draft, new_fields: ["descripcion"] } })).status).toBe(200)

    expect([...state.permissions]).toEqual(["objetivo_general"])
  })

  it("drops the permission of a field removed through the structure routes", async () => {
    await send(put("descripcion", true))
    await send(put("objetivo_general", true))

    expect((await nest({ method: "DELETE", path: `${BASE}/structure/fields/${idOf("descripcion")}` })).status).toBe(200)

    expect([...state.permissions]).toEqual(["objetivo_general"])
  })

  it.each([
    ["POST", "ai-permissions"],
    ["DELETE", "ai-permissions"],
    ["GET", `ai-permissions/${MISSING}`],
    ["PATCH", `ai-permissions/${MISSING}`],
  ])("answers %s …/%s with the router answer of the contract", async (method, suffix) => {
    const answer = await nest({ method, path: `${BASE}/${suffix}`, cookie: false })
    expect(answer.status).toBe(405)
  })
})
