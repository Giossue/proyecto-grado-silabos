import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { signal, useSignal } from "@/lib/signal"

describe("signal", () => {
  it("avisa a quien escucha solo cuando el valor cambia", () => {
    const count = signal(0)
    const listener = vi.fn()
    const stop = count.subscribe(listener)

    count.value = 0
    count.value = 1
    stop()
    count.value = 2

    expect(listener).toHaveBeenCalledTimes(1)
    expect(count.value).toBe(2)
  })

  it("vuelve a pintar el componente que lo usa", () => {
    const name = signal("Ana")
    const { result } = renderHook(() => useSignal(name))

    act(() => {
      name.value = "Luis"
    })

    expect(result.current).toBe("Luis")
  })
})
