// @vitest-environment node
import { asc, sql, type SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { db } from "@/db"
import { usuarios } from "@/db/schema"
import { managedUserOrder } from "./managedUserQueries"

const dialect = new PgDialect()
const render = (terms: SQL[]) => dialect.sqlToQuery(sql.join(terms, sql`, `))

describe("managed user order", () => {
  it("keeps today's ORDER BY when no column is chosen", () => {
    expect(render(managedUserOrder(db, null))).toEqual(render([asc(usuarios.nombreUsuario)]))
  })

  it("sorts by name with nulls last and the id as tie-breaker", () => {
    expect(render(managedUserOrder(db, { column: "name", direction: "desc" })).sql).toBe(
      '"usuarios"."nombre_usuario" desc nulls last, "usuarios"."nombre_usuario" asc, "usuarios"."usuario_id" asc',
    )
  })

  it("sorts by the status label shown in the table", () => {
    const { sql: text, params } = render(managedUserOrder(db, { column: "status", direction: "asc" }))
    expect(params).toEqual(["Inactivo", "Pendiente", "Invitación vencida", "Activo"])
    expect(text).toMatch(/^case when "usuarios"\."usuario_activo" = false then \$1::text[\s\S]* asc nulls last, "usuarios"\."nombre_usuario" asc, "usuarios"\."usuario_id" asc$/)
  })
})
