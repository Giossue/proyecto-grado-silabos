import { render } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it } from "vitest"
import { useFillHeight } from "@/composables/useFillHeight"

function Probe({ enabled = true }: { enabled?: boolean }) {
  const element = useRef<HTMLDivElement>(null)
  const height = useFillHeight(element, enabled)

  return (
    <div data-slot="scroll-area-viewport">
      <div style={{ paddingBottom: "24px" }}>
        <div ref={element} data-height={height ?? "none"} />
      </div>
    </div>
  )
}

const layout = (container: HTMLElement, { viewportTop, viewportHeight, scrollTop, elementTop }: { viewportTop: number; viewportHeight: number; scrollTop: number; elementTop: number }) => {
  const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: viewportHeight })
  viewport.scrollTop = scrollTop
  viewport.getBoundingClientRect = () => ({ top: viewportTop }) as DOMRect
  container.querySelector<HTMLElement>("[data-height]")!.getBoundingClientRect = () => ({ top: elementTop }) as DOMRect
}

describe("useFillHeight", () => {
  it("ocupa lo que queda del área desplazable debajo del elemento, sin su margen inferior", () => {
    const { container, rerender } = render(<Probe />)
    layout(container, { viewportTop: 64, viewportHeight: 836, scrollTop: 0, elementTop: 264 })
    window.dispatchEvent(new Event("resize"))
    rerender(<Probe />)

    expect(container.querySelector("[data-height]")!.getAttribute("data-height")).toBe("612")
  })

  it("mide igual aunque la página ya esté desplazada", () => {
    const { container, rerender } = render(<Probe />)
    layout(container, { viewportTop: 64, viewportHeight: 836, scrollTop: 100, elementTop: 164 })
    window.dispatchEvent(new Event("resize"))
    rerender(<Probe />)

    expect(container.querySelector("[data-height]")!.getAttribute("data-height")).toBe("612")
  })

  it("apagado no fija una altura", () => {
    const { container } = render(<Probe enabled={false} />)

    expect(container.querySelector("[data-height]")!.getAttribute("data-height")).toBe("none")
  })
})
