import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/api/client"
import { apiRouter, visitApi } from "@/lib/apiVisit"

vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), api: vi.fn() }))

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
