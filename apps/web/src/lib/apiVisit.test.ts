import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "@/api/client"
import { apiRouter, visitApi } from "@/lib/apiVisit"

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), api: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))

describe("apiRouter before visit", () => {
  beforeEach(() => vi.mocked(api).mockReset())

  it("permite cancelar una visita antes de realizar la petición", async () => {
    const onFinish = vi.fn()
    const stop = apiRouter.on("before", (event) => {
      expect(event.detail.visit.method).toBe("GET")
      expect(event.detail.visit.url).toBe("/ruta-protegida")
      event.preventDefault()
    })

    await visitApi("/ruta-protegida", { onFinish })
    stop()

    expect(onFinish).toHaveBeenCalledOnce()
    expect(api).not.toHaveBeenCalled()
  })
})

describe("visitApi purge confirmation", () => {
  beforeEach(() => vi.mocked(api).mockReset())

  it("resends with confirm_purge right away, without reporting the purge request as an error", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiError("Confirme", 422, { purge_required: ["Este cambio devolverá 1 sílabo a borrador"], purge_count: ["1"] }))
      .mockResolvedValueOnce({ message: "ok" })
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const onFinish = vi.fn()

    await visitApi("/plantilla", { method: "PATCH", data: { name: "Nueva" }, onError, onSuccess, onFinish })

    expect(vi.mocked(api).mock.calls).toEqual([
      ["/plantilla", { method: "PATCH", body: JSON.stringify({ name: "Nueva" }) }],
      ["/plantilla", { method: "PATCH", body: JSON.stringify({ name: "Nueva", confirm_purge: true }) }],
    ])
    expect(onError).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith({ message: "ok" })
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it("reports the error when the confirmed resend still asks for a purge", async () => {
    const purge = new ApiError("Confirme", 422, { purge_required: ["Este cambio devolverá 1 sílabo a borrador"] })
    vi.mocked(api).mockRejectedValueOnce(purge).mockRejectedValueOnce(purge)
    const onError = vi.fn()

    await visitApi("/plantilla", { method: "PATCH", data: { name: "Nueva" }, onError })

    expect(api).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledOnce()
  })
})
