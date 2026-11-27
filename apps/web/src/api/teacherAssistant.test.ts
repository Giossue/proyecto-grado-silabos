import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTeacherAssistant, sendTeacherAssistantMessage } from "@/api/teacherAssistant"

const answers = (payload: unknown) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input
    void init
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
  })
  vi.stubGlobal("fetch", fetchMock)

  return () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!
    return { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null }
  }
}

describe("API del asistente del docente", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("consulta y envía en las rutas del sílabo", async () => {
    const sent = answers({ available: false })

    await expect(getTeacherAssistant("silabo-1")).resolves.toEqual({ available: false })
    expect(sent()).toEqual({ url: "/api/v1/teacher/syllabi/silabo-1/assistant", method: "GET", body: null })

    await sendTeacherAssistantMessage("silabo-1", "Ideas", "clave-1")
    expect(sent()).toEqual({ url: "/api/v1/teacher/syllabi/silabo-1/assistant/messages", method: "POST", body: { message: "Ideas", idempotency_key: "clave-1" } })
  })
})
