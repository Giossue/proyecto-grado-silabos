// @vitest-environment node
import { describe, expect, it } from "vitest"
import { libraryOrder } from "./reviewQueries"

describe("library list order", () => {
  it("keeps today's ORDER BY when no column is chosen", () => {
    const order = libraryOrder(null)
    expect(order.text).toBe("revision.enviado_en desc")
    expect(order.values).toEqual([])
  })

  it("puts the chosen column first with nulls last and keeps the send date and id as tie-breakers", () => {
    expect(libraryOrder({ column: "signed", direction: "desc" }).text).toBe(
      "(select usuario_orden.nombre_usuario from usuarios as usuario_orden where usuario_orden.usuario_id = envios_biblioteca.verificado_por) desc nulls last, " +
        "revision.enviado_en desc, envios_biblioteca.envio_biblioteca_id asc",
    )
  })

  it("sorts the state by the label shown in the table", () => {
    const { text, values } = libraryOrder({ column: "state", direction: "asc" })
    expect(values).toEqual(["Anterior", "sin_iniciar", "Sin iniciar", "borrador", "Borrador", "en_revision", "En revisión", "correccion_solicitada", "Corrección solicitada", "aprobado", "Aprobado"])
    expect(text).toContain("silabo.estado_silabo")
    expect(text).toMatch(/ asc nulls last, revision\.enviado_en desc, envios_biblioteca\.envio_biblioteca_id asc$/)
  })
})
