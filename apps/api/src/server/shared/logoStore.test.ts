import { describe, expect, it } from "vitest"
import { fakeDb } from "./testing"
import { createLogoStore } from "./logoStore"

const FACULTY = "0195e7a0-0000-7000-8000-000000000001"

describe("createLogoStore", () => {
  it("reads the faculty and its logo file", async () => {
    const { db, queries } = fakeDb(() => [{ id: FACULTY, has_logo: true, disk: "public", path: "logos/f.png", classification: "logo" }])
    expect(await createLogoStore(db).faculty(FACULTY)).toEqual({ id: FACULTY, logo: { disk: "public", path: "logos/f.png", classification: "logo" } })
    expect(queries[0].text).toMatch(/from facultades left join archivos on archivos\.archivo_id = facultades\.logo_archivo_id\s+where facultades\.facultad_id = \$1::uuid limit 1$/)
    expect(queries[0].values).toEqual([FACULTY])
  })

  it("reports a faculty without logo and an unknown faculty", async () => {
    expect(await createLogoStore(fakeDb(() => [{ id: FACULTY, has_logo: false, disk: null, path: null, classification: null }]).db).faculty(FACULTY)).toEqual({
      id: FACULTY,
      logo: null,
    })
    expect(await createLogoStore(fakeDb(() => []).db).faculty(FACULTY)).toBeNull()
  })

  it("falls back to the private disk when the file has none", async () => {
    const { db } = fakeDb(() => [{ id: FACULTY, has_logo: true, disk: null, path: "x", classification: null }])
    expect(await createLogoStore(db).faculty(FACULTY)).toEqual({ id: FACULTY, logo: { disk: "private", path: "x", classification: null } })
  })
})
