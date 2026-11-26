// @vitest-environment node
import { describe, expect, it } from "vitest"
import { IDENTIFICATION_SAMPLE } from "../configuration/templatePresentation"
import { buildIdentification, identificationOf } from "./identificationCard"

describe("identification card", () => {
  it("rebuilds the template sample from its academic context", () => {
    const data = buildIdentification(
      {
        career: { name: "Software", faculty: "Ciencias Administrativas, Gestión Empresarial e Informática" },
        subject: {
          name: "Asignatura de ejemplo",
          code: "SW-P7-037",
          cycle: 7,
          organization_unit: "Unidad profesional",
          prerequisites: ["SW-P6-032"],
          corequisites: [],
          hours_ac: 32,
          hours_pae: 16,
          hours_aa: 48,
          total_hours: 96,
          credits: 2,
        },
        scheduled_subject: { period: "Marzo – Julio 2026", campus: "Matriz", modality: "Presencial", teaching_weeks: 16 },
      },
      ["A"],
      ["NOMBRE DEL DOCENTE"],
      ["docente@ueb.edu.ec"],
      { discapacidad_tiene: "No", formacion_experiencia: "Formación y experiencia en el área de la asignatura." },
    )
    expect({ ...data, shift: "Matutina" }).toEqual(IDENTIFICATION_SAMPLE)
    expect(Object.keys(data)).toEqual(Object.keys(IDENTIFICATION_SAMPLE))
  })

  it("takes every value from the academic context", () => {
    const data = buildIdentification(
      {
        career: { name: "Software", faculty: "FCAGEI" },
        subject: {
          name: "Inteligencia Artificial",
          code: "SW-P7-037",
          cycle: 7,
          organization_unit: "Unidad Profesional",
          prerequisites: ["SW-P6-032"],
          corequisites: [],
          hours_ac: "32",
          hours_pae: "16",
          hours_aa: "48",
          total_hours: 96,
          credits: "2",
        },
        scheduled_subject: { period: "Marzo – Julio 2026", campus: "Matriz", modality: "Presencial" },
      },
      ["A", "B"],
      ["PAUL GUARANGA"],
      ["paul.guaranga@ueb.edu.ec"],
      { discapacidad_tiene: "Sí", discapacidad_tipo: "Visual", formacion_experiencia: "Ingeniera en Sistemas" },
    )
    expect(data.faculty).toBe("FCAGEI")
    expect(data.cycle).toBe("Séptimo")
    expect(data.parallel).toBe("A, B")
    expect(data.prerequisites).toBe("SW-P6-032")
    expect(data.corequisites).toBe("Ninguno")
    expect(data.total_hours).toBe("96")
    expect(data.shift).toBe("")
    expect(data.disability).toBe("si")
    expect(data.formation).toBe("Ingeniera en Sistemas")
  })

  it("reads historical contexts that used the offering key", () => {
    const data = buildIdentification(
      {
        career: { name: "Software", faculty: "FCAGEI" },
        subject: { name: "Programación", code: "SW-101", cycle: 1 },
        offering: { period: "Noviembre 2025 – Marzo 2026", campus: "Matriz", modality: "Presencial" },
      },
      ["A"],
      ["DOCENTE"],
      ["docente@ueb.edu.ec"],
    )
    expect(data.period).toBe("Noviembre 2025 – Marzo 2026")
    expect(data.campus).toBe("Matriz")
    expect(data.disability).toBe("no")
  })

  it("builds the card of a syllabus from its snapshot, live parallel, current teachers and the formation field", () => {
    const data = identificationOf({
      context: { subject: { name: "Redes", hours_ac: "48.50", cycle: "11" }, parallel: { code: "B" } },
      parallelCode: "A",
      parallelShift: "vespertina",
      teachers: [
        { name: "Ana", email: "ana@ueb.edu.ec" },
        { name: "Ana", email: "ana@ueb.edu.ec" },
        { name: "Luis", email: "luis@ueb.edu.ec" },
      ],
      formation: "Magíster\n\nDoctor",
    })
    expect(data.parallel).toBe("B")
    expect(data.shift).toBe("Vespertina")
    expect(data.teacher).toBe("Ana, Luis")
    expect(data.email).toBe("ana@ueb.edu.ec, luis@ueb.edu.ec")
    expect(data.formation).toBe("Magíster\n\nDoctor")
    expect(data.hours_ac).toBe("48.5")
    expect(data.cycle).toBe("11")
    expect(data.prerequisites).toBe("Ninguno")
  })
})
