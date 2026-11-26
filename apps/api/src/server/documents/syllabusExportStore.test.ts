import { describe, expect, it } from "vitest"
import type { Prisma } from "../../generated/prisma/client"
import { fakeDb } from "../shared/testing"
import { exportJobStoreOn, exportJobTxOn, exportRequestTxOn } from "./syllabusExportStore"

const ID = "0195e7a0-0000-7000-8000-000000000001"
const compact = (query: Prisma.Sql) => query.text.replace(/\s+/g, " ")

describe("export request locks", () => {
  it("locks the syllabus row, then the revision row, and dispatches only after commit", async () => {
    const { db, queries } = fakeDb((query) => (query.text.includes('from "revisiones_silabo"') ? [{ syllabusId: ID, number: 2 }] : [{ silabo_id: ID }]))
    const callbacks: Array<() => unknown> = []
    const dispatched: string[] = []
    const tx = exportRequestTxOn(db, (callback) => void callbacks.push(callback), (id) => dispatched.push(id))
    expect(await tx.lockSyllabus(ID)).toBe(true)
    expect(await tx.lockRevision(ID)).toEqual({ syllabusId: ID, number: 2 })
    expect(compact(queries[0])).toMatch(/limit 1 for update of "silabos"$/)
    expect(compact(queries[1])).toMatch(/limit 1 for update of "revisiones_silabo"$/)
    tx.dispatchExport(ID)
    expect(dispatched).toEqual([])
    for (const callback of callbacks) await callback()
    expect(dispatched).toEqual([ID])
  })
})

describe("export job locks", () => {
  it("locks the artifact row for update before reading its owner", async () => {
    const { db, queries } = fakeDb((query) => (query.text.includes("for update") ? [{ state: "pendiente" }] : [{ syllabusId: ID, number: 3 }]))
    const tx = exportJobTxOn(db, () => undefined, 1767225600)
    expect(await tx.lockArtifact(ID)).toEqual({ state: "pendiente", syllabusId: ID, revisionNumber: 3 })
    expect(compact(queries[0])).toMatch(/from "exportaciones_silabo" where "exportaciones_silabo"\."exportacion_silabo_id" = \$1::uuid limit 1 for update$/)
    expect(compact(queries[1])).not.toMatch(/for update/)
  })

  it("creates a stored object once and falls back to the existing row on conflict", async () => {
    const { db, queries } = fakeDb((query) => (query.text.includes("insert into") ? [] : queries.length > 2 ? [{ id: ID, mime: "application/pdf", size: 5n, fingerprint: "ab  " }] : []))
    const created = await exportJobStoreOn(db).firstOrCreateObject({
      id: ID,
      disk: "private",
      path: "exports/a.pdf",
      name: "a.pdf",
      mime: "application/pdf",
      size: 5,
      fingerprint: "ab",
      classification: "syllabus_export",
      ownerId: ID,
      storedAt: 1767225600,
    })
    expect(created).toEqual({ id: ID, mime: "application/pdf", size: 5, fingerprint: "ab" })
    expect(compact(queries[1])).toMatch(/on conflict \("disco", "ruta_archivo"\) do nothing returning /)
    expect(queries).toHaveLength(3)
  })
})
