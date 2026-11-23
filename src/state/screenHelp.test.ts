import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/screen-help", () => ({ listAvailableScreenHelp: vi.fn() }))

const help = { screen: "/admin/panel", title: "Panel", content: "Texto" }
const session = (id: string, code: string) => ({ user: { id }, active_role: { code } }) as never

describe("ayuda de las pantallas en memoria", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it("entrega la ayuda guardada al instante, sin esperar al servidor", async () => {
    localStorage.setItem("silabos:ayudas", JSON.stringify({ key: "u1:administrador", items: [help] }))
    const { listAvailableScreenHelp } = await import("@/api/screen-help")
    vi.mocked(listAvailableScreenHelp).mockReturnValue(new Promise(() => undefined))
    const { sessionState } = await import("@/state/session")
    const { screenHelpState } = await import("@/state/screenHelp")

    sessionState.replace(session("u1", "administrador"))

    expect(screenHelpState.forScreen("/admin/panel")?.title).toBe("Panel")
  })

  it("no usa la ayuda guardada de otra persona u otro rol y la reemplaza al llegar la respuesta", async () => {
    localStorage.setItem("silabos:ayudas", JSON.stringify({ key: "u1:administrador", items: [help] }))
    const { listAvailableScreenHelp } = await import("@/api/screen-help")
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [{ ...help, screen: "/docente/panel", title: "Docente" }] })
    const { sessionState } = await import("@/state/session")
    const { screenHelpState } = await import("@/state/screenHelp")

    sessionState.replace(session("u2", "docente"))
    expect(screenHelpState.forScreen("/admin/panel")).toBeNull()

    await vi.waitFor(() => expect(screenHelpState.forScreen("/docente/panel")?.title).toBe("Docente"))
  })

  it("borra la ayuda guardada al cerrar sesión", async () => {
    localStorage.setItem("silabos:ayudas", JSON.stringify({ key: "u1:administrador", items: [help] }))
    const { listAvailableScreenHelp } = await import("@/api/screen-help")
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [help] })
    const { sessionState } = await import("@/state/session")
    await import("@/state/screenHelp")

    sessionState.replace(session("u1", "administrador"))
    await vi.waitFor(() => expect(listAvailableScreenHelp).toHaveBeenCalled())
    sessionState.clear()

    await vi.waitFor(() => expect(localStorage.getItem("silabos:ayudas")).toBeNull())
  })
})
