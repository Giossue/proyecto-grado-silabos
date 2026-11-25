import { notifyManager } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cachedValue, getQueryClient } from "@/lib/queryClient"

describe("cachedValue", () => {
  afterEach(() => notifyManager.setScheduler((callback) => callback()))

  it("avisa del cambio después de que termina el render que creó la consulta", async () => {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    const key = ["cached-value", "render"]
    const listener = vi.fn()
    const unsubscribe = cachedValue(() => key, null).subscribe(listener)

    getQueryClient().getQueryCache().build(getQueryClient(), { queryKey: key })
    expect(listener).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    unsubscribe()
  })

  it("entrega el valor guardado para su clave", () => {
    const key = ["cached-value", "data"]
    getQueryClient().setQueryData(key, "guardado")

    expect(cachedValue(() => key, "vacío").value).toBe("guardado")
    expect(cachedValue(() => null, "vacío").value).toBe("vacío")
  })
})
