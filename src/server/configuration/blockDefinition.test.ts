// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/block-golden.json"
import { phpJsonEncode } from "../http/phpJson"
import { defineBlock } from "./blockDefinition"
import { phpShape, type PhpRecord } from "./phpValues"
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
    return phpJsonEncode(phpShape({ ok: run(item) }))
  } catch (error) {
    if (error instanceof TemplateValidationError) return phpJsonEncode({ errors: error.errors })
    throw error
  }
}

describe("block definitions and repeatable tables", () => {
  it("define, read, key and build every golden case exactly as the Laravel classes", () => {
    const cases = golden.cases as unknown as Case[]
    const mismatches = cases.filter((item) => outcome(item) !== item.expected).map((item) => ({ op: item.op, kind: item.kind, set: item.set, text: item.text }))
    expect(mismatches).toEqual([])
    expect(cases.length).toBeGreaterThan(350)
  })

  it("presents the designs of the official template blocks like TemplatePresentation::blockDesigns", () => {
    expect(phpJsonEncode(phpShape(blockDesigns(goldenTemplate().definition!)))).toBe(golden.designs)
  })
})
