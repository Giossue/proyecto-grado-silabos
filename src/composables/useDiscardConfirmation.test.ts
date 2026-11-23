import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useDiscardConfirmation } from "@/composables/useDiscardConfirmation"

describe("useDiscardConfirmation", () => {
  it("abre una sola confirmación aunque se pida dos veces y responde lo que se decide", async () => {
    const { result } = renderHook(() => useDiscardConfirmation())
    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = result.current.ask()
      second = result.current.ask()
    })

    expect(result.current.open).toBe(true)
    expect(second).toBe(first)
    act(() => result.current.decide(true))

    await expect(first).resolves.toBe(true)
    expect(result.current.open).toBe(false)
  })

  it("si la pantalla se cierra con la pregunta abierta, no descarta nada", async () => {
    const { result, unmount } = renderHook(() => useDiscardConfirmation())
    let answer!: Promise<boolean>
    act(() => {
      answer = result.current.ask()
    })
    unmount()

    await expect(answer).resolves.toBe(false)
  })
})
