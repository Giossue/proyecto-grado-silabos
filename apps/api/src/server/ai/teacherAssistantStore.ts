import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, jsonbValue, jsonText } from "../../prisma/sql"
import { phpJsonDecode, type PhpRecord } from "../configuration/phpValues"
import { createTemplateStore } from "../shared/templateStore"
import type { DraftSyllabus } from "../syllabus/draftField"
import { draftTx, syllabusFacts } from "../syllabus/draftFieldStore"
import { allowedAiKeysOn } from "./readPermissionStore"
import { openSessionSql } from "./sessionStore"
import type { HistoryTurn, OfferedProposal, ProposalTarget } from "./teacherAssistant"
import type { SyllabusReading } from "./teacherContext"

export type TeacherMessageState = "pendiente" | "en_ejecucion" | "completado" | "fallido"
export type TeacherProposalState = "pendiente" | "aceptada" | "descartada" | "reemplazada"
type DecidedState = Extract<TeacherProposalState, "aceptada" | "descartada">

export const OPEN_ANSWER_STATES: TeacherMessageState[] = ["pendiente", "en_ejecucion"]

export type NewTeacherProposal = OfferedProposal & { id: string }
export type TeacherOffer = NewTeacherProposal & { state?: DecidedState }

export type TeacherMessage = {
  id: string
  syllabusId: string
  userId: string
  role: "usuario" | "asistente"
  state: TeacherMessageState
  replyTo: string | null
  content: PhpRecord
  sentFields: string[]
  proposals: TeacherOffer[]
  errorCode: string | null
  key: string | null
  createdAt: number
}

export type NewTeacherMessage = Pick<TeacherMessage, "id" | "syllabusId" | "userId" | "role" | "state" | "replyTo" | "content" | "key">
export type AnswerChange = { state: TeacherMessageState; content: PhpRecord; sentFields: string[]; proposals: NewTeacherProposal[]; errorCode: string | null; completedAt: number | null }
export type TeacherProposal = NewTeacherProposal & { messageId: string; syllabusId: string; userId: string; position: number; state: TeacherProposalState }

export interface TeacherAssistantTx {
  lockConversation(syllabusId: string, userId: string): Promise<void>
  answerByKey(syllabusId: string, userId: string, key: string): Promise<string | null>
  openAnswer(syllabusId: string, userId: string): Promise<TeacherMessage | null>
  insertMessage(message: NewTeacherMessage): Promise<void>
  lockMessage(id: string): Promise<TeacherMessage | null>
  updateAnswer(id: string, change: AnswerChange): Promise<void>
}

export interface TeacherAssistantStore {
  reading: SyllabusReading
  syllabus(id: string, userId: string): Promise<DraftSyllabus | null>
  message(id: string): Promise<TeacherMessage | null>
  conversation(syllabusId: string, userId: string, limit: number): Promise<{ messages: TeacherMessage[]; proposals: TeacherProposal[] }>
  earlierTurns(question: TeacherMessage, limit: number): Promise<HistoryTurn[]>
  transaction<T>(work: (tx: TeacherAssistantTx) => Promise<T>): Promise<T>
}

const sameTarget = (left: TeacherOffer, right: TeacherOffer) => left.fieldId === right.fieldId && left.target.space === right.target.space

export function proposalsOf(conversation: TeacherMessage[]): TeacherProposal[] {
  return conversation.flatMap((message, index) =>
    message.proposals.map((offer, position) => {
      const replaced = conversation.slice(index + 1).some((later) => later.proposals.some((next) => sameTarget(next, offer)))
      return { ...offer, messageId: message.id, syllabusId: message.syllabusId, userId: message.userId, position, state: offer.state ?? (replaced ? "reemplazada" : "pendiente") }
    }),
  )
}

type StoredOffer = { id: string; campo_id: string; destino: ProposalTarget; texto: string; fundamento: string; estado?: DecidedState }
type MessageRow = Omit<TeacherMessage, "content" | "sentFields" | "proposals"> & { content: string }

const offerOf = ({ id, campo_id, destino, texto, fundamento, estado }: StoredOffer): TeacherOffer => ({
  id,
  fieldId: campo_id,
  target: destino,
  text: texto,
  basis: fundamento,
  ...(estado === undefined ? {} : { state: estado }),
})

const storedOffer = (offer: NewTeacherProposal): StoredOffer => ({ id: offer.id, campo_id: offer.fieldId, destino: offer.target, texto: offer.text, fundamento: offer.basis })

function messageOf(row: MessageRow): TeacherMessage {
  const { campos_enviados: sent, propuestas: offers, ...content } = JSON.parse(row.content) as PhpRecord
  return {
    ...row,
    content,
    sentFields: (sent as string[] | undefined) ?? [],
    proposals: ((offers as StoredOffer[] | undefined) ?? []).map(offerOf),
    createdAt: Number(row.createdAt),
  }
}

function answerContent({ content, sentFields, proposals }: AnswerChange): PhpRecord {
  return {
    ...content,
    ...(sentFields.length === 0 ? {} : { campos_enviados: sentFields }),
    ...(proposals.length === 0 ? {} : { propuestas: proposals.map(storedOffer) }),
  }
}

const COLUMNS = Prisma.sql`m.mensaje_ia_id::text as id, s.silabo_id::text as "syllabusId", s.usuario_id::text as "userId", m.rol as role, m.estado as state,
  m.respuesta_a_id::text as "replyTo", ${jsonText(Prisma.raw("m.contenido_mensaje"))} as content, m.codigo_error as "errorCode",
  m.clave_idempotencia as key, floor(extract(epoch from m.creado_en))::double precision as "createdAt"`

const MESSAGES = Prisma.sql`from mensajes_ia m inner join sesiones_ia s on s.sesion_ia_id = m.sesion_ia_id`

const ownedBy = (syllabusId: string, userId: string) => Prisma.sql`s.silabo_id = ${syllabusId}::uuid and s.usuario_id = ${userId}::uuid`
const conversationOf = (syllabusId: string, userId: string) => Prisma.sql`${ownedBy(syllabusId, userId)} and s.cerrada_en is null`
const teacherMessage = (id: string) => Prisma.sql`m.mensaje_ia_id = ${id}::uuid and s.silabo_id is not null`

async function messageWhere(db: Db, where: Prisma.Sql, lock = false): Promise<TeacherMessage | null> {
  const [row] = await db.$queryRaw<MessageRow[]>`select ${COLUMNS} ${MESSAGES} where ${where} limit 1 ${lock ? Prisma.sql`for update of m` : Prisma.empty}`
  return row ? messageOf(row) : null
}

function readingOn(db: Db): SyllabusReading {
  return {
    templates: createTemplateStore(db),
    values: (syllabusId) => draftTx(db).values(syllabusId),
    async academicContext(syllabusId) {
      const [row] = await db.$queryRaw<{ context: string | null }[]>`select datos_academicos_silabo::text as context from silabos where silabo_id = ${syllabusId}::uuid`
      return phpJsonDecode(row?.context ?? null)
    },
    allowedKeys: (templateId) => allowedAiKeysOn(db, templateId),
  }
}

export function teacherAssistantTx(db: Db): TeacherAssistantTx {
  return {
    async lockConversation(syllabusId, userId) {
      await db.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`sesiones_ia:${syllabusId}:${userId}`}, 0))`
    },
    async answerByKey(syllabusId, userId, key) {
      const [row] = await db.$queryRaw<{ id: string }[]>`select a.mensaje_ia_id::text as id
        from mensajes_ia q inner join sesiones_ia s on s.sesion_ia_id = q.sesion_ia_id
          inner join mensajes_ia a on a.respuesta_a_id = q.mensaje_ia_id
        where ${ownedBy(syllabusId, userId)} and q.clave_idempotencia = ${key} limit 1`
      return row?.id ?? null
    },
    openAnswer: (syllabusId, userId) => messageWhere(db, Prisma.sql`${conversationOf(syllabusId, userId)} and m.estado = any(${OPEN_ANSWER_STATES}::text[])`, true),
    async insertMessage(message) {
      await db.$executeRaw`${openSessionSql(message.userId, { syllabusId: message.syllabusId })}
        insert into mensajes_ia (mensaje_ia_id, sesion_ia_id, respuesta_a_id, rol, estado, contenido_mensaje, clave_idempotencia)
        select ${message.id}::uuid, sesion.sesion_ia_id, ${message.replyTo}::uuid, ${message.role}::text, ${message.state}::text,
          ${jsonbValue(JSON.stringify(message.content))}, ${message.key}::text
        from sesion`
    },
    lockMessage: (id) => messageWhere(db, teacherMessage(id), true),
    async updateAnswer(id, change) {
      await db.$executeRaw`update mensajes_ia set estado = ${change.state}, contenido_mensaje = ${jsonbValue(JSON.stringify(answerContent(change)))},
          codigo_error = ${change.errorCode}, completado_en = ${change.completedAt === null ? Prisma.sql`null` : fromEpoch(change.completedAt)}
        where mensaje_ia_id = ${id}::uuid and rol = 'asistente'`
    },
  }
}

export function createTeacherAssistantStore(prisma: PrismaService): TeacherAssistantStore {
  return {
    reading: readingOn(prisma),
    syllabus: (id, userId) => syllabusFacts(prisma, id, userId),
    message: (id) => messageWhere(prisma, teacherMessage(id)),
    async conversation(syllabusId, userId, limit) {
      const latest = await prisma.$queryRaw<MessageRow[]>`select ${COLUMNS} ${MESSAGES} where ${conversationOf(syllabusId, userId)} order by m.creado_en desc limit ${limit}`
      const messages = latest.map(messageOf).reverse()
      return { messages, proposals: proposalsOf(messages) }
    },
    async earlierTurns(question, limit) {
      const found = await prisma.$queryRaw<(MessageRow & { question: string })[]>`select q.contenido_mensaje ->> 'texto' as question, ${COLUMNS} ${MESSAGES}
          inner join mensajes_ia q on q.mensaje_ia_id = m.respuesta_a_id and q.sesion_ia_id = m.sesion_ia_id
        where ${conversationOf(question.syllabusId, question.userId)} and m.rol = 'asistente' and m.estado = 'completado'
          and m.creado_en < (select actual.creado_en from mensajes_ia actual where actual.mensaje_ia_id = ${question.id}::uuid)
        order by m.creado_en desc limit ${limit}`
      const turns = found.reverse().map(({ question: asked, ...row }) => ({ asked, answer: messageOf(row) }))
      const proposals = proposalsOf(turns.map((turn) => turn.answer))
      return turns.map(({ asked, answer }) => ({
        question: asked,
        answer: String(answer.content.texto),
        sentFields: answer.sentFields,
        proposals: proposals.filter((proposal) => proposal.messageId === answer.id).map((proposal) => ({ label: proposal.target.fieldLabel, state: proposal.state, text: proposal.text })),
      }))
    },
    transaction: (work) => inTransaction(prisma, (tx) => work(teacherAssistantTx(tx))),
  }
}
