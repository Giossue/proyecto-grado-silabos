// @vitest-environment node
import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import { TRANSACTION_OPTIONS, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { createTeacherAssistantStore, teacherAssistantTx } from "./teacherAssistantStore"

const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const TEACHER = "d0000000-0000-4000-8000-000000000001"
const MESSAGE = "b0000000-0000-4000-8000-000000000001"
const question = { id: MESSAGE, syllabusId: SYLLABUS, userId: TEACHER, role: "usuario" as const, state: "completado" as const, replyTo: null, content: {}, sentFields: [], errorCode: null, key: "k", createdAt: 0 }

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

describe("teacher assistant store", () => {
  it("reads and changes conversations only by syllabus and teacher together", async () => {
    const { db, queries } = recordingDb()
    const store = createTeacherAssistantStore(db as PrismaService)
    const tx = teacherAssistantTx(db)

    await store.conversation(SYLLABUS, TEACHER, 100)
    await store.earlierTurns(question, 6)
    await tx.answerByKey(SYLLABUS, TEACHER, "k")
    await tx.openAnswer(SYLLABUS, TEACHER)
    await tx.replacePendingProposals(SYLLABUS, TEACHER, [{ fieldId: MESSAGE, space: null }])

    expect(queries).toHaveLength(5)
    for (const query of queries) {
      expect(text(query)).toMatch(/silabo_id = \$\d+::uuid and \S*usuario_id = \$\d+::uuid/)
      expect(query.values).toEqual(expect.arrayContaining([SYLLABUS, TEACHER]))
    }
  })

  it("takes a transaction lock for one teacher in one syllabus", async () => {
    const { db, queries } = recordingDb()

    await teacherAssistantTx(db).lockConversation(SYLLABUS, TEACHER)

    expect(text(queries[0])).toBe("select pg_advisory_xact_lock(hashtextextended($1, 0))")
    expect(queries[0].values).toEqual([`mensajes_ia_docente:${SYLLABUS}:${TEACHER}`])
  })

  it("closes only answers, never questions, and locks the message it answers", async () => {
    const { db, queries } = recordingDb()
    const tx = teacherAssistantTx(db)

    await tx.updateAnswer(MESSAGE, { state: "completado", content: { texto: "Listo." }, sentFields: [SYLLABUS], errorCode: null, completedAt: 1_800_000_000 })
    await tx.lockMessage(MESSAGE)

    expect(text(queries[0])).toMatch(/^update mensajes_ia_docente set .* where mensaje_ia_docente_id = \$\d+::uuid and rol = 'asistente'$/)
    expect(queries[0].values).toEqual(["completado", '{"texto":"Listo."}', [SYLLABUS], null, 1_800_000_000, MESSAGE])
    expect(text(queries[1])).toMatch(/for update$/)
  })

  it("runs its writes with the shared transaction options", async () => {
    const calls: unknown[] = []
    const { db } = recordingDb()
    const prisma = { $transaction: async (work: (tx: Db) => Promise<unknown>, options: unknown) => (calls.push(options), work(db)) } as unknown as PrismaService

    await createTeacherAssistantStore(prisma).transaction(async (tx) => tx.lockMessage(MESSAGE))

    expect(calls).toEqual([TRANSACTION_OPTIONS])
  })
})
