// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import * as curriculum from "./coordination/academic/curriculum/[curriculum]/route"
import * as teacherAssignments from "./coordination/academic/teacher-assignments/route"
import * as coordinationDocuments from "./coordination/support-documents/route"
import * as teacherDocuments from "./teacher/support-documents/route"
import * as governanceRecord from "./admin/academic/[entity]/[record]/route"
import * as careerRecord from "./coordination/academic/[entity]/[record]/route"
import * as parallel from "./coordination/academic/parallels/[parallel]/route"
import * as careerEntity from "./coordination/academic/[entity]/route"
import * as parallels from "./coordination/academic/parallels/route"
import * as parallelTeacher from "./coordination/academic/parallels/[parallel]/teacher/route"
import * as curriculumConfiguration from "./coordination/academic/curriculum/[curriculum]/configuration/route"
import * as curriculumRequirements from "./coordination/academic/curriculum/[curriculum]/requirements/route"
import * as curriculumRequirement from "./coordination/academic/curriculum/[curriculum]/requirements/[requirement]/route"
import * as curriculumSubject from "./coordination/academic/curriculum/[curriculum]/subjects/[subject]/route"
import * as curriculumLayout from "./coordination/academic/curriculum/[curriculum]/subject-layout/route"
import * as careerImport from "./admin/academic/careers/import/route"
import * as careerImportTemplate from "./admin/academic/careers/import-template/route"
import * as curriculumImport from "./coordination/academic/curriculum-import/route"
import * as curriculumImportTemplate from "./coordination/academic/curriculum-import/template/route"
import * as teacherImport from "./coordination/academic/teachers/import/route"
import * as teacherImportTemplate from "./coordination/academic/teachers/import-template/route"
import * as userImport from "./admin/users/import/route"
import * as userImportTemplate from "./admin/users/import-template/route"

const ID = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
type Handler = (request: Request, context?: unknown) => Promise<Response>
type RouteModule = Record<string, Handler>

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function stubLaravel() {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 405 }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("academic routes", () => {
  it.each([
    [`/api/v1/coordination/academic/curriculum/${ID}`, curriculum, "GET"],
    ["/api/v1/coordination/academic/teacher-assignments", teacherAssignments, "GET"],
    ["/api/v1/coordination/support-documents", coordinationDocuments, "GET,POST"],
    ["/api/v1/teacher/support-documents", teacherDocuments, "GET"],
    [`/api/v1/admin/academic/periodo/${ID}`, governanceRecord, "DELETE,PATCH,POST"],
    [`/api/v1/coordination/academic/asignacion_docente/${ID}`, careerRecord, "DELETE,PATCH"],
    [`/api/v1/coordination/academic/parallels/${ID}`, parallel, "DELETE,PATCH"],
    ["/api/v1/coordination/academic/asignatura", careerEntity, "POST"],
    ["/api/v1/coordination/academic/parallels", parallels, "POST"],
    [`/api/v1/coordination/academic/parallels/${ID}/teacher`, parallelTeacher, "PUT"],
    [`/api/v1/coordination/academic/curriculum/${ID}/configuration`, curriculumConfiguration, "PATCH"],
    [`/api/v1/coordination/academic/curriculum/${ID}/requirements`, curriculumRequirements, "POST"],
    [`/api/v1/coordination/academic/curriculum/${ID}/requirements/${ID}`, curriculumRequirement, "DELETE"],
    [`/api/v1/coordination/academic/curriculum/${ID}/subjects/${ID}`, curriculumSubject, "DELETE"],
    [`/api/v1/coordination/academic/curriculum/${ID}/subject-layout`, curriculumLayout, "PATCH"],
    ["/api/v1/admin/academic/careers/import", careerImport, "POST"],
    ["/api/v1/admin/academic/careers/import-template", careerImportTemplate, "GET"],
    ["/api/v1/coordination/academic/curriculum-import", curriculumImport, "POST"],
    ["/api/v1/coordination/academic/curriculum-import/template", curriculumImportTemplate, "GET"],
    ["/api/v1/coordination/academic/teachers/import", teacherImport, "POST"],
    ["/api/v1/coordination/academic/teachers/import-template", teacherImportTemplate, "GET"],
    ["/api/v1/admin/users/import", userImport, "POST"],
    ["/api/v1/admin/users/import-template", userImportTemplate, "GET"],
  ] as [string, RouteModule, string][])("serves %s in Next and sends every other method to Laravel", async (path, module, served) => {
    const fetchMock = stubLaravel()
    const servedMethods = served.split(",")
    const others = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].filter((method) => !servedMethods.includes(method))
    for (const method of others) {
      const response = await module[method](new Request(`http://localhost:3000${path}`, { method, body: ["GET", "HEAD", "OPTIONS"].includes(method) ? undefined : "{}" }))
      expect(response.status).toBe(405)
    }
    expect(fetchMock).toHaveBeenCalledTimes(others.length)
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe(`http://127.0.0.1:8001${path}`)
    for (const method of servedMethods) {
      expect(module[method]).toBeTypeOf("function")
      expect(module[method]).not.toBe(module[others[0]])
    }
  })

  it("answers 401 in Next to a ported request without a stateful Referer", async () => {
    vi.stubEnv("LARAVEL_APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    const params = Promise.resolve({ curriculum: ID })
    const response = await curriculum.GET(new Request(`http://localhost:3000/api/v1/coordination/academic/curriculum/${ID}`, { headers: { accept: "application/json" } }), {
      params,
    })
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
  })

  it("answers 401 in Next to a ported write without a session", async () => {
    vi.stubEnv("LARAVEL_APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    const fetchMock = stubLaravel()
    const response = await parallels.POST(
      new Request("http://localhost:3000/api/v1/coordination/academic/parallels", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ codes: ["A"] }),
      }),
    )
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["/api/v1/admin/academic/careers/import", careerImport],
    ["/api/v1/coordination/academic/curriculum-import", curriculumImport],
    ["/api/v1/coordination/academic/teachers/import", teacherImport],
    ["/api/v1/admin/users/import", userImport],
  ] as [string, RouteModule][])("answers 401 in Next to an import upload without a session (%s)", async (path, module) => {
    vi.stubEnv("LARAVEL_APP_KEY", `base64:${Buffer.alloc(32).toString("base64")}`)
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6399/15")
    const fetchMock = stubLaravel()
    const form = new FormData()
    form.append("file", new File([new Uint8Array([80, 75])], "datos.xlsx"))
    const response = await module.POST(new Request(`http://localhost:3000${path}`, { method: "POST", headers: { accept: "application/json" }, body: form }))
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"message":"Unauthenticated."}')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends a creation of any other coordination entity to Laravel without reading the session", async () => {
    const fetchMock = stubLaravel()
    const path = "/api/v1/coordination/academic/curriculum-import"
    const response = await careerEntity.POST(new Request(`http://localhost:3000${path}`, { method: "POST", body: "{}" }), {
      params: Promise.resolve({ entity: "curriculum-import" }),
    })
    expect(response.status).toBe(405)
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe(`http://127.0.0.1:8001${path}`)
  })

  it("sends a generic coordination delete of another entity to Laravel without reading the session", async () => {
    const fetchMock = stubLaravel()
    const path = `/api/v1/coordination/academic/teachers/${ID}`
    const response = await careerRecord.DELETE(new Request(`http://localhost:3000${path}`, { method: "DELETE" }), {
      params: Promise.resolve({ entity: "teachers", record: ID }),
    })
    expect(response.status).toBe(405)
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toBe(`http://127.0.0.1:8001${path}`)
  })
})
