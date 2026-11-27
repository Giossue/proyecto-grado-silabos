import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, jsonbValue, jsonText } from "../../prisma/sql"
import { phpJsonDecode, type PhpRecord } from "../configuration/phpValues"
import { createTemplateStore } from "../shared/templateStore"
import type { DraftSyllabus, LockedSyllabus } from "../syllabus/draftField"
import { draftTx, syllabusFacts } from "../syllabus/draftFieldStore"
import { allowedAiKeysOn } from "./readPermissionStore"
import type { HistoryTurn, OfferedProposal } from "./teacherAssistant"
import type { SyllabusReading } from "./teacherContext"

export type TeacherMessageState = "pendiente" | "en_ejecucion" | "completado" | "fallido"
export type TeacherProposalState = "pendiente" | "aceptada" | "descartada" | "reemplazada"

export const OPEN_ANSWER_STATES: TeacherMessageState[] = ["pendiente", "en_ejecucion"]

export type TeacherMessage = {
  id: string
  syllabusId: string
  userId: string
  role: "usuario" | "asistente"
  state: TeacherMessageState
  replyTo: string | null
  content: PhpRecord
  sentFields: string[]
  errorCode: string | null
  key: string | null
  createdAt: number
}

export type NewTeacherMessage = Pick<TeacherMessage, "id" | "syllabusId" | "userId" | "role" | "state" | "replyTo" | "content" | "key">
export type AnswerChange = { state: TeacherMessageState; content: PhpRecord; sentFields: string[]; errorCode: string | null; completedAt: number | null }
export type NewTeacherProposal = OfferedProposal & { id: string; messageId: string; position: number }
export type TeacherProposal = NewTeacherProposal & { syllabusId: string; userId: string; state: TeacherProposalState }
export type ReplacedTarget = { fieldId: string; space: number | null }

export interface TeacherAssistantTx {
  reading: SyllabusReading
  lockConversation(syllabusId: string, userId: string): Promise<void>
  answerByKey(syllabusId: string, userId: string, key: string): Promise<string | null>
  openAnswer(syllabusId: string, userId: string): Promise<TeacherMessage | null>
  insertMessage(message: NewTeacherMessage): Promise<void>
  lockMessage(id: string): Promise<TeacherMessage | null>
  updateAnswer(id: string, change: AnswerChange): Promise<void>
  lockSyllabus(id: string): Promise<LockedSyllabus | null>
  lockProposal(id: string): Promise<TeacherProposal | null>
  decideProposal(id: string, state: TeacherProposalState, at: number): Promise<void>
  fieldProposals(syllabusId: string, userId: string, fieldId: string): Promise<TeacherProposal[]>
  updateProposalTarget(id: string, target: TeacherProposal["target"]): Promise<void>
  replacePendingProposals(syllabusId: string, userId: string, targets: ReplacedTarget[]): Promise<void>
  insertProposal(proposal: NewTeacherProposal): Promise<void>
}

export interface TeacherAssistantStore {
  reading: SyllabusReading
  syllabus(id: string, userId: string): Promise<DraftSyllabus | null>
  message(id: string): Promise<TeacherMessage | null>
  conversation(syllabusId: string, userId: string, limit: number): Promise<{ messages: TeacherMessage[]; proposals: TeacherProposal[] }>
  earlierTurns(question: TeacherMessage, limit: number): Promise<HistoryTurn[]>
  proposal(id: string): Promise<TeacherProposal | null>
  transaction<T>(work: (tx: TeacherAssistantTx) => Promise<T>): Promise<T>
}

const MESSAGE = Prisma.sql`select m.mensaje_ia_docente_id::text as id, m.silabo_id::text as "syllabusId", m.usuario_id::text as "userId", m.rol as role, m.estado as state,
  m.respuesta_a_id::text as "replyTo", ${jsonText(Prisma.raw("m.contenido_mensaje"))} as content, m.campos_enviados::text[] as "sentFields", m.codigo_error as "errorCode",
  m.clave_idempotencia as key, floor(extract(epoch from m.creado_en))::double precision as "createdAt"
  from mensajes_ia_docente m`

const PROPOSAL = Prisma.sql`select p.propuesta_ia_docente_id::text as id, p.mensaje_ia_docente_id::text as "messageId", m.silabo_id::text as "syllabusId", m.usuario_id::text as "userId",
  p.posicion_propuesta as position, p.definicion_campo_id::text as "fieldId", ${jsonText(Prisma.raw("p.destino_propuesta"))} as target, p.huella_destino_base as "baseHash",
  p.texto_propuesta as text, p.fundamento_propuesta as basis, p.estado_propuesta as state
  from propuestas_ia_docente p inner join mensajes_ia_docente m on m.mensaje_ia_docente_id = p.mensaje_ia_docente_id`

type MessageRow = Omit<TeacherMessage, "content"> & { content: string }
type ProposalRow = Omit<TeacherProposal, "target"> & { target: string }
type TurnRow = { id: string; question: string; answer: string; sentFields: string[] }

const messageOf = (row: MessageRow): TeacherMessage => ({ ...row, content: JSON.parse(row.content) as PhpRecord, createdAt: Number(row.createdAt) })
const proposalOf = (row: ProposalRow): TeacherProposal => ({ ...row, position: Number(row.position), target: JSON.parse(row.target) as TeacherProposal["target"] })

const conversationOf = (alias: string, syllabusId: string, userId: string) =>
  Prisma.sql`${Prisma.raw(alias)}.silabo_id = ${syllabusId}::uuid and ${Prisma.raw(alias)}.usuario_id = ${userId}::uuid`

async function messageWhere(db: Db, where: Prisma.Sql, lock = false): Promise<TeacherMessage | null> {
  const [row] = await db.$queryRaw<MessageRow[]>`${MESSAGE} where ${where} limit 1 ${lock ? Prisma.sql`for update` : Prisma.empty}`
  return row ? messageOf(row) : null
}

async function proposalWithId(db: Db, id: string, lock = false): Promise<TeacherProposal | null> {
  const [row] = await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where p.propuesta_ia_docente_id = ${id}::uuid limit 1 ${lock ? Prisma.sql`for update of p` : Prisma.empty}`
  return row ? proposalOf(row) : null
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
    reading: readingOn(db),
    async lockConversation(syllabusId, userId) {
      await db.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`mensajes_ia_docente:${syllabusId}:${userId}`}, 0))`
    },
    async answerByKey(syllabusId, userId, key) {
      const [row] = await db.$queryRaw<{ id: string }[]>`select a.mensaje_ia_docente_id::text as id
        from mensajes_ia_docente q inner join mensajes_ia_docente a on a.respuesta_a_id = q.mensaje_ia_docente_id
        where ${conversationOf("q", syllabusId, userId)} and q.clave_idempotencia = ${key} limit 1`
      return row?.id ?? null
    },
    openAnswer: (syllabusId, userId) => messageWhere(db, Prisma.sql`${conversationOf("m", syllabusId, userId)} and m.estado = any(${OPEN_ANSWER_STATES}::text[])`, true),
    async insertMessage(message) {
      await db.$executeRaw`insert into mensajes_ia_docente (mensaje_ia_docente_id, silabo_id, usuario_id, respuesta_a_id, rol, estado, contenido_mensaje, clave_idempotencia)
        values (${message.id}::uuid, ${message.syllabusId}::uuid, ${message.userId}::uuid, ${message.replyTo}::uuid, ${message.role}, ${message.state},
          ${jsonbValue(JSON.stringify(message.content))}, ${message.key})`
    },
    lockMessage: (id) => messageWhere(db, Prisma.sql`m.mensaje_ia_docente_id = ${id}::uuid`, true),
    async updateAnswer(id, change) {
      await db.$executeRaw`update mensajes_ia_docente set estado = ${change.state}, contenido_mensaje = ${jsonbValue(JSON.stringify(change.content))},
          campos_enviados = ${change.sentFields}::uuid[], codigo_error = ${change.errorCode},
          completado_en = ${change.completedAt === null ? Prisma.sql`null` : fromEpoch(change.completedAt)}
        where mensaje_ia_docente_id = ${id}::uuid and rol = 'asistente'`
    },
    lockSyllabus: (id) => draftTx(db).lockSyllabus(id),
    lockProposal: (id) => proposalWithId(db, id, true),
    async decideProposal(id, state, at) {
      await db.$executeRaw`update propuestas_ia_docente set estado_propuesta = ${state}, decidida_en = ${fromEpoch(at)} where propuesta_ia_docente_id = ${id}::uuid`
    },
    async fieldProposals(syllabusId, userId, fieldId) {
      const rows = await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where ${conversationOf("m", syllabusId, userId)} and p.definicion_campo_id = ${fieldId}::uuid
        and p.estado_propuesta in ('pendiente', 'aceptada') order by p.creado_en, p.posicion_propuesta for update of p`
      return rows.map(proposalOf)
    },
    async updateProposalTarget(id, target) {
      await db.$executeRaw`update propuestas_ia_docente set destino_propuesta = ${jsonbValue(JSON.stringify(target))} where propuesta_ia_docente_id = ${id}::uuid`
    },
    async replacePendingProposals(syllabusId, userId, targets) {
      for (const target of targets) {
        await db.$executeRaw`update propuestas_ia_docente p set estado_propuesta = 'reemplazada' from mensajes_ia_docente m
          where m.mensaje_ia_docente_id = p.mensaje_ia_docente_id and ${conversationOf("m", syllabusId, userId)} and p.estado_propuesta = 'pendiente'
            and p.definicion_campo_id = ${target.fieldId}::uuid and (p.destino_propuesta ->> 'space') is not distinct from ${target.space === null ? null : String(target.space)}::text`
      }
    },
    async insertProposal(proposal) {
      await db.$executeRaw`insert into propuestas_ia_docente (propuesta_ia_docente_id, mensaje_ia_docente_id, posicion_propuesta, definicion_campo_id, destino_propuesta,
          huella_destino_base, texto_propuesta, fundamento_propuesta)
        values (${proposal.id}::uuid, ${proposal.messageId}::uuid, ${proposal.position}, ${proposal.fieldId}::uuid, ${jsonbValue(JSON.stringify(proposal.target))},
          ${proposal.baseHash}, ${proposal.text}, ${proposal.basis})`
    },
  }
}

export function createTeacherAssistantStore(prisma: PrismaService): TeacherAssistantStore {
  return {
    reading: readingOn(prisma),
    syllabus: (id, userId) => syllabusFacts(prisma, id, userId),
    message: (id) => messageWhere(prisma, Prisma.sql`m.mensaje_ia_docente_id = ${id}::uuid`),
    async conversation(syllabusId, userId, limit) {
      const latest = await prisma.$queryRaw<MessageRow[]>`${MESSAGE} where ${conversationOf("m", syllabusId, userId)} order by m.creado_en desc limit ${limit}`
      const messages = latest.map(messageOf).reverse()
      if (messages.length === 0) return { messages, proposals: [] }
      const ids = messages.map((message) => message.id)
      const proposals = await prisma.$queryRaw<ProposalRow[]>`${PROPOSAL} where p.mensaje_ia_docente_id = any(${ids}::uuid[]) order by p.posicion_propuesta`
      return { messages, proposals: proposals.map(proposalOf) }
    },
    async earlierTurns(question, limit) {
      const found = await prisma.$queryRaw<TurnRow[]>`select a.mensaje_ia_docente_id::text as id, q.contenido_mensaje ->> 'texto' as question,
          a.contenido_mensaje ->> 'texto' as answer, a.campos_enviados::text[] as "sentFields"
        from mensajes_ia_docente a inner join mensajes_ia_docente q on q.mensaje_ia_docente_id = a.respuesta_a_id
          and q.silabo_id = a.silabo_id and q.usuario_id = a.usuario_id
        where ${conversationOf("a", question.syllabusId, question.userId)} and a.rol = 'asistente' and a.estado = 'completado'
          and a.creado_en < (select actual.creado_en from mensajes_ia_docente actual where actual.mensaje_ia_docente_id = ${question.id}::uuid)
        order by a.creado_en desc limit ${limit}`
      if (found.length === 0) return []
      const ids = found.map((turn) => turn.id)
      const proposals = (await prisma.$queryRaw<ProposalRow[]>`${PROPOSAL} where p.mensaje_ia_docente_id = any(${ids}::uuid[]) order by p.posicion_propuesta`).map(proposalOf)
      return found.reverse().map(({ id, question: asked, answer, sentFields }) => ({
        question: asked,
        answer,
        sentFields,
        proposals: proposals.filter((proposal) => proposal.messageId === id).map((proposal) => ({ label: proposal.target.fieldLabel, state: proposal.state, text: proposal.text })),
      }))
    },
    proposal: (id) => proposalWithId(prisma, id),
    transaction: (work) => inTransaction(prisma, (tx) => work(teacherAssistantTx(tx))),
  }
}
