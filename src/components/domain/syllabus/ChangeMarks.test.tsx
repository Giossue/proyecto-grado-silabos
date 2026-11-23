import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ChangeMarks } from "@/components/domain/syllabus/ChangeMarks"
import { flush } from "@/test/render"

describe("ChangeMarks", () => {
  it("pone una marca por cada campo que cambió y lleva al campo al pulsarla", async () => {
    document.body.innerHTML = '<div data-app-scroll><div data-slot="scroll-area-viewport"></div></div>'
    const root = document.createElement("section")
    root.innerHTML = '<div data-changed id="a"></div><div id="b"></div><div data-changed id="c"></div>'
    document.body.append(root)
    const target = root.querySelector<HTMLElement>("#c")!
    target.scrollIntoView = vi.fn()

    const { container, unmount } = render(<ChangeMarks root={root} />)
    await flush()

    const marks = [...container.querySelectorAll("button")]
    expect(marks).toHaveLength(2)
    expect(marks[1]!.getAttribute("aria-label")).toBe("Ir al cambio 2")
    fireEvent.click(marks[1]!)
    expect(target.scrollIntoView).toHaveBeenCalled()
    unmount()
  })

  it("no dibuja nada si no hay cambios", async () => {
    document.body.innerHTML = '<div data-app-scroll><div data-slot="scroll-area-viewport"></div></div>'
    const root = document.createElement("section")
    root.innerHTML = '<div id="a"></div>'
    document.body.append(root)

    const { container, unmount } = render(<ChangeMarks root={root} />)
    await flush()

    expect(container.querySelector("button")).toBeNull()
    unmount()
  })
})
