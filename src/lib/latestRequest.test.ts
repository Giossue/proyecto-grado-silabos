import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { latestRequest, useLatestRequest } from "@/lib/latestRequest"

describe("latestRequest", () => {
  it("solo la última petición iniciada sigue vigente", () => {
    const requests = latestRequest()
    const first = requests.begin()
    const second = requests.begin()

    expect(requests.isCurrent(first)).toBe(false)
    expect(requests.isCurrent(second)).toBe(true)
  })

  it("al salir de la pantalla ninguna petición sigue vigente", () => {
    const { result, unmount } = renderHook(() => useLatestRequest())
    const ticket = result.current.begin()

    unmount()

    expect(result.current.isCurrent(ticket)).toBe(false)
  })
})
