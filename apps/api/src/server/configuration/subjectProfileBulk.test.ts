// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected, purgeRequired } from "../syllabus/inProgressWorkHelpers"
import type { Db } from "../../prisma/db"
import type { PhpRecord } from "./phpValues"
import { careerProfileEditable, showSubjectProfile } from "./subjectProfile"
import { bulkSubjectProfiles } from "./subjectProfileBulk"
import { profileProgress, profileTemplates } from "./subjectProfileFields"
import { plainText } from "./templateRuntime"
import { updateSubjectProfile, type SubjectProfileTx, type SubjectProfileWriteDeps } from "./subjectProfileWrites"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "./testing"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000009"
const FIRST = "01a1c5bc-7a00-7000-8000-0000000000aa"
const SECOND = "01a1c5bc-7a00-7000-8000-0000000000bb"
const FOREIGN = "01a1c5bc-7a00-7000-8000-0000000000cc"
const BLOCKED = "El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado."

const index = (key: string) => goldenFields.findIndex((field) => field.key === key)
const SOLO_TEXTO = fieldId(index("sin_espacios"))
const CONTRIBUCION = fieldId(index("contribucion_perfil"))
const DESCRIPCION = fieldId(index("descripcion"))

const text = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] })

let world: FakeWorld
let templates: FakeTemplateWorld
let subjects: Map<string, string>
let period: { processState: string; convocationState: string | null } | null
let purge: Record<string, string[]> | null
let log: string[]

const periodDb = (): Db => ({ $queryRaw: async () => (period === null ? [] : [period]) }) as unknown as Db

function deps(): SubjectProfileWriteDeps {
  const tx: SubjectProfileTx = {
    store: fakeTemplateStore(templates),
    lockSubject: async (id) => {
      log.push(`lock:subject:${id}`)
      const careerId = subjects.get(id)
      return careerId === undefined ? null : { careerId }
    },
    careerEditable: (careerId) => careerProfileEditable(periodDb(), careerId),
    deleteValue: async (subjectId, field) => {
      log.push(`delete:${subjectId}:${field}`)
      templates.values = templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field))
    },
    saveValue: async (subjectId, field, document) => {
      log.push(`save:${subjectId}:${field}`)
      templates.values = [...templates.values.filter((value) => !(value.subjectId === subjectId && value.fieldId === field)), { fieldId: field, subjectId, value: document }]
    },
    keepContent: async (confirmed, careerId, subjectIds, change) => {
      log.push(`keep:${confirmed}:${careerId}:${subjectIds.join(",")}`)
      const result = await change()
      if (purge !== null && !confirmed) throw new GenerationRejected(purge)
      return result
    },
  }
  return {
    bridge: fakeDeps(world),
    store: fakeTemplateStore(templates),
    subjectCareer: async (id) => subjects.get(id) ?? null,
    careerActive: async () => true,
    careerEditable: (careerId) => careerProfileEditable(periodDb(), careerId),
    async transaction(work) {
      const values = templates.values
      log.push("begin")
      try {
        const result = await work(tx)
        log.push("commit")
        return result
      } catch (error) {
        templates.values = values
        log.push("rollback")
        throw error
      }
    },
  }
}

async function bulk(body: unknown, career: string | null = null) {
  const path = career === null ? "/api/v1/coordination/subject-profiles/bulk" : `/api/v1/admin/careers/${career}/subject-profiles/bulk`
  const request = new Request(apiRequest(path, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }), {
    body: JSON.stringify(body),
  })
  const response = await bulkSubjectProfiles(request, deps(), career)
  const raw = await response.text()
  return { status: response.status, text: raw, json: raw.startsWith("{") ? (JSON.parse(raw) as Record<string, unknown>) : null }
}

async function put(values: Record<string, unknown>, subject = FIRST) {
  const request = new Request(
    apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie, method: "PUT", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify({ values }) },
  )
  return updateSubjectProfile(request, subject, deps())
}

async function shown(subject = FIRST): Promise<Record<string, unknown>> {
  return (await (await showSubjectProfile(apiRequest(`/api/v1/academic/asignaturas/${subject}/ficha`, { cookie }), subject, deps())).json()) as Record<string, unknown>
}

const storedValue = (subject: string, field: string): PhpRecord | undefined => templates.values.find((value) => value.subjectId === subject && value.fieldId === field)?.value as PhpRecord | undefined
const context = () => ({ template: templates.template!, definition: templates.template!.definition, store: fakeTemplateStore(templates) })
const pendingOf = async (subject: string) => {
  const progress = (await profileProgress(context(), [subject])).get(subject)!
  return progress.total - progress.filled
}
const contentOf = (field: string) => templates.template!.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields)).find((item) => item.id === field)!

function asRole(role: string, careerId: string | null) {
  world.assignments = [makeAssignment({ role, careerId })]
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  templates = { template: goldenTemplate(), values: [] }
  subjects = new Map([
    [FIRST, CAREER],
    [SECOND, CAREER],
    [FOREIGN, OTHER_CAREER],
  ])
  period = { processState: "abierto", convocationState: "abierto" }
  purge = null
  log = []
  asRole("coordinador", CAREER)
})

describe("POST coordination/subject-profiles/bulk", () => {
  it("«plantilla» define los campos pendientes con el texto de la plantilla, sin marcarlos como copia editada", async () => {
    const before = await pendingOf(FIRST)

    const response = await bulk({ subjects: [FIRST, SECOND], fields: [SOLO_TEXTO, CONTRIBUCION], action: "plantilla" })

    expect(response.status).toBe(200)
    expect(response.json).toEqual({ message: "Acción masiva aplicada.", applied: 4, skipped: 0, not_applicable: 0 })
    const saved = storedValue(FIRST, SOLO_TEXTO)!
    expect(saved.attrs).toEqual({ accepted: true })
    expect(plainText(saved, templates.template!.definition)).toContain("Solo texto")
    expect(await pendingOf(FIRST)).toBe(before - 2)
    expect(await pendingOf(SECOND)).toBe(before - 2)
    expect(log[0]).toBe("begin")
    expect(log[1]).toBe(`keep:false:${CAREER}:${FIRST},${SECOND}`)
    expect(log.at(-1)).toBe("commit")
  })

  it("lo que se definió con la plantilla sigue los cambios de Administración y el docente recibe la plantilla", async () => {
    await bulk({ subjects: [FIRST], fields: [SOLO_TEXTO], action: "plantilla" })
    const field = contentOf(SOLO_TEXTO)
    field.content = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Texto NUEVO de Administración" }] }] }

    const profile = await shown()
    const values = profile.values as Record<string, PhpRecord>
    expect(JSON.stringify(values[SOLO_TEXTO])).toContain("Texto NUEVO de Administración")
    expect((values[SOLO_TEXTO].attrs as PhpRecord | undefined)?.accepted).toBe(true)
    expect(JSON.stringify(profile)).not.toContain('"edited"')
    expect(await profileTemplates(context(), FIRST)).toEqual({})
    expect(await pendingOf(FIRST)).toBe((await pendingOf(SECOND)) - 1)
  })

  it("«docente» deja un espacio de «Texto libre» para el docente, igual que «Configurar campo»", async () => {
    const response = await bulk({ subjects: [FIRST], fields: [DESCRIPCION, SOLO_TEXTO], action: "docente" })

    expect(response.json).toEqual({ message: "Acción masiva aplicada.", applied: 2, skipped: 0, not_applicable: 0 })
    for (const field of [DESCRIPCION, SOLO_TEXTO]) {
      const saved = storedValue(FIRST, field)!
      const [paragraph, ...rest] = saved.content as PhpRecord[]
      expect(rest).toEqual([])
      expect(paragraph.content).toEqual([{ type: "response", attrs: { kind: "texto", options: [], value: "" } }])
    }
    const templatesForTeacher = await profileTemplates(context(), FIRST)
    expect(JSON.stringify(templatesForTeacher[DESCRIPCION])).toContain('"kind":"texto"')
  })

  it("nunca sobrescribe un campo ya definido y lo cuenta como omitido", async () => {
    templates.values = [{ fieldId: SOLO_TEXTO, subjectId: FIRST, value: text("Escrito por la carrera") }]

    const response = await bulk({ subjects: [FIRST, SECOND], fields: [SOLO_TEXTO], action: "docente" })

    expect(response.json).toEqual({ message: "Acción masiva aplicada.", applied: 1, skipped: 1, not_applicable: 0 })
    expect(storedValue(FIRST, SOLO_TEXTO)).toEqual(text("Escrito por la carrera"))
    expect(log).not.toContain(`save:${FIRST}:${SOLO_TEXTO}`)
  })

  it("sin campos elegidos toma todos los pendientes y cuenta aparte los que no admiten la acción", async () => {
    const before = await pendingOf(FIRST)

    const response = await bulk({ subjects: [FIRST], action: "plantilla" })

    expect(response.status).toBe(200)
    const { applied, skipped, not_applicable: notApplicable } = response.json as Record<string, number>
    expect(skipped).toBe(0)
    expect(applied + notApplicable).toBe(before)
    expect(applied).toBeGreaterThanOrEqual(2)
    expect(storedValue(FIRST, DESCRIPCION)).toBeUndefined()
    expect(await pendingOf(FIRST)).toBe(notApplicable)
  })

  it("una plantilla sin texto no se usa tal cual y «Texto libre» no quita las tablas de la plantilla", async () => {
    expect((await bulk({ subjects: [FIRST], fields: [DESCRIPCION], action: "plantilla" })).json).toEqual({ message: "Acción masiva aplicada.", applied: 0, skipped: 0, not_applicable: 1 })
    expect((await bulk({ subjects: [FIRST], fields: [CONTRIBUCION], action: "docente" })).json).toEqual({ message: "Acción masiva aplicada.", applied: 0, skipped: 0, not_applicable: 1 })
    expect(templates.values).toEqual([])
  })

  it("respeta la regla de edición: con el periodo en pausa o finalizado responde 422 y no guarda", async () => {
    for (const blocked of [{ processState: "pausado", convocationState: "abierto" }, { processState: "cerrado", convocationState: null }]) {
      period = blocked
      const response = await bulk({ subjects: [FIRST], fields: [SOLO_TEXTO], action: "plantilla" })
      expect(response.status).toBe(422)
      expect(response.json).toEqual({ message: BLOCKED, errors: { process: [BLOCKED] } })
    }
    expect(templates.values).toEqual([])
  })

  it("Administración aplica la acción en cualquier carrera aunque el periodo esté en pausa", async () => {
    asRole("administrador", null)
    period = { processState: "pausado", convocationState: "abierto" }

    const response = await bulk({ subjects: [FIRST], fields: [SOLO_TEXTO], action: "plantilla" }, CAREER)

    expect(response.status).toBe(200)
    expect(storedValue(FIRST, SOLO_TEXTO)?.attrs).toEqual({ accepted: true })
  })

  it("una materia de otra carrera responde 403 y deshace todo; una materia desconocida responde 404", async () => {
    const foreign = await bulk({ subjects: [FIRST, FOREIGN], fields: [SOLO_TEXTO], action: "plantilla" })
    expect([foreign.status, foreign.text]).toEqual([403, '{"message":""}'])
    expect(templates.values).toEqual([])
    expect(log.at(-1)).toBe("rollback")
    const unknown = await bulk({ subjects: ["01a1c5bc-7a00-7000-8000-0000000000ff"], action: "plantilla" })
    expect(unknown.status).toBe(404)
  })

  it("la coordinación no usa la ruta de Administración, el docente no tiene acceso y Administración necesita la carrera", async () => {
    expect((await bulk({ subjects: [FIRST], action: "plantilla" }, CAREER)).status).toBe(403)
    asRole("docente", CAREER)
    expect((await bulk({ subjects: [FIRST], action: "plantilla" })).status).toBe(403)
    asRole("administrador", null)
    expect((await bulk({ subjects: [FIRST], action: "plantilla" })).status).toBe(403)
    expect(templates.values).toEqual([])
  })

  it("valida el pedido antes de abrir la transacción", async () => {
    const response = await bulk({ subjects: [], action: "borrar" })
    expect(response.status).toBe(422)
    expect(Object.keys(response.json?.errors as object).sort()).toEqual(["action", "subjects"])
    const gone = await bulk({ subjects: [FIRST], fields: ["01a1c5bc-7a00-7000-8000-00000000dead"], action: "plantilla" })
    expect(gone.json?.errors).toEqual({ fields: ["El proyecto de carrera incluye un campo que ya no existe en la plantilla."] })
    expect(log).toEqual([])
  })

  it("pide confirmar antes de devolver sílabos en curso a borrador y aplica con confirm_purge", async () => {
    purge = purgeRequired(2)
    const asked = await bulk({ subjects: [FIRST, SECOND], fields: [SOLO_TEXTO], action: "docente" })
    expect(asked.status).toBe(422)
    expect(asked.json?.errors).toEqual(purge)
    expect(templates.values).toEqual([])

    const confirmed = await bulk({ subjects: [FIRST, SECOND], fields: [SOLO_TEXTO], action: "docente", confirm_purge: true })
    expect(confirmed.status).toBe(200)
    expect(log).toContain(`keep:true:${CAREER}:${FIRST},${SECOND}`)
    expect(storedValue(SECOND, SOLO_TEXTO)).toBeDefined()
  })

  it("guardar la materia sin cambiar un campo definido con la plantilla lo deja definido", async () => {
    await bulk({ subjects: [FIRST], fields: [SOLO_TEXTO], action: "plantilla" })
    const values = (await shown()).values as Record<string, PhpRecord>

    const response = await put({ [SOLO_TEXTO]: values[SOLO_TEXTO] })

    expect(response.status).toBe(200)
    expect(storedValue(FIRST, SOLO_TEXTO)?.attrs).toEqual({ accepted: true })
    await put({ [SOLO_TEXTO]: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Solo texto" }] }, { type: "paragraph", content: [{ type: "text", text: "Lo llenó la carrera" }] }] } })
    expect(JSON.stringify(storedValue(FIRST, SOLO_TEXTO))).toContain("Lo llenó la carrera")
    expect(storedValue(FIRST, SOLO_TEXTO)?.attrs).toBeUndefined()
  })

  it("el navegador no puede marcar un campo como definido con la plantilla", async () => {
    const template = (await shown()).fields as Array<{ id: string; template: PhpRecord }>
    const blank = template.find((field) => field.id === SOLO_TEXTO)!.template

    const before = await pendingOf(FIRST)

    await put({ [SOLO_TEXTO]: { ...blank, attrs: { accepted: true } } })

    expect(storedValue(FIRST, SOLO_TEXTO)?.attrs).toBeUndefined()
    expect(await pendingOf(FIRST)).toBe(before)
  })
})
