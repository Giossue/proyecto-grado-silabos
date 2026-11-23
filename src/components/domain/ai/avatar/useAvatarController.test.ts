import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAvatarController, type ChatLifecycleSignals } from "./useAvatarController"

const setup = () => {
  let signals: ChatLifecycleSignals = { userEngaged: false, awaitingModel: false, receivedCount: 0 }
  const view = renderHook((current: ChatLifecycleSignals) => useAvatarController(current), { initialProps: signals })
  const change = (next: Partial<ChatLifecycleSignals>) => {
    signals = { ...signals, ...next }
    view.rerender(signals)
  }
  return { view, change, mode: () => view.result.current.state.mode }
}

describe("useAvatarController", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("sigue el ciclo idle → listening → thinking → speaking → idle", () => {
    const { change, mode } = setup()
    expect(mode()).toBe("idle")

    change({ userEngaged: true })
    expect(mode()).toBe("listening")

    change({ awaitingModel: true })
    expect(mode()).toBe("thinking")

    change({ userEngaged: false, awaitingModel: false, receivedCount: 2 })
    expect(mode()).toBe("speaking")

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(mode()).toBe("idle")
  })

  it("no habla al cargar historial sin solicitud pendiente", () => {
    const { change, mode } = setup()
    change({ receivedCount: 3 })
    expect(mode()).toBe("idle")
  })
})
