// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/ficha-golden.json"
import { parts } from "../excel/testing"
import { phpShape } from "../configuration/phpValues"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { createFichaWorkbook, fichaFingerprint, readFichaWorkbook, type FichaDefinition } from "./fichaWorkbook"

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name))
const definition = golden.definition as unknown as FichaDefinition
const cases = golden.cases as Record<string, { subjects?: unknown; errors?: Record<string, string[]> }>

const masked = (xml: string) => xml.replace(/([pP]assword)="[0-9A-F]+"/g, '$1="X"')

function outcome(bytes: Buffer): unknown {
  try {
    return { subjects: JSON.parse(JSON.stringify(phpShape(readFichaWorkbook(bytes, definition)))) }
  } catch (error) {
    if (error instanceof TemplateValidationError) return { errors: error.errors }
    throw error
  }
}

describe("fichaWorkbook (FichaWorkbook of Laravel)", () => {
  it("computes the same fingerprint as FichaWorkbookDefinition", () => {
    expect(fichaFingerprint(definition)).toBe(golden.definition.fingerprint)
  })

  it("writes the same parts as Laravel, except the random sheet and workbook passwords and the dates", async () => {
    const mine = await parts(await createFichaWorkbook(definition, { now: 1_795_000_000 }))
    const theirs = await parts(fixture("ficha-template.xlsx"))
    expect([...mine.keys()].sort()).toEqual([...theirs.keys()].sort())
    for (const [name, xml] of theirs) expect(masked(mine.get(name) ?? ""), name).toBe(masked(xml))
  })

  it("writes a different random password for every protected sheet and the workbook", async () => {
    const files = await parts(await createFichaWorkbook(definition, { now: 1_795_000_000, passwordHash: (() => {
      let next = 0
      return () => (++next).toString(16).toUpperCase()
    })() }))
    expect(files.get("xl/workbook.xml")).toContain('workbookPassword="')
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<sheetProtection password="X" sheet="1"/>')
    expect(files.get("xl/worksheets/sheet2.xml")).not.toContain("sheetProtection")
  })

  it.each(Object.keys(cases))("reads %s exactly like Laravel", (name) => {
    expect(outcome(fixture(`reader/${name}.xlsx`))).toEqual(cases[name])
  })

  it("reads back its own template as an empty workbook", async () => {
    const bytes = await createFichaWorkbook(definition, { now: 1_795_000_000 })
    expect(outcome(bytes)).toEqual(cases.empty)
  })
})
