import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { assistantStoreOn, assistantTx, joinMessageContent, splitMessageContent } from "./assistantStore"

const TEMPLATE = "01a1c5ba-0000-7000-8000-000000000001"
const USER = "01a1c5ba-0000-7000-8000-000000000002"
const MESSAGE = "01a1c5ba-0000-7000-8000-000000000003"

function recordingDatabase(rows: unknown[] = []) {
  const statements: Prisma.Sql[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, values: unknown[]) => {
    statements.push(query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values))
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), rows),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), 1),
  } as unknown as Db
  return { db, statements }
}

const QUESTION = { rol: "usuario", estado: "completado", entrada: { contenido: "Hola", clave_idempotencia: "key-1" } }

const ANSWER = {
  rol: "asistente",
  estado: "fallido",
  entrada: { respuesta_a_id: MESSAGE, borrador: null, version_borrador: "v1" },
  contenido: "",
  resultado: "fallido",
  mensaje_error: "No se pudo",
  codigo_error: "asistente_fallido",
  completado_en: "2026-11-11T15:16:42+00:00",
}

describe("assistant message state lives in columns", () => {
  it("splits the role, state, error code, completion time and idempotency key out of the JSON", () => {
    expect(splitMessageContent(QUESTION)).toEqual({
      columns: { role: "usuario", state: "completado", errorCode: null, completedAt: null, idempotencyKey: "key-1" },
      content: { entrada: { contenido: "Hola" } },
    })
    expect(splitMessageContent(ANSWER)).toEqual({
      columns: { role: "asistente", state: "fallido", errorCode: "asistente_fallido", completedAt: "2026-11-11T15:16:42+00:00", idempotencyKey: null },
      content: { entrada: { respuesta_a_id: MESSAGE, borrador: null, version_borrador: "v1" }, contenido: "", resultado: "fallido", mensaje_error: "No se pudo" },
    })
  })

  it("joins the columns back into the same message content", () => {
    for (const message of [QUESTION, ANSWER]) {
      const { columns, content } = splitMessageContent(message)
      expect(joinMessageContent(content, columns)).toEqual(message)
    }
  })

  it("inserts the state into columns and only the content into the JSON", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).insertMessage({ id: MESSAGE, templateId: TEMPLATE, userId: USER, content: QUESTION })
    expect(statements[0].text).toContain("contenido_mensaje, rol, estado, codigo_error, completado_en, clave_idempotencia")
    expect(statements[0].values).toEqual([MESSAGE, TEMPLATE, USER, JSON.stringify({ entrada: { contenido: "Hola" } }), "usuario", "completado", null, "key-1"])
  })

  it("updates the columns and casts the completion time", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).updateMessage(MESSAGE, ANSWER)
    expect(statements[0].text).toContain("rol = $2, estado = $3")
    expect(statements[0].text).toContain("completado_en = $5::timestamptz")
    expect(statements[0].values.slice(1)).toEqual(["asistente", "fallido", "asistente_fallido", "2026-11-11T15:16:42+00:00", null, MESSAGE])
    expect(String(statements[0].values[0])).not.toContain("estado")
  })

  it("finds questions by the idempotency column and open conversations by the state column", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).questionByKey(TEMPLATE, USER, "key-1")
    await assistantTx(db).conversationBusy(TEMPLATE, USER)
    expect(statements[0].text).toContain("m.rol = 'usuario' and m.clave_idempotencia = $3")
    expect(statements[1].text).toContain("m.estado = any($3::text[])")
    expect(statements.map((statement) => statement.text).join(" ")).not.toContain("contenido_mensaje ->> 'estado'")
  })

  it("reads stored rows back as the full message content", async () => {
    const row = {
      id: MESSAGE,
      templateId: TEMPLATE,
      userId: USER,
      content: JSON.stringify({ entrada: { contenido: "Hola" } }),
      role: "usuario",
      state: "completado",
      errorCode: null,
      completedAt: null,
      idempotencyKey: "key-1",
      sentAt: "2026-11-11T11:14:17+00:00",
      hiddenAt: null,
    }
    const { db } = recordingDatabase([row])
    expect(await assistantStoreOn(db, async () => null as never).message(MESSAGE)).toEqual({
      id: MESSAGE,
      templateId: TEMPLATE,
      userId: USER,
      content: QUESTION,
      sentAt: "2026-11-11T11:14:17+00:00",
      hiddenAt: null,
    })
  })
})
