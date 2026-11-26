import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SyllabusAcademicContext } from "@/components/domain/syllabus/SyllabusAcademicContext"

const valueOf = (container: HTMLElement, label: string, group: string): string | null => {
  const section = [...container.querySelectorAll("section")].find((item) => item.querySelector("h3")?.textContent === group)
  const entry = [...(section?.querySelectorAll("div") ?? [])].find((item) => item.querySelector("dt")?.textContent === label)
  return entry?.querySelector("dd")?.textContent ?? null
}

describe("SyllabusAcademicContext", () => {
  afterEach(() => { document.body.innerHTML = "" })

  it("muestra el campus y los correquisitos que escribió el docente", () => {
    const { container } = render(<SyllabusAcademicContext variables={{ nombre_campus: "Guaranda", correquisitos_asignatura: "SW-P7-040", prerrequisitos_asignatura: "SW-P6-032" }} />)
    expect(valueOf(container, "Campus", "Oferta académica")).toBe("Guaranda")
    expect(valueOf(container, "Correquisitos", "Asignatura")).toBe("SW-P7-040")
    expect(valueOf(container, "Prerrequisitos", "Asignatura")).toBe("SW-P6-032")
  })

  it("avisa que el campus y los correquisitos los completa el docente mientras están vacíos", () => {
    const { container } = render(<SyllabusAcademicContext variables={{}} />)
    expect(valueOf(container, "Campus", "Oferta académica")).toBe("Lo completa el docente")
    expect(valueOf(container, "Correquisitos", "Asignatura")).toBe("Lo completa el docente")
    expect(valueOf(container, "Prerrequisitos", "Asignatura")).toBe("Pendiente de Coordinación")
  })
})
