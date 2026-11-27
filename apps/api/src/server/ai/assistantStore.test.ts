import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { assistantStoreOn, assistantTx, joinMessageContent, splitMessageContent } from "./assistantStore"

const TEMPLATE = "01a1c5ba-0000-7000-8000-000000000001"
const USER = "01a1c5ba-0000-7000-8000-000000000002"
const MESSAGE = "01a1c5ba-0000-7000-8000-000000000003"
const PROPOSAL = "01a1c5ba-0000-7000-8000-000000000004"
const FINGERPRINT = "a".repeat(64)

function recordingDatabase(rows: unknown[] | ((text: string) => unknown[]) = []) {
  const statements: Prisma.Sql[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    statements.push(sql)
    return sql
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
      const sql = record(query, values)
      return typeof rows === "function" ? rows(flat(sql)) : rows
    },
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, values), 1),
  } as unknown as Db
  return { db, statements }
}

const flat = (statement: Prisma.Sql) => statement.text.replace(/\s+/g, " ").trim()
const store = (db: Db) => assistantStoreOn(db, async () => null as never)

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
  it("splits the role, state, error code, completion time, idempotency key and answered question out of the JSON", () => {
    expect(splitMessageContent(QUESTION)).toEqual({
      columns: { role: "usuario", state: "completado", errorCode: null, completedAt: null, idempotencyKey: "key-1", replyTo: null },
      content: { entrada: { contenido: "Hola" } },
    })
    expect(splitMessageContent(ANSWER)).toEqual({
      columns: { role: "asistente", state: "fallido", errorCode: "asistente_fallido", completedAt: "2026-11-11T15:16:42+00:00", idempotencyKey: null, replyTo: MESSAGE },
      content: { entrada: { borrador: null, version_borrador: "v1" }, contenido: "", resultado: "fallido", mensaje_error: "No se pudo" },
    })
  })

  it("joins the columns back into the same message content", () => {
    for (const message of [QUESTION, ANSWER]) {
      const { columns, content } = splitMessageContent(message)
      expect(joinMessageContent(content, columns)).toEqual(message)
    }
  })

  it("opens or reuses the session of that person on the template and stores the message in it", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).insertMessage({ id: MESSAGE, templateId: TEMPLATE, userId: USER, content: QUESTION })
    expect(statements).toHaveLength(1)
    expect(flat(statements[0])).toMatch(/^with sesion as \( insert into sesiones_ia \(sesion_ia_id, usuario_id, plantilla_id\) .*on conflict \(usuario_id, plantilla_id\) where cerrada_en is null do update .*returning sesion_ia_id\) insert into mensajes_ia /)
    expect(statements[0].values).toEqual([USER, TEMPLATE, MESSAGE, null, "usuario", "completado", JSON.stringify({ entrada: { contenido: "Hola" } }), null, "key-1"])
  })

  it("updates the columns, casts the completion time and keeps a proposal the message already has", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).updateMessage(MESSAGE, ANSWER)
    expect(flat(statements[0])).toContain("|| case when contenido_mensaje -> 'propuesta' is null then '{}'::jsonb else jsonb_build_object('propuesta', contenido_mensaje -> 'propuesta') end")
    expect(flat(statements[0])).toContain("rol = $2, estado = $3")
    expect(flat(statements[0])).toContain("completado_en = $5::timestamptz")
    expect(statements[0].values.slice(1)).toEqual(["asistente", "fallido", "asistente_fallido", "2026-11-11T15:16:42+00:00", null, MESSAGE, MESSAGE])
    expect(String(statements[0].values[0])).not.toContain("estado")
  })

  it("finds questions by the key in any session, and answers by the question they reply to", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).questionByKey(TEMPLATE, USER, "key-1")
    await assistantTx(db).answerTo(MESSAGE)
    await assistantTx(db).conversationBusy(TEMPLATE, USER)
    expect(flat(statements[0])).toContain("s.plantilla_id = $1::uuid and s.usuario_id = $2::uuid and m.rol = 'usuario' and m.clave_idempotencia = $3")
    expect(flat(statements[0])).not.toContain("cerrada_en")
    expect(flat(statements[1])).toContain("m.respuesta_a_id = $1::uuid")
    expect(flat(statements[2])).toContain("s.cerrada_en is null and m.estado = any($3::text[])")
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
      replyTo: null,
      sentAt: "2026-11-11T11:14:17+00:00",
      hiddenAt: null,
    }
    const { db, statements } = recordingDatabase([row])
    expect(await store(db).message(MESSAGE)).toEqual({
      id: MESSAGE,
      templateId: TEMPLATE,
      userId: USER,
      content: QUESTION,
      sentAt: "2026-11-11T11:14:17+00:00",
      hiddenAt: null,
    })
    expect(flat(statements[0])).toContain("(m.contenido_mensaje - 'propuesta')")
    expect(flat(statements[0])).toContain("s.plantilla_id is not null")
  })
})

describe("assistant proposals live inside their answer", () => {
  const row = {
    id: PROPOSAL,
    templateId: TEMPLATE,
    messageId: MESSAGE,
    requestedBy: USER,
    structure: JSON.stringify({ sections: [] }),
    changes: JSON.stringify({ lista: ["Cambio"] }),
    fingerprint: FINGERPRINT,
    draftVersion: "v1",
    state: "pendiente",
    decidedBy: null,
    createdAt: "2026-11-11T11:14:17+00:00",
  }

  it("reads a proposal by its id only from conversations about the template, locking the answer", async () => {
    const { db, statements } = recordingDatabase([row])
    expect(await store(db).proposal(PROPOSAL)).toEqual({ ...row, structure: { sections: [] }, changes: { lista: ["Cambio"] } })
    await assistantTx(db).lockProposal(PROPOSAL)
    for (const statement of statements) {
      expect(flat(statement)).toContain("(m.contenido_mensaje -> 'propuesta') ->> 'id' = $1::uuid::text and s.plantilla_id is not null")
      expect(statement.values).toEqual([PROPOSAL])
    }
    expect(flat(statements[0])).not.toContain("for update")
    expect(flat(statements[1])).toMatch(/for update of m$/)
  })

  it("adds the proposal to the answer as pending", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).insertProposal({ id: PROPOSAL, templateId: TEMPLATE, messageId: MESSAGE, requestedBy: USER, structure: { sections: [] }, changes: { lista: ["Cambio"] }, fingerprint: FINGERPRINT, draftVersion: "v1" })
    expect(flat(statements[0])).toMatch(/^update mensajes_ia set contenido_mensaje = contenido_mensaje \|\| jsonb_build_object\('propuesta', .*'creada_en'.*\) where mensaje_ia_id = \$\d+::uuid$/)
    expect(JSON.parse(String(statements[0].values[0]))).toEqual({ id: PROPOSAL, estructura: { sections: [] }, cambios: { lista: ["Cambio"] }, huella_plantilla_base: FINGERPRINT, version_borrador: "v1", estado: "pendiente" })
    expect(statements[0].values.slice(1)).toEqual([MESSAGE])
  })

  it("writes who decided it and when inside the proposal", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).decideProposal(PROPOSAL, "aplicada", USER, 1_800_000_000)
    expect(flat(statements[0])).toContain("jsonb_build_object('estado', $1::text, 'decidida_por', $2::uuid, 'decidida_en',")
    expect(flat(statements[0])).toContain("where (contenido_mensaje -> 'propuesta') ->> 'id' = $4::uuid::text")
    expect(statements[0].values).toEqual(["aplicada", USER, 1_800_000_000, PROPOSAL])
  })

  it("replaces only the pending proposals of that person on the template", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).replacePendingProposals(TEMPLATE, USER)
    expect(flat(statements[0])).toContain(`jsonb_set(m.contenido_mensaje, '{propuesta,estado}', '"reemplazada"')`)
    expect(flat(statements[0])).toContain("s.plantilla_id = $1::uuid and s.usuario_id = $2::uuid and (m.contenido_mensaje -> 'propuesta') ->> 'estado' = 'pendiente'")
    expect(statements[0].values).toEqual([TEMPLATE, USER])
  })

  it("keeps the last proposal across new chats", async () => {
    const { db, statements } = recordingDatabase([row])
    expect((await store(db).lastProposal(TEMPLATE, USER))?.id).toBe(PROPOSAL)
    expect(flat(statements[0])).toContain("order by m.creado_en desc limit 1")
    expect(flat(statements[0])).not.toContain("cerrada_en")
  })

  it("starts a new chat by closing the open session, and shows only the open one", async () => {
    const { db, statements } = recordingDatabase()
    await assistantTx(db).hideConversation(TEMPLATE, USER, 1_800_000_000)
    await store(db).conversation(TEMPLATE, USER)
    expect(flat(statements[0])).toBe("update sesiones_ia set cerrada_en = to_timestamp($1) where plantilla_id = $2::uuid and usuario_id = $3::uuid and cerrada_en is null")
    expect(flat(statements[1])).toContain("s.plantilla_id = $1::uuid and s.usuario_id = $2::uuid and s.cerrada_en is null order by m.creado_en asc")
  })

  it("never touches the old tables of the template assistant", async () => {
    const { db, statements } = recordingDatabase()
    const tx = assistantTx(db)
    await tx.questionByKey(TEMPLATE, USER, "k")
    await tx.lockMessage(MESSAGE)
    await tx.replacePendingProposals(TEMPLATE, USER)
    await store(db).history({ id: MESSAGE, templateId: TEMPLATE, userId: USER, content: {}, sentAt: "", hiddenAt: null }, MESSAGE, 12)
    expect(statements.map(flat).join(" ")).not.toMatch(/mensajes_ia_plantilla|propuestas_ia_plantilla/)
  })
})
