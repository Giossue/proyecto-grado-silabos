import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Calendar } from "./calendar"

describe("Calendar navigation", () => {
  it("keeps the month arrows above the caption so a pointer can reach them", () => {
    render(<Calendar mode="single" captionLayout="dropdown" defaultMonth={new Date(2026, 10, 1)} />)
    const next = screen.getByRole("button", { name: "Mes siguiente" })
    const nav = next.parentElement!
    expect(nav.className).toMatch(/\bz-10\b/)
    expect(nav.className).toMatch(/\bpointer-events-none\b/)
    expect(next.className).toMatch(/\bpointer-events-auto\b/)
    expect(screen.getByRole("button", { name: /anterior/i }).className).toMatch(/\bpointer-events-auto\b/)
  })
})
