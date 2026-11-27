import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RootLayout from "@/app/layout"

type Node = ReactElement<{ children?: unknown; dangerouslySetInnerHTML?: { __html: string } }>

const beforePaint = (): string => {
  const html = RootLayout({ children: null } as never) as Node
  const head = (html.props.children as Node[])[0]!
  const script = (head.props.children as Node[]).find((child) => child.type === "script")!
  return script.props.dangerouslySetInnerHTML!.__html
}

const runBeforePaint = (): boolean => {
  document.documentElement.classList.remove("dark")
  new Function(beforePaint())()
  return document.documentElement.classList.contains("dark")
}

describe("el tema antes de pintar la pantalla", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches: query === "(prefers-color-scheme: dark)" }) as MediaQueryList)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.classList.remove("dark")
  })

  it("empieza en claro aunque el sistema esté en oscuro", () => {
    expect(runBeforePaint()).toBe(false)
  })

  it("respeta el tema que la persona eligió", () => {
    localStorage.setItem("appearance", "dark")
    expect(runBeforePaint()).toBe(true)

    localStorage.setItem("appearance", "light")
    expect(runBeforePaint()).toBe(false)
  })
})
