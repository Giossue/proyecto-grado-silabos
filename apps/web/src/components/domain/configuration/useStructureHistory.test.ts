import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useStructureHistory } from "@/components/domain/configuration/useStructureHistory"

const setup = (limit?: number) => {
  let state = { value: 0 }
  const view = renderHook(() => useStructureHistory({ capture: () => state, restore: (next) => { state = next }, limit }))
  const history = () => view.result.current
  const change = (value: number, group?: string) => {
    act(() => history().record(group))
    state = { value }
  }
  const step = (direction: "undo" | "redo"): boolean => {
    let moved = false
    act(() => {
      moved = history()[direction]()
    })
    return moved
  }
  return { history, change, step, current: () => state.value }
}

describe("useStructureHistory", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("deshace y rehace en orden y un cambio nuevo borra lo que se podía rehacer", () => {
    const { history, change, step, current } = setup()
    change(1)
    change(2)
    expect(step("undo")).toBe(true)
    expect(current()).toBe(1)
    expect(step("redo")).toBe(true)
    expect(current()).toBe(2)
    step("undo")
    change(5)
    expect(history().canRedo).toBe(false)
    expect(step("redo")).toBe(false)
  })

  it("junta los cambios seguidos del mismo grupo y los separa al pasar el tiempo", () => {
    const { history, change, step, current } = setup()
    change(1, "titulo")
    vi.advanceTimersByTime(300)
    change(2, "titulo")
    vi.advanceTimersByTime(3000)
    change(3, "titulo")
    step("undo")
    expect(current()).toBe(2)
    step("undo")
    expect(current()).toBe(0)
    expect(history().canUndo).toBe(false)
  })

  it("guarda como máximo el límite de pasos", () => {
    const { change, step } = setup(3)
    for (let value = 1; value <= 6; value += 1) change(value)
    let steps = 0
    while (step("undo")) steps += 1
    expect(steps).toBe(3)
  })

  it("reset deja el historial vacío", () => {
    const { history, change } = setup()
    change(1)
    act(() => history().reset())
    expect(history().canUndo).toBe(false)
  })
})
