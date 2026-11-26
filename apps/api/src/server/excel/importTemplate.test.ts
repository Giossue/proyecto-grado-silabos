// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { importTemplate } from "./importTemplate"
import { legacyPasswordHash } from "./phpSpreadsheetXlsx"
import { parts, readBook } from "./testing"

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name))

// Frozen input that produced laravel-plantilla-malla.xlsx with PhpSpreadsheet. It pins the generic
// writer to Laravel's bytes; the columns the app offers today are tested in structureImports.test.ts.
const LARAVEL_CURRICULUM = [
  "Código",
  "Nombre de la materia",
  "Ciclo",
  "Unidad de organización",
  "Modalidad",
  "Genera sílabo",
  "Horas ACD",
  "Horas APE",
  "Horas AA",
  "Créditos",
  "Prerrequisitos (códigos)",
  "Correquisitos (códigos)",
]
const LARAVEL_CURRICULUM_NOTES = [
  "Una fila por materia; no deje filas vacías entre registros.",
  "Código: único en la malla, por ejemplo SW-B1-001.",
  "Ciclo: un número entre 1 y el número de ciclos de la carrera.",
  "Unidad de organización y Modalidad: elija una opción de la lista (la modalidad es opcional).",
  "Genera sílabo: Sí o No. Si la materia no lleva sílabo, elija No; si la deja vacía se toma Sí.",
  "Horas y créditos: números; las horas totales se calculan solas.",
  "Prerrequisitos (de un ciclo anterior) y correquisitos (del mismo ciclo): códigos separados por coma; pueden ser materias de la malla o del mismo archivo.",
]
const TEACHER_NOTES = [
  "Una fila por docente; no deje filas vacías entre registros.",
  "Todas las columnas son obligatorias: nombres, apellidos y correo.",
  "Escriba todos los nombres en «Nombres» y todos los apellidos en «Apellidos», solo con letras, espacios, apóstrofo o guion.",
  "Correo: use el correo institucional; si la cuenta ya existe, se incorpora a su carrera sin cambiar su nombre.",
]

function unlocked(files: Map<string, string>, reference: string): boolean {
  const cell = new RegExp(`<c r="${reference}"(?: s="(\\d+)")?`).exec(files.get("xl/worksheets/sheet1.xml") ?? "")
  const xfs = /<cellXfs[^>]*>(.*)<\/cellXfs>/.exec(files.get("xl/styles.xml") ?? "")?.[1].match(/<xf\b.*?(?:\/>|<\/xf>)/g) ?? []
  return cell !== null && (xfs[Number(cell[1] ?? 0)] ?? "").includes('<protection locked="false"/>')
}

const curriculum = () =>
  importTemplate(
    LARAVEL_CURRICULUM,
    [
      { column: 3, options: ["Unidad básica", "Unidad profesional", "Unidad de integración curricular"] },
      { column: 4, options: ["Presencial", "Semipresencial", "En línea", "A distancia", "Híbrida"] },
      { column: 5, options: ["Sí", "No"] },
    ],
    LARAVEL_CURRICULUM_NOTES,
    { now: 1_795_000_000 },
  )

describe("importTemplate (PhpSpreadsheet workbook of SpreadsheetTemplate)", () => {
  it("writes the same parts as Laravel, except the random sheet passwords and the dates", async () => {
    expect(await parts(await curriculum())).toEqual(await parts(fixture("laravel-plantilla-malla.xlsx")))
    const teachers = await importTemplate(["Nombres", "Apellidos", "Correo"], [], TEACHER_NOTES, { now: 1_795_000_000 })
    expect(await parts(teachers)).toEqual(await parts(fixture("laravel-plantilla-docentes.xlsx")))
  })

  it("hashes sheet passwords with the legacy Excel algorithm", () => {
    expect(legacyPasswordHash("")).toBe("CE4B")
    expect(legacyPasswordHash("abcdefghij")).toBe("FEF1")
  })

  it("locks everything but the data rows and offers only Sí or No for the syllabus", async () => {
    const bytes = await curriculum()
    const files = await parts(bytes)
    const book = await readBook(bytes)
    const sheet = book.getWorksheet("Datos")!
    const lists = book.getWorksheet("Listas")!
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<sheetProtection password="X" sheet="1"/>')
    expect(files.get("xl/worksheets/sheet2.xml")).toContain('<sheetProtection password="X" sheet="1"/>')
    expect(lists.state).toBe("hidden")
    expect(sheet.getCell("A1").value).toBe("Código")
    expect(sheet.getCell("F1").value).toBe("Genera sílabo")
    expect(["A1", "N2", "A2", "L501", "A502"].map((reference) => unlocked(files, reference))).toEqual([false, false, true, true, false])
    expect(sheet.getCell("F2").dataValidation).toMatchObject({ type: "list", formulae: ["Listas!$F$1:$F$2"], showErrorMessage: true })
    expect(sheet.getCell("F501").dataValidation).toMatchObject({ type: "list" })
    expect(sheet.getCell("A2").dataValidation).toBeUndefined()
    expect([lists.getCell("F1").value, lists.getCell("F2").value, lists.getCell("F3").value]).toEqual(["Sí", "No", null])
    expect(String(sheet.getCell("N2").value)).toContain("Genera sílabo")
    expect(sheet.getColumn(2).width).toBe(24)
    expect(sheet.getColumn(14).width).toBe(70)
  })
})
