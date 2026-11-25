// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

const ROOTS = [join(process.cwd(), "src", "server"), join(process.cwd(), "src", "modules")]
const AUDIT = /eventos_auditoria|recordAudit|insertAuditEvent|AuditEventInput|auditLabels|admin\/auditoria|admin\/reportes/

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === "__fixtures__" ? [] : sources(path)
    return /\.(ts|json)$/.test(entry.name) && !entry.name.includes(".test.") && entry.name !== "routeTable.json" ? [path] : []
  })
}

describe("Auditoría and Reportes are gone from the server", () => {
  it("never reads or writes eventos_auditoria nor points a screen at Auditoría or Reportes", () => {
    const found = ROOTS.flatMap(sources)
      .filter((file) => AUDIT.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"))
    expect(found).toEqual([])
  })

  it("has no audit or report handlers left", () => {
    const removed = [
      "src/server/operations/recordAuditEvent.ts",
      "src/server/operations/auditEvents.ts",
      "src/server/operations/auditEventQueries.ts",
      "src/server/operations/auditLabels.json",
      "src/server/syllabus/processReport.ts",
      "src/server/syllabus/processReportQueries.ts",
      "src/server/excel/reportWorkbooks.ts",
      "src/app/api/v1/admin/audit-events",
      "src/app/api/v1/admin/reports",
    ]
    expect(removed.filter((path) => existsSync(join(process.cwd(), path)))).toEqual([])
  })
})
