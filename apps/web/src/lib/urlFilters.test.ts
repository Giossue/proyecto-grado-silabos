import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { queryOf, queryPage, queryText, syncFilters } from "@/lib/urlFilters"
import { navigation } from "@/test/nextNavigation"

const router = () => ({ replace: vi.fn() })

const clickLink = (href: string): void => {
  const link = document.createElement("a")
  link.href = href
  link.addEventListener("click", (event) => event.preventDefault())
  document.body.append(link)
  link.click()
  link.remove()
}

describe("urlFilters", () => {
  beforeEach(() => navigation.reset("/usuarios"))

  it("lee texto y página con valores por omisión", () => {
    expect(queryText("ana")).toBe("ana")
    expect(queryText(["a", "b"])).toBe("")
    expect(queryPage("3")).toBe(3)
    expect(queryPage(undefined)).toBe(1)
    expect(queryPage(null)).toBe(1)
  })

  it("arma la consulta como la de la ruta: un valor repetido queda como lista", () => {
    const query = queryOf(new URLSearchParams("q=ana&role=a&role=b"))

    expect(queryText(query.q)).toBe("ana")
    expect(queryText(query.role)).toBe("")
    expect(queryText(query.page)).toBe("")
  })

  it("omite filtros vacíos o en «all» y la primera página", () => {
    const target = router()
    syncFilters(target, { q: "ana", state: "all", role: "" }, 1)
    syncFilters(target, { q: "" }, 2)

    expect(target.replace).toHaveBeenNthCalledWith(1, "/usuarios?q=ana", { scroll: false })
    expect(target.replace).toHaveBeenNthCalledWith(2, "/usuarios?page=2", { scroll: false })
  })

  it("no vuelve a navegar si la dirección ya tiene esos filtros", () => {
    navigation.reset("/usuarios?q=ana")
    const target = router()

    syncFilters(target, { q: "ana" }, 1)

    expect(target.replace).not.toHaveBeenCalled()
  })
})

describe("syncFilters mientras se cambia de pantalla", () => {
  beforeEach(() => navigation.reset("/usuarios"))
  afterEach(() => navigation.reset("/"))

  it("no cancela la navegación en curso ni lleva el filtro a la otra pantalla", () => {
    const target = router()

    clickLink("/facultades")
    syncFilters(target, { q: "ana" }, 1)

    expect(target.replace).not.toHaveBeenCalled()
  })

  it("al terminar de cambiar de pantalla vuelve a guardar los filtros de la nueva", () => {
    const target = router()

    clickLink("/facultades")
    navigation.set("/facultades")
    syncFilters(target, { q: "ana" }, 1)

    expect(target.replace).toHaveBeenCalledWith("/facultades?q=ana", { scroll: false })
  })

  it("en la misma pantalla sigue guardando el filtro en la URL", () => {
    const target = router()

    clickLink("/usuarios?q=luis")
    syncFilters(target, { q: "ana" }, 2)

    expect(target.replace).toHaveBeenCalledWith("/usuarios?q=ana&page=2", { scroll: false })
  })
})
