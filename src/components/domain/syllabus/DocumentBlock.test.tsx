import { fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { searchLibraryCatalog } from "@/api/libraryCatalog"
import { FreeTextContent } from "@/components/domain/syllabus/FreeTextContent"
import { FreeTextEditor } from "@/components/domain/syllabus/FreeTextEditor"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@/lib/blocks/types"
import { nodesOfType, type DocumentNode } from "@/lib/templateDocument"
import definition from "@/test/fixtures/template-definition.json"
import { catalogResults } from "@/test/libraryCatalog"
import { flush } from "@/test/render"

vi.mock("@/api/libraryCatalog", () => ({ searchLibraryCatalog: vi.fn() }))

const official = definition as unknown as TemplateDefinitionPayload
const block = (kind: string, value: Record<string, unknown> = {}, props: Record<string, unknown> = {}): DocumentNode => ({ type: "doc", content: [{ type: "documentBlock", attrs: { kind, props, value } }] })
const mountEditor = (value: DocumentNode, blocks: "configure" | "fill" = "fill") => {
  const onValueChange = vi.fn()
  render(<FreeTextEditor id="campo" label="Campo" value={value} blocks={blocks} onValueChange={onValueChange} />)

  return { last: (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode }
}
const attrsOf = <T,>(document: DocumentNode): T => nodesOfType(document, "documentBlock")[0]!.attrs as T
const byLabel = <T extends Element = HTMLInputElement>(label: string): T => document.body.querySelector<T>(`[aria-label="${label}"]`)!
const type = async (label: string, text: string): Promise<void> => {
  fireEvent.change(byLabel(label), { target: { value: text } })
  await flush()
}
const textOf = (value: DocumentNode): string => render(<FreeTextContent value={value} />).container.textContent ?? ""

describe("bloques definidos en la plantilla", () => {
  beforeEach(() => setTemplateRuntime(official, { nombre_facultad: "Ciencias", formacion_docente: "Formación escrita en el perfil", horas_docencia: "32", horas_practicas: "0", horas_autonomas: "32", semanas_periodo: "16" }))

  describe("identificación", () => {
    type Disability = { answer: string | null; type: string; description: string }
    const identification = (disability: Disability = { answer: null, type: "", description: "" }) => block("identificacion", { disability })
    const disabilityOf = (document: DocumentNode): Disability => attrsOf<{ value: { disability: Disability } }>(document).value.disability

    it("se dibuja como una sola tabla con los datos del sistema y la respuesta marcada", () => {
      const { container } = render(<FreeTextContent value={identification({ answer: "si", type: "Visual", description: "Baja visión" })} />)
      expect(container.querySelectorAll("table")).toHaveLength(1)
      expect(container.textContent).toContain("FACULTAD: Ciencias")
      expect(container.textContent).toContain("Formación escrita en el perfil")
      expect(container.textContent).toContain("Tipo de discapacidad: Visual")
      expect([...container.querySelectorAll("td")].map((item) => item.textContent)).toContain("X")
    })

    it("en el editor del docente las celdas muestran el valor real y no hay botón de datos del sistema", async () => {
      mountEditor(identification())
      await flush()
      expect(document.body.querySelector("[data-block]")!.textContent).toContain("Ciencias")
      expect(document.body.querySelector("[data-block]")!.textContent).not.toContain("Nombre de la facultad")
      expect(document.body.querySelector('[aria-label="Insertar dato del sistema"]')).toBeNull()
    })

    it("el docente marca Sí y escribe el tipo dentro de la misma tabla", async () => {
      const { last } = mountEditor(identification())
      await flush()
      expect(document.body.querySelectorAll("table")).toHaveLength(1)
      expect(byLabel("Tipo de discapacidad").disabled).toBe(true)

      fireEvent.click(byLabel<HTMLElement>("Estudiantes con discapacidad: Sí"))
      await flush()
      expect(disabilityOf(last()).answer).toBe("si")

      await type("Tipo de discapacidad", "Auditiva")
      expect(disabilityOf(last()).type).toBe("Auditiva")
    })

    it("marcar No borra el detalle", async () => {
      const { last } = mountEditor(identification({ answer: "si", type: "Visual", description: "x" }))
      await flush()
      fireEvent.click(byLabel<HTMLElement>("Estudiantes con discapacidad: No"))
      await flush()
      expect(disabilityOf(last())).toEqual({ answer: "no", type: "", description: "" })
    })

    it("el administrador la ve sin controles de respuesta", async () => {
      mountEditor(identification(), "configure")
      await flush()
      expect(document.body.querySelector('[aria-label="Tipo de discapacidad"]')).toBeNull()
      expect(document.body.textContent).toContain("FACULTAD: Ciencias")
    })
  })

  describe("unidades", () => {
    const unitsOf = (document: DocumentNode) => attrsOf<{ value: { units: Array<{ semanas: Array<Record<string, string>> }> } }>(document).value.units
    const units = (weeks = 4): DocumentNode => block("unidades", { units: Array.from({ length: 4 }, () => ({ nombre: "", resultado: "", semanas: Array.from({ length: weeks }, () => ({ contenidos: "", acd_h: "", ape_h: "", aa_h: "", acd: "", ape: "", aa: "", evaluacion: "" })) })) })

    it("dibuja las cuatro unidades con la tabla oficial y las semanas numeradas del 1 al 16", () => {
      const { container } = render(<FreeTextContent value={units()} />)
      expect(container.querySelectorAll("table")).toHaveLength(4)
      expect(container.textContent).toContain("Nombre de la unidad")
      expect(container.textContent).toContain("DOCENCIA")
      expect(container.textContent).toContain("Total, horas")
      expect([...container.querySelectorAll("td")].map((cell) => cell.textContent)).toContain("16")
    })

    it("compara las horas repartidas con las de la asignatura y avisa cuáles no cuadran", async () => {
      const { last } = mountEditor(units())
      await flush()
      await type("ACD, unidad 1, semana 1", "32")
      expect(unitsOf(last())[0]!.semanas[0]!.acd_h).toBe("32")
      const summary = document.body.querySelector("[data-block-summary]")!.textContent!
      expect(summary).toContain("Semanas 16 de 16")
      expect(summary).toContain("ACD 32 de 32")
      expect(summary).toContain("APE 0 de 0")
      expect(summary).toContain("AA 0 de 32")
    })

    it("no deja pasar de 16 semanas y quita las que sobran", async () => {
      const { last } = mountEditor(units())
      await flush()
      expect(byLabel<HTMLButtonElement>("Agregar semana (unidad 1)").disabled).toBe(true)
      fireEvent.click(byLabel<HTMLButtonElement>("Quitar unidad 4, semana 4"))
      await flush()
      expect(unitsOf(last())[3]!.semanas).toHaveLength(3)
      fireEvent.click(byLabel<HTMLButtonElement>("Agregar semana (unidad 1)"))
      await flush()
      expect(unitsOf(last())[0]!.semanas).toHaveLength(5)
    })
  })

  describe("evaluación", () => {
    it("con horas de práctico-experimental reparte 2,5, 2, 2 y 3,5 puntos", () => {
      setTemplateRuntime(official, { horas_practicas: "16" })
      const text = textOf(block("evaluacion"))
      expect(text).toContain("2.5 PUNTOS")
      expect(text).toContain("práctico-experimental")
    })

    it("sin horas de práctico-experimental usa 3,5, 3 y 3,5 puntos y quita la fila", () => {
      const text = textOf(block("evaluacion"))
      expect(text).toContain("3.0 PUNTOS")
      expect(text).not.toContain("práctico-experimental")
    })
  })

  describe("bibliografía", () => {
    type Book = Record<"autor" | "titulo" | "anio" | "ciudad" | "editorial" | "isbn" | "codigo", string>
    const empty: Book = { autor: "", titulo: "", anio: "", ciudad: "", editorial: "", isbn: "", codigo: "" }
    const booksOf = (document: DocumentNode): Book[] => attrsOf<{ value: { libros: Book[] } }>(document).value.libros
    const bibliography = (libros: Book[] = [empty]) => block("bibliografia", { libros })
    const buttonWith = (text: string): HTMLButtonElement => [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === text) as HTMLButtonElement

    it("se dibuja como la tabla de siempre, con los siete títulos y una fila por libro", () => {
      const { container } = render(<FreeTextContent value={bibliography([{ ...empty, titulo: "Proyectos de inversión", isbn: "9789563431063" }, { ...empty, titulo: "Zootecnia básica" }])} />)

      expect([...container.querySelectorAll("th")].map((item) => item.textContent)).toEqual(["Autor", "Título", "Año", "Ciudad", "Editorial", "ISBN", "Código"])
      expect(container.querySelectorAll("tr")).toHaveLength(3)
      expect(container.textContent).toContain("9789563431063")
    })

    it("el docente escribe en las columnas y agrega o quita libros", async () => {
      const { last } = mountEditor(bibliography())
      await flush()

      await type("Título, libro 1", "Proyectos de inversión")
      expect(booksOf(last())[0]!.titulo).toBe("Proyectos de inversión")
      fireEvent.click(byLabel<HTMLButtonElement>("Agregar libro"))
      await flush()
      expect(booksOf(last())).toHaveLength(2)
    })

    it("busca en la biblioteca y llena la fila vacía con el libro elegido", async () => {
      vi.mocked(searchLibraryCatalog).mockResolvedValue(catalogResults([{ id: "10525", title: "Proyectos de inversión", author: "Sapag Chain, Nassir", year: "2011", place: "Santiago de Chile", publisher: "Pearson Educación", isbn: "9789563431063", call_number: "658.404 S2411p", format: "Libro físico", kind: "Libro" }]))
      const { last } = mountEditor(bibliography())
      await flush()

      fireEvent.click(buttonWith("Buscar en la biblioteca"))
      await flush()
      fireEvent.change(byLabel("Texto a buscar"), { target: { value: "Sapag" } })
      await flush()
      fireEvent.submit(document.body.querySelector('[role="dialog"] form')!)
      await flush()
      fireEvent.click(buttonWith("Agregar"))
      await flush()

      expect(booksOf(last())).toEqual([{ autor: "Sapag Chain, Nassir", titulo: "Proyectos de inversión", anio: "2011", ciudad: "Santiago de Chile", editorial: "Pearson Educación", isbn: "9789563431063", codigo: "Libro físico" }])
    })

    it("Administración la ve sin el buscador", async () => {
      mountEditor(bibliography(), "configure")
      await flush()

      expect(buttonWith("Buscar en la biblioteca")).toBeUndefined()
    })
  })
})
