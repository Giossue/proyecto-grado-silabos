// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/block-golden.json"
import { defineBlock } from "./blockDefinition"
import { phpShape, record, type PhpRecord } from "./phpValues"
import { blockDesigns, buildTable, designWithKeys, readTable, tableKey } from "./repeatableTable"
import { initialValue, TemplateValidationError } from "./templateRuntime"
import { goldenTemplate } from "./testing"

type Change = { path: string[]; value?: unknown; delete?: boolean }
type Case = { op: string; kind?: string; set?: Change[]; novars?: boolean; text?: string; design?: PhpRecord; expected: string }

const blocks = golden.blocks as unknown as Record<string, PhpRecord>

function mutated(block: PhpRecord, changes: Change[]): PhpRecord {
  const copy = structuredClone(block)
  for (const change of changes) {
    let target: PhpRecord = copy
    for (const segment of change.path.slice(0, -1)) {
      if (typeof target[segment] !== "object" || target[segment] === null) target[segment] = {}
      target = target[segment] as PhpRecord
    }
    const last = change.path[change.path.length - 1]
    if (change.delete) delete target[last]
    else target[last] = structuredClone(change.value)
  }
  return copy
}

function run(item: Case): unknown {
  const variables = item.novars ? [] : golden.variables
  if (item.op === "define") return defineBlock(item.kind!, mutated(blocks[item.kind!], item.set ?? []), variables)
  if (item.op === "read") return readTable(item.kind!, defineBlock(item.kind!, blocks[item.kind!], variables), variables)
  if (item.op === "key") return tableKey(item.text!, "columna", [])
  const design = designWithKeys(structuredClone(item.design!))
  const block = defineBlock(String(design.kind), buildTable(design), variables)
  return { kind: design.kind, definition: block, design: readTable(String(design.kind), block, variables).design ?? design, initial: initialValue(block.value, {}) }
}

function outcome(item: Case): string {
  try {
    return JSON.stringify(phpShape({ ok: run(item) }))
  } catch (error) {
    if (error instanceof TemplateValidationError) return JSON.stringify({ errors: error.errors })
    throw error
  }
}

describe("block definitions and repeatable tables", () => {
  it("define, read, key and build every golden case exactly as the Laravel classes", () => {
    const cases = golden.cases as unknown as Case[]
    const mismatches = cases.filter((item) => outcome(item) !== JSON.stringify(JSON.parse(item.expected))).map((item) => ({ op: item.op, kind: item.kind, set: item.set, text: item.text }))
    expect(mismatches).toEqual([])
    expect(cases.length).toBeGreaterThan(350)
  })

  it("writes plain designer headers, which take the document header colour, and still reads the old styled ones", () => {
    const variables = golden.variables
    const design = designWithKeys({ label: "Prácticas", item: "práctica", min: 1, max: 5, initial: 1, columns: [{ title: "Tema", type: "text", max_length: 1000, multiline: false, width: 120, required: true }] })
    const built = buildTable(design)
    const block = defineBlock(String(design.kind), built, variables)
    const header = (block.layout as PhpRecord[])[0].content as PhpRecord[]
    const cell = (header[0].content as PhpRecord[])[0]
    const styled = defineBlock(String(design.kind), { ...built, layout: (built.layout as string[]).map((line) => line.replace("<th ", '<th style="background:#C3D4EA;font-weight:bold" ')) }, variables)

    expect(built.layout).toEqual(["<table>", '<tr><th data-width="120">Tema</th></tr>', `<tr data-repeat='{"value":"filas"}'><td data-width="120"><span data-slot='{"value":"tema"}'></span></td></tr>`, "</table>"])
    expect(cell.type).toBe("tableHeader")
    expect(record(cell.attrs).backgroundColor ?? null).toBeNull()
    expect(record(cell.attrs).bold ?? null).toBeNull()
    expect(record((((styled.layout as PhpRecord[])[0].content as PhpRecord[])[0].content as PhpRecord[])[0].attrs).backgroundColor).toBe("#C3D4EA")
    expect(readTable(String(design.kind), block, variables).design).not.toBeNull()
    expect(readTable(String(design.kind), styled, variables).design).not.toBeNull()
  })

  it("presents the designs of the official template blocks like TemplatePresentation::blockDesigns", () => {
    expect(JSON.stringify(phpShape(blockDesigns(goldenTemplate().definition!)))).toBe(JSON.stringify(JSON.parse(golden.designs)))
  })
})
