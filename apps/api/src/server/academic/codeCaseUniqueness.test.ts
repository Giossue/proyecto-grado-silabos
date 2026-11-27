// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Addresses carry codes in lowercase, so two codes that only differ in case would share one address.
describe("codes are unique whatever their case", () => {
  it.each([
    ["governanceWriteStore.ts", "lower(carreras.codigo_carrera) = lower("],
    ["mallaWriteStore.ts", "lower(mallas.codigo_malla) = lower("],
    ["careerWriteStore.ts", "lower(asignaturas.codigo_asignatura) = lower("],
  ])("%s compares them in lowercase", (file, comparison) => {
    expect(readFileSync(join(process.cwd(), "src", "server", "academic", file), "utf8")).toContain(comparison)
  })
})
