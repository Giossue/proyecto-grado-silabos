import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MobileFilterSheet } from "@/components/domain/MobileFilterSheet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

const SCROLLBAR = 10
const globals = readFileSync(join("src", "app", "globals.css"), "utf8").replace(/\s+/g, " ")
const MODAL_SURFACES = new Set(["MobileFilterSheet.tsx", "FreeTextEditor.tsx", "AppProviders.tsx"])

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return [join("src", "components", "ui"), join("src", "app", "api")].includes(path) ? [] : sourceFiles(path)
    return path.endsWith(".tsx") && !path.endsWith(".test.tsx") ? [path] : []
  })

const fixedClassLists = (path: string): string[] =>
  [...readFileSync(path, "utf8").matchAll(/"([^"\n]*)"/g)].map((match) => match[1]!).filter((classes) => classes.trim().includes(" ") && /(^|\s)([\w-]+:)*fixed(\s|$)/.test(classes))

describe("bloqueo del desplazamiento al abrir un modal", () => {
  beforeEach(() => {
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, get: () => window.innerWidth - SCROLLBAR })
  })
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, "clientWidth")
  })

  it("un modal de Radix publica el ancho de la barra que quita y compensa el contenido", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Texto</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    const injected = [...document.head.querySelectorAll("style")].map((style) => style.textContent).join(" ").replace(/\s+/g, " ")
    expect(document.body).toHaveAttribute("data-scroll-locked")
    expect(injected).toContain(`--removed-body-scroll-bar-size: ${SCROLLBAR}px`)
    expect(injected).toContain(`margin-right: ${SCROLLBAR}px !important`)
  })

  it("las capas fijas del shell se corren lo mismo que la barra quitada", () => {
    expect(globals).toContain("@utility scroll-lock-offset { margin-right: var(--removed-body-scroll-bar-size, 0px); }")
    expect(globals).toMatch(/\.driver-checklist\.setup-checklist \{[^}]*margin-right: var\(--removed-body-scroll-bar-size, 0px\)/)
    expect(globals).toMatch(/\.toaster\[data-sonner-toaster\] \{[^}]*margin-right: var\(--removed-body-scroll-bar-size, 0px\)/)

    const layers = ["src/components", "src/layouts", "src/app"]
      .flatMap(sourceFiles)
      .filter((path) => !MODAL_SURFACES.has(path.split(/[\\/]/).at(-1)!))
      .flatMap((path) => fixedClassLists(path).map((classes) => ({ path, classes })))
    expect(layers.length).toBeGreaterThanOrEqual(6)
    expect(layers.filter((layer) => !layer.classes.split(" ").some((name) => name.endsWith("scroll-lock-offset")))).toEqual([])
  })

  it("la hoja de filtros bloquea el desplazamiento sin quitar el ancho de la barra", () => {
    render(
      <MobileFilterSheet>
        <select defaultValue="all" aria-label="Estado">
          <option value="all">Todos</option>
        </select>
      </MobileFilterSheet>,
    )
    const panel = screen.getByRole("group", { name: "Filtros de la tabla" })

    fireEvent.click(document.body.querySelector<HTMLElement>("button[aria-expanded]")!)

    expect(panel).toHaveAttribute("data-slot", "filter-sheet")
    expect(panel).toHaveAttribute("data-state", "open")
    expect(document.body.style.overflow).toBe("")
    expect(document.documentElement.style.overflow).toBe("")
    expect(globals).toMatch(/@media \(width < 40rem\) \{.*html:has\(\[data-slot="filter-sheet"\]\[data-state="open"\]\) \{ overflow: hidden; scrollbar-gutter: stable; \}/)
  })
})
