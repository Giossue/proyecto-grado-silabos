// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { AppSession } from "../auth/types"
import { activeCareerId, resolveCareerScope } from "./careerScope"

const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
const INACTIVE_CAREER = "01a1c5bc-79cf-7000-8000-000000000001"
const MISSING = `{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Career] ${OTHER_CAREER}"}`

function session(role: string | null, careerId: string | null = null, active = true): AppSession {
  return {
    user: { id: "u", passwordHash: "", active, emailVerifiedAt: null, emailPreferences: null },
    activeRole: role === null ? null : { id: "r", userId: "u", role, careerId, careerLabel: null },
    eligibleRoles: [],
    session: { id: "s", token: "t", userId: "u", activeRoleAssignmentId: "r", cookies: [] },
  } as unknown as AppSession
}

const load = activeCareerId(async (id) => id === CAREER || id === OTHER_CAREER)

async function outcome(result: string | Response): Promise<string> {
  return result instanceof Response ? `${result.status} ${await result.text()}` : result
}

describe("resolveCareerScope", () => {
  it("gives the administrator the requested active career", async () => {
    expect(await outcome(await resolveCareerScope(session("administrador"), OTHER_CAREER, load))).toBe(OTHER_CAREER)
  })

  it("answers 404 when the administrator requests an inactive, missing or malformed career", async () => {
    const inactive = activeCareerId(async (id) => id === CAREER)
    expect(await outcome(await resolveCareerScope(session("administrador"), OTHER_CAREER, inactive))).toBe(`404 ${MISSING}`)
    expect((await outcome(await resolveCareerScope(session("administrador"), INACTIVE_CAREER, load))).startsWith("404 ")).toBe(true)
    expect((await outcome(await resolveCareerScope(session("administrador"), "not-a-uuid", load))).startsWith("404 ")).toBe(true)
  })

  it("refuses the administrator when no career is requested", async () => {
    expect((await outcome(await resolveCareerScope(session("administrador"), null, load))).startsWith("403 ")).toBe(true)
  })

  it("always gives the coordinator its own career", async () => {
    expect(await outcome(await resolveCareerScope(session("coordinador", CAREER), null, load))).toBe(CAREER)
    expect(await outcome(await resolveCareerScope(session("coordinador", CAREER), CAREER, load))).toBe(CAREER)
  })

  it("refuses a coordinator who requests another career, even an active one", async () => {
    expect(await outcome(await resolveCareerScope(session("coordinador", CAREER), OTHER_CAREER, load))).toBe('403 {"message":"No tiene permiso para hacer esto."}')
  })

  it("uses the caller's refusal for coordinators without an active career, other roles and inactive users", async () => {
    const refusal = () => new Response("custom", { status: 403 })
    expect(await outcome(await resolveCareerScope(session("coordinador", INACTIVE_CAREER), null, load, refusal))).toBe("403 custom")
    expect(await outcome(await resolveCareerScope(session("coordinador", null), null, load, refusal))).toBe("403 custom")
    expect(await outcome(await resolveCareerScope(session("docente", CAREER), CAREER, load, refusal))).toBe("403 custom")
    expect(await outcome(await resolveCareerScope(session("coordinador", CAREER, false), null, load, refusal))).toBe("403 custom")
    expect(await outcome(await resolveCareerScope(session(null), CAREER, load, refusal))).toBe("403 custom")
  })
})
