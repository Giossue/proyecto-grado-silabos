import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DIALOG_EXIT_MS, afterDialogExit, useShownWhileClosing } from "@/lib/dialogExit"

describe("salida de los modales", () => {
  afterEach(() => vi.useRealTimers())

  it("espera lo que dura la animación de salida antes de seguir", async () => {
    vi.useFakeTimers()
    let done = false
    void afterDialogExit().then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it("conserva lo último que se mostró cuando el modal se cierra, y lo cambia al abrir otro", () => {
    const { result, rerender } = renderHook(({ removing }: { removing: { name: string } | null }) => useShownWhileClosing(removing), {
      initialProps: { removing: null as { name: string } | null },
    })
    expect(result.current).toBeNull()

    rerender({ removing: { name: "Ana" } })
    expect(result.current?.name).toBe("Ana")
    rerender({ removing: null })
    expect(result.current?.name).toBe("Ana")
    rerender({ removing: { name: "Luis" } })
    expect(result.current?.name).toBe("Luis")
  })
})
