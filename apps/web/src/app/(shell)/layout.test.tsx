import { act, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Layout from "@/app/(shell)/layout"
import { useMissingPage } from "@/composables/useMissingPage"
import { navigation } from "@/test/nextNavigation"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/layouts/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div data-testid="menu-y-barra">{children}</div> }))

function Pantalla({ falta }: { falta: boolean }) {
  useMissingPage(falta)
  return <p>Contenido de la pantalla</p>
}

const show = (falta: boolean) => render(<Layout><Pantalla falta={falta} /></Layout>)

describe("página no encontrada dentro de la aplicación", () => {
  beforeEach(() => navigation.reset("/admin/carreras/no-existe/malla"))

  it("usa toda la pantalla: sin menú, sin barra y sin el contenido de antes", () => {
    show(true)

    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument()
    expect(screen.queryByTestId("menu-y-barra")).toBeNull()
    expect(screen.queryByText("Contenido de la pantalla")).toBeNull()
  })

  it("si el registro existe, la pantalla sale como siempre", () => {
    show(false)

    expect(screen.getByTestId("menu-y-barra")).toHaveTextContent("Contenido de la pantalla")
    expect(screen.queryByRole("heading", { name: "Página no encontrada" })).toBeNull()
  })

  it("al ir a otra dirección vuelven el menú y la pantalla", () => {
    const view = show(true)

    view.rerender(<Layout><Pantalla falta={false} /></Layout>)
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument()
    act(() => navigation.set("/admin/estructura-academica"))

    expect(screen.getByTestId("menu-y-barra")).toHaveTextContent("Contenido de la pantalla")
    expect(screen.queryByRole("heading", { name: "Página no encontrada" })).toBeNull()
  })
})
