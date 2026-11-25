// @vitest-environment node
import { desc, sql, type SQL } from "drizzle-orm"
import { alias, PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { revisionesSilabo } from "@/db/schema"
import { libraryOrder } from "./reviewQueries"

const dialect = new PgDialect()
const render = (terms: SQL[]) => dialect.sqlToQuery(sql.join(terms, sql`, `))

describe("library list order", () => {
  it("keeps today's ORDER BY when no column is chosen", () => {
    expect(render(libraryOrder(null))).toEqual(render([desc(alias(revisionesSilabo, "revision").enviadoEn)]))
  })

  it("puts the chosen column first with nulls last and keeps the send date and id as tie-breakers", () => {
    expect(render(libraryOrder({ column: "signed", direction: "desc" })).sql).toBe(
      '(select usuario_orden.nombre_usuario from usuarios as usuario_orden where usuario_orden.usuario_id = envios_biblioteca.verificado_por) desc nulls last, ' +
        '"revision"."enviado_en" desc, "envios_biblioteca"."envio_biblioteca_id" asc',
    )
  })

  it("sorts the state by the label shown in the table", () => {
    const { sql: text, params } = render(libraryOrder({ column: "state", direction: "asc" }))
    expect(params).toEqual(["pendiente", "En revisión", "firmado", "Aprobado", "devuelto", "Corrección solicitada", "reemplazado", "Anterior"])
    expect(text).toMatch(/ asc nulls last, "revision"\."enviado_en" desc, "envios_biblioteca"\."envio_biblioteca_id" asc$/)
  })
})
