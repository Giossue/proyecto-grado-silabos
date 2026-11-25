// @vitest-environment node
import { asc, sql, type SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { silabos } from "@/db/schema"
import { historyOrder, reviewOrder } from "./coordinationReviewQueries"

const dialect = new PgDialect()
const render = (terms: SQL[]): string => dialect.sqlToQuery(sql.join(terms, sql`, `)).sql

const PERIOD_END = sql`(select pa.fecha_fin_periodo from convocatorias_carreras as cc
                inner join convocatorias_universidad as cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
                inner join periodos_academicos as pa on pa.periodo_academico_id = cu.periodo_academico_id
                where cc.convocatoria_carrera_id = silabos.convocatoria_carrera_id) desc`

describe("coordination list order", () => {
  it("keeps today's ORDER BY when no column is chosen", () => {
    expect(render(reviewOrder(null))).toBe(render([sql`${silabos.guardadoEn} desc nulls last`]))
    expect(render(historyOrder(null))).toBe(
      render([PERIOD_END, sql`${silabos.datosAcademicosSilabo}->'subject'->>'name'`, sql`${silabos.datosAcademicosSilabo}->'parallel'->>'code'`, asc(silabos.silaboId)]),
    )
  })

  it("puts the chosen column first with nulls last and keeps the default keys as tie-breakers", () => {
    const review = render(reviewOrder({ column: "submitted", direction: "desc" }))
    expect(review).toMatch(/^\(select revisiones_silabo\.enviado_en from revisiones_silabo[\s\S]* desc nulls last, "silabos"\."guardado_en" desc nulls last, "silabos"\."silabo_id" asc$/)
    expect(render(reviewOrder({ column: "teacher", direction: "asc" }))).toMatch(/min\(usuario_docente\.nombre_usuario\)[\s\S]* asc nulls last, /)
  })

  it("always groups the history by period end before the chosen column", () => {
    const history = render(historyOrder({ column: "approved", direction: "asc" }))
    expect(history.startsWith(render([PERIOD_END]))).toBe(true)
    expect(history).toMatch(/aprobaciones\.aprobado_en[\s\S]* asc nulls last, "silabos"\."datos_academicos_silabo"->'subject'->>'name', [\s\S]*"silabos"\."silabo_id" asc$/)
  })
})
