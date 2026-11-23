import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/api/client"
import { apiRouter, useApiForm, visitApi } from "@/lib/apiVisit"

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

describe("useApiForm", () => {
  beforeEach(() => vi.mocked(api).mockReset())

  it("envía los datos del formulario y avisa al terminar", async () => {
    vi.mocked(api).mockResolvedValue({})
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useApiForm({ nombre: "" }))

    act(() => result.current.setData("nombre", "Software"))
    await act(async () => {
      result.current.post("/careers", { onSuccess })
    })

    expect(api).toHaveBeenCalledWith("/careers", { method: "POST", body: JSON.stringify({ nombre: "Software" }) })
    expect(onSuccess).toHaveBeenCalled()
    expect(result.current.processing).toBe(false)
  })
})
