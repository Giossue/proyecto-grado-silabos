import { drizzle } from "drizzle-orm/node-postgres"
import { describe, expect, it } from "vitest"
import * as schema from "@/db/schema"
import { accountTx } from "./accountStore"

function recordingDatabase(rows: unknown[][] = []) {
  const statements: string[] = []
  const client = {
    query: async (query: { text: string } | string) => {
      statements.push(typeof query === "string" ? query : query.text)
      return { rows, rowCount: rows.length, fields: [] }
    },
  }
  return { db: drizzle({ client: client as never, schema }), statements }
}

describe("accountTx", () => {
  it("locks only the coordinator assignment and requires an active user", async () => {
    const { db, statements } = recordingDatabase()
    expect(await accountTx(db).lockCurrentCoordinator("01a1c5ba-10b4-7129-925f-c28a9489323c", "01a1c5ba-10b4-7129-925f-c28a9489323d")).toBeNull()
    expect(statements[0]).toContain('inner join "usuarios" on ("usuarios"."usuario_id" = "asignaciones_rol"."usuario_id" and "usuarios"."usuario_activo" = $1)')
    expect(statements[0]).toContain('"asignaciones_rol"."rol" = $')
    expect(statements[0]).toMatch(/limit \$\d+ for update of "asignaciones_rol"$/)
  })

  it("matches a missing career with is null", async () => {
    const { db, statements } = recordingDatabase()
    await accountTx(db).findGrant("01a1c5ba-10b4-7129-925f-c28a9489323c", "administrador", null, true)
    expect(statements[0]).toContain('"asignaciones_rol"."carrera_id" is null')
    expect(statements[0]).toContain('order by "asignaciones_rol"."asignacion_rol_activa" desc')
  })

  it("labels the coordinations it locks without locking the careers", async () => {
    const { db, statements } = recordingDatabase([["01a1c5ba-10b4-7129-925f-c28a9489323c", null, null]])
    expect(await accountTx(db).lockEffectiveCoordinations("01a1c5ba-10b4-7129-925f-c28a9489323d")).toEqual([{ id: "01a1c5ba-10b4-7129-925f-c28a9489323c", label: "" }])
    expect(statements[0]).toContain('left join "carreras"')
    expect(statements[0]).toMatch(/for update of "asignaciones_rol"$/)
  })
})
