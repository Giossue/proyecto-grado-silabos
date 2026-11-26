import { Prisma } from "../../generated/prisma/client"
import { type Db, inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, hasRows, iso8601, jsonbValue, jsonText } from "../../prisma/sql"
import { phpJsonDecode, phpShape, record, type PhpRecord } from "../configuration/phpValues"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadTemplate } from "../shared/templateStore"

export type StoredMessage = { id: string; templateId: string; userId: string; content: PhpRecord; sentAt: string; hiddenAt: string | null }

export type StoredProposal = {
  id: string
  templateId: string
  messageId: string
  requestedBy: string
  structure: PhpRecord
  changes: PhpRecord
  fingerprint: string
  draftVersion: string
  state: string
  decidedBy: string | null
  createdAt: string
}

export type ConversationEntry = StoredMessage & { proposal: StoredProposal | null }

export type NewMessage = { id: string; templateId: string; userId: string; content: PhpRecord }

export type NewProposal = {
  id: string
  templateId: string
  messageId: string
  requestedBy: string
  structure: PhpRecord
  changes: PhpRecord
  fingerprint: string
  draftVersion: string
}

export interface AssistantTx {
  lockTemplateId(): Promise<string | null>
  questionByKey(templateId: string, userId: string, key: string): Promise<string | null>
  answerTo(questionId: string): Promise<string | null>
  conversationBusy(templateId: string, userId: string): Promise<boolean>
  insertMessage(message: NewMessage): Promise<void>
  lockProposal(id: string): Promise<StoredProposal | null>
  decideProposal(id: string, state: string, actorId: string, at: number): Promise<void>
  lockMessage(id: string): Promise<StoredMessage | null>
  updateMessage(id: string, content: PhpRecord): Promise<void>
  replacePendingProposals(templateId: string, userId: string): Promise<void>
  insertProposal(proposal: NewProposal): Promise<void>
}

export interface AssistantStore {
  template(): Promise<SyllabusTemplate | null>
  conversation(templateId: string, userId: string): Promise<ConversationEntry[]>
  conversationBusy(templateId: string, userId: string): Promise<boolean>
  hideConversation(templateId: string, userId: string, at: number): Promise<void>
  openProcess(): Promise<boolean>
  processState(): Promise<string>
  proposal(id: string): Promise<StoredProposal | null>
  message(id: string): Promise<StoredMessage | null>
  history(message: StoredMessage, questionId: string, limit: number): Promise<StoredMessage[]>
  lastProposal(templateId: string, userId: string): Promise<StoredProposal | null>
  transaction<T>(work: (tx: AssistantTx) => Promise<T>): Promise<T>
}

export const OPEN_STATES = ["pendiente", "en_ejecucion"]

const MESSAGE = Prisma.sql`select m.mensaje_ia_plantilla_id::text as id, m.plantilla_id::text as "templateId", m.usuario_id::text as "userId",
  ${jsonText(Prisma.raw("m.contenido_mensaje"))} as content, ${iso8601(Prisma.raw("m.enviado_en"))} as "sentAt", ${iso8601(Prisma.raw("m.ocultado_en"))} as "hiddenAt"
  from mensajes_ia_plantilla m`

const PROPOSAL = Prisma.sql`select p.propuesta_ia_plantilla_id::text as id, p.plantilla_id::text as "templateId", p.mensaje_ia_plantilla_id::text as "messageId",
  p.solicitada_por::text as "requestedBy", ${jsonText(Prisma.raw("p.estructura_propuesta"))} as structure, ${jsonText(Prisma.raw("p.cambios_propuesta"))} as changes,
  p.huella_plantilla_base as fingerprint, p.version_borrador_propuesta as "draftVersion", p.estado_propuesta as state,
  p.decidida_por::text as "decidedBy", ${iso8601(Prisma.raw("p.creada_en"))} as "createdAt"
  from propuestas_ia_plantilla p`

type MessageRow = { id: string; templateId: string; userId: string; content: string | null; sentAt: string; hiddenAt: string | null }

type ProposalRow = Omit<StoredProposal, "structure" | "changes"> & { structure: string | null; changes: string | null }

function messageOf(row: MessageRow): StoredMessage {
  return { ...row, content: record(phpJsonDecode(row.content)) }
}

function proposalOf(row: ProposalRow): StoredProposal {
  return { ...row, structure: record(phpJsonDecode(row.structure)), changes: record(phpJsonDecode(row.changes)) }
}

export function jsonbOf(value: unknown): Prisma.Sql {
  return jsonbValue(JSON.stringify(phpShape(value)))
}

const conversationOf = (templateId: string, userId: string) =>
  Prisma.sql`m.plantilla_id = ${templateId}::uuid and m.usuario_id = ${userId}::uuid and m.ocultado_en is null`

const content = (path: string[]) => Prisma.raw(`(m.contenido_mensaje${path.slice(0, -1).map((key) => ` -> '${key}'`).join("")} ->> '${path[path.length - 1]}')`)

function busy(db: Db, templateId: string, userId: string): Promise<boolean> {
  return hasRows(
    db.$queryRaw<{ id: string }[]>`select m.mensaje_ia_plantilla_id::text as id from mensajes_ia_plantilla m
      where ${conversationOf(templateId, userId)} and ${content(["estado"])} = any(${OPEN_STATES}::text[])
      limit 1`,
  )
}

async function oneMessage(db: Db, where: Prisma.Sql, lock = false): Promise<StoredMessage | null> {
  const [row] = await db.$queryRaw<MessageRow[]>`${MESSAGE} where ${where} limit 1 ${lock ? Prisma.sql`for update` : Prisma.empty}`
  return row ? messageOf(row) : null
}

async function oneProposal(db: Db, where: Prisma.Sql, lock = false): Promise<StoredProposal | null> {
  const [row] = await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where ${where} limit 1 ${lock ? Prisma.sql`for update` : Prisma.empty}`
  return row ? proposalOf(row) : null
}

async function firstId(db: Db, where: Prisma.Sql): Promise<string | null> {
  const [row] = await db.$queryRaw<{ id: string }[]>`select m.mensaje_ia_plantilla_id::text as id from mensajes_ia_plantilla m where ${where} limit 1`
  return row?.id ?? null
}

async function processExists(db: Db, state: string): Promise<boolean> {
  return hasRows(
    db.$queryRaw<{ id: string }[]>`select convocatoria_universidad_id::text as id from convocatorias_universidad
      where estado_convocatoria_universidad = ${state} limit 1`,
  )
}

export function assistantTx(db: Db): AssistantTx {
  return {
    async lockTemplateId() {
      const [row] = await db.$queryRaw<{ id: string }[]>`select plantilla_id::text as id from plantilla_silabo limit 1 for update`
      return row?.id ?? null
    },
    questionByKey: (templateId, userId, key) =>
      firstId(
        db,
        Prisma.sql`m.plantilla_id = ${templateId}::uuid and m.usuario_id = ${userId}::uuid and ${content(["rol"])} = 'usuario' and ${content(["entrada", "clave_idempotencia"])} = ${key}`,
      ),
    answerTo: (questionId) => firstId(db, Prisma.sql`${content(["entrada", "respuesta_a_id"])} = ${questionId}`),
    conversationBusy: (templateId, userId) => busy(db, templateId, userId),
    async insertMessage(message) {
      await db.$executeRaw`insert into mensajes_ia_plantilla (mensaje_ia_plantilla_id, plantilla_id, usuario_id, contenido_mensaje)
        values (${message.id}::uuid, ${message.templateId}::uuid, ${message.userId}::uuid, ${jsonbOf(message.content)})`
    },
    lockProposal: (id) => oneProposal(db, Prisma.sql`p.propuesta_ia_plantilla_id = ${id}::uuid`, true),
    async decideProposal(id, state, actorId, at) {
      await db.$executeRaw`update propuestas_ia_plantilla set estado_propuesta = ${state}, decidida_por = ${actorId}::uuid, decidida_en = ${fromEpoch(at)}
        where propuesta_ia_plantilla_id = ${id}::uuid`
    },
    lockMessage: (id) => oneMessage(db, Prisma.sql`m.mensaje_ia_plantilla_id = ${id}::uuid`, true),
    async updateMessage(id, value) {
      await db.$executeRaw`update mensajes_ia_plantilla set contenido_mensaje = ${jsonbOf(value)} where mensaje_ia_plantilla_id = ${id}::uuid`
    },
    async replacePendingProposals(templateId, userId) {
      await db.$executeRaw`update propuestas_ia_plantilla set estado_propuesta = 'reemplazada'
        where plantilla_id = ${templateId}::uuid and solicitada_por = ${userId}::uuid and estado_propuesta = 'pendiente'`
    },
    async insertProposal(proposal) {
      await db.$executeRaw`insert into propuestas_ia_plantilla (propuesta_ia_plantilla_id, plantilla_id, mensaje_ia_plantilla_id, solicitada_por,
          estructura_propuesta, cambios_propuesta, huella_plantilla_base, version_borrador_propuesta, estado_propuesta)
        values (${proposal.id}::uuid, ${proposal.templateId}::uuid, ${proposal.messageId}::uuid, ${proposal.requestedBy}::uuid,
          ${jsonbOf(proposal.structure)}, ${jsonbOf(proposal.changes)}, ${proposal.fingerprint}, ${proposal.draftVersion}, 'pendiente')`
    },
  }
}

export function assistantStoreOn(db: Db, transaction: <T>(work: (tx: AssistantTx) => Promise<T>) => Promise<T>): AssistantStore {
  return {
    template: () => loadTemplate(db),
    async conversation(templateId, userId) {
      const found = (await db.$queryRaw<MessageRow[]>`${MESSAGE} where ${conversationOf(templateId, userId)} order by m.enviado_en asc`).map(messageOf)
      if (found.length === 0) return []
      const ids = found.map((message) => message.id)
      const offers = (await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where p.mensaje_ia_plantilla_id = any(${ids}::uuid[])`).map(proposalOf)
      return found.map((message) => ({ ...message, proposal: offers.find((proposal) => proposal.messageId === message.id) ?? null }))
    },
    conversationBusy: (templateId, userId) => busy(db, templateId, userId),
    async hideConversation(templateId, userId, at) {
      await db.$executeRaw`update mensajes_ia_plantilla m set ocultado_en = ${fromEpoch(at)} where ${conversationOf(templateId, userId)}`
    },
    openProcess: () => processExists(db, "abierto"),
    async processState() {
      for (const [state, name] of [
        ["abierto", "abierta"],
        ["pausado", "pausada"],
      ]) {
        if (await processExists(db, state)) return name
      }
      return "ninguna"
    },
    proposal: (id) => oneProposal(db, Prisma.sql`p.propuesta_ia_plantilla_id = ${id}::uuid`),
    message: (id) => oneMessage(db, Prisma.sql`m.mensaje_ia_plantilla_id = ${id}::uuid`),
    async history(message, questionId, limit) {
      const found = await db.$queryRaw<MessageRow[]>`${MESSAGE}
        where ${conversationOf(message.templateId, message.userId)}
          and m.mensaje_ia_plantilla_id not in (${message.id}::uuid, ${questionId}::uuid)
          and m.enviado_en < (select q.enviado_en from mensajes_ia_plantilla q where q.mensaje_ia_plantilla_id = ${questionId}::uuid limit 1)
          and ${content(["estado"])} = 'completado'
        order by m.enviado_en desc
        limit ${limit}`
      return found.map(messageOf)
    },
    async lastProposal(templateId, userId) {
      const [row] = await db.$queryRaw<ProposalRow[]>`${PROPOSAL}
        where p.plantilla_id = ${templateId}::uuid and p.solicitada_por = ${userId}::uuid
        order by p.creada_en desc
        limit 1`
      return row ? proposalOf(row) : null
    },
    transaction,
  }
}

export function createAssistantStore(prisma: PrismaService): AssistantStore {
  return assistantStoreOn(prisma, (work) => inTransaction(prisma, (tx) => work(assistantTx(tx))))
}
