// @vitest-environment node
import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import { TRANSACTION_OPTIONS, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { createTeacherAssistantStore, teacherAssistantTx } from "./teacherAssistantStore"

const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const TEACHER = "d0000000-0000-4000-8000-000000000001"
const MESSAGE = "b0000000-0000-4000-8000-000000000001"
const FIELD = "f0000000-0000-4000-8000-000000000001"
const question = { id: MESSAGE, syllabusId: SYLLABUS, userId: TEACHER, role: "usuario" as const, state: "completado" as const, replyTo: null, content: {}, sentFields: [], proposals: [], errorCode: null, key: "k", createdAt: 0 }

function recordingDb(reply: (query: Prisma.Sql) => unknown[] = () => []) {
  const queries: Prisma.Sql[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    queries.push(sql)
    return sql
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => reply(record(query, ...values)),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, ...values), 1),
  }
  return { db: db as unknown as Db, queries }
}

const text = (query: Prisma.Sql) => query.text.replace(/\s+/g, " ").trim()
const target = (space: number | null) => ({ kind: space === null ? "campo" : "espacio", space, fieldKey: "descripcion", fieldLabel: "Descripción" })
const offer = (id: string, texto: string, space: number | null, extra: Record<string, unknown> = {}) => ({ id, campo_id: FIELD, destino: target(space), texto, fundamento: "Los datos.", ...extra })
const answerRow = (id: string, content: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, syllabusId: SYLLABUS, userId: TEACHER, role: "asistente", state: "completado", replyTo: MESSAGE, content: JSON.stringify(content), errorCode: null, key: null, createdAt: 10, ...extra,
})

describe("teacher assistant store", () => {
  it("reads conversations only by syllabus and teacher together, from the two AI tables", async () => {
    const { db, queries } = recordingDb()
    const store = createTeacherAssistantStore(db as PrismaService)
    const tx = teacherAssistantTx(db)

    await store.conversation(SYLLABUS, TEACHER, 100)
    await store.earlierTurns(question, 6)
    await tx.answerByKey(SYLLABUS, TEACHER, "k")
    await tx.openAnswer(SYLLABUS, TEACHER)

    expect(queries).toHaveLength(4)
    for (const query of queries) {
      expect(text(query)).toMatch(/s\.silabo_id = \$\d+::uuid and s\.usuario_id = \$\d+::uuid/)
      expect(text(query)).toContain("sesiones_ia s")
      expect(text(query)).toContain("mensajes_ia ")
      expect(query.values).toEqual(expect.arrayContaining([SYLLABUS, TEACHER]))
    }
  })

  it("takes a transaction lock for one teacher in one syllabus", async () => {
    const { db, queries } = recordingDb()

    await teacherAssistantTx(db).lockConversation(SYLLABUS, TEACHER)

    expect(text(queries[0])).toBe("select pg_advisory_xact_lock(hashtextextended($1, 0))")
    expect(queries[0].values).toEqual([`sesiones_ia:${SYLLABUS}:${TEACHER}`])
  })

  it("opens or reuses the session of that teacher in that syllabus when it stores a message", async () => {
    const { db, queries } = recordingDb()

    await teacherAssistantTx(db).insertMessage({ id: MESSAGE, syllabusId: SYLLABUS, userId: TEACHER, role: "usuario", state: "completado", replyTo: null, content: { texto: "Hola" }, key: "k" })

    expect(queries).toHaveLength(1)
    expect(text(queries[0])).toMatch(/^with sesion as \( insert into sesiones_ia \(sesion_ia_id, usuario_id, silabo_id\) .*on conflict \(usuario_id, silabo_id\) where cerrada_en is null do update .*returning sesion_ia_id\) insert into mensajes_ia /)
    expect(queries[0].values).toEqual([TEACHER, SYLLABUS, MESSAGE, null, "usuario", "completado", '{"texto":"Hola"}', "k"])
  })

  it("keeps the proposals and the sent fields inside the content of the answer, never of a question", async () => {
    const { db, queries } = recordingDb()
    const tx = teacherAssistantTx(db)

    await tx.updateAnswer(MESSAGE, {
      state: "completado",
      content: { texto: "Listo." },
      sentFields: [FIELD],
      proposals: [{ id: "e1", fieldId: FIELD, target: target(null) as never, text: "Estudia redes.", basis: "Los datos." }],
      errorCode: null,
      completedAt: 1_800_000_000,
    })
    await tx.lockMessage(MESSAGE)

    expect(text(queries[0])).toMatch(/^update mensajes_ia set .* where mensaje_ia_id = \$\d+::uuid and rol = 'asistente'$/)
    expect(JSON.parse(String(queries[0].values[1]))).toEqual({ texto: "Listo.", campos_enviados: [FIELD], propuestas: [offer("e1", "Estudia redes.", null)] })
    expect(queries[0].values.filter((_value, index) => index !== 1)).toEqual(["completado", null, 1_800_000_000, MESSAGE])
    expect(text(queries[1])).toMatch(/for update of m$/)
  })

  it("adds nothing to the content of an answer without proposals or sent fields", async () => {
    const { db, queries } = recordingDb()

    await teacherAssistantTx(db).updateAnswer(MESSAGE, { state: "fallido", content: { texto: "", error: "No" }, sentFields: [], proposals: [], errorCode: "x", completedAt: null })

    expect(JSON.parse(String(queries[0].values[1]))).toEqual({ texto: "", error: "No" })
  })

  it("reads a message with its proposals and sent fields apart from its text", async () => {
    const { db } = recordingDb(() => [answerRow("m1", { texto: "Listo.", campos_enviados: [FIELD], propuestas: [offer("e1", "Uno", null)] })])

    expect(await createTeacherAssistantStore(db as PrismaService).message("m1")).toMatchObject({
      content: { texto: "Listo." },
      sentFields: [FIELD],
      proposals: [{ id: "e1", fieldId: FIELD, text: "Uno", basis: "Los datos." }],
    })
  })

  it("shows a proposal as replaced only when a later answer proposes the same field and space", async () => {
    const newestFirst = [
      answerRow("m2", { texto: "Dos", propuestas: [offer("e5", "Nueva", null)] }),
      answerRow("m1", { texto: "Uno", propuestas: [offer("e1", "Vieja", null), offer("e2", "Espacio", 2), offer("e3", "Usada antes", null, { estado: "aceptada" }), offer("e4", "Repetida", null)] }),
    ]
    const { db } = recordingDb(() => newestFirst)

    const { messages, proposals } = await createTeacherAssistantStore(db as PrismaService).conversation(SYLLABUS, TEACHER, 100)

    expect(messages.map((message) => message.id)).toEqual(["m1", "m2"])
    expect(proposals.map((proposal) => [proposal.id, proposal.messageId, proposal.position, proposal.state])).toEqual([
      ["e1", "m1", 0, "reemplazada"],
      ["e2", "m1", 1, "pendiente"],
      ["e3", "m1", 2, "aceptada"],
      ["e4", "m1", 3, "reemplazada"],
      ["e5", "m2", 0, "pendiente"],
    ])
    expect(proposals[0]).toMatchObject({ syllabusId: SYLLABUS, userId: TEACHER, fieldId: FIELD, target: target(null) })
  })

  it("hands the model the earlier answers with their proposals and the fields that were sent", async () => {
    const { db } = recordingDb(() => [
      { ...answerRow("m2", { texto: "Segunda", propuestas: [offer("e2", "Nueva", null)] }), question: "Otra vez" },
      { ...answerRow("m1", { texto: "Primera", campos_enviados: [FIELD], propuestas: [offer("e1", "Vieja", null)] }), question: "Mejore" },
    ])

    expect(await createTeacherAssistantStore(db as PrismaService).earlierTurns(question, 6)).toEqual([
      { question: "Mejore", answer: "Primera", sentFields: [FIELD], proposals: [{ label: "Descripción", state: "reemplazada", text: "Vieja" }] },
      { question: "Otra vez", answer: "Segunda", sentFields: [], proposals: [{ label: "Descripción", state: "pendiente", text: "Nueva" }] },
    ])
  })

  it("runs its writes with the shared transaction options", async () => {
    const calls: unknown[] = []
    const { db } = recordingDb()
    const prisma = { $transaction: async (work: (tx: Db) => Promise<unknown>, options: unknown) => (calls.push(options), work(db)) } as unknown as PrismaService

    await createTeacherAssistantStore(prisma).transaction(async (tx) => tx.lockMessage(MESSAGE))

    expect(calls).toEqual([TRANSACTION_OPTIONS])
  })
})
