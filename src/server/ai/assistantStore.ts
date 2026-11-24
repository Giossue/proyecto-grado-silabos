import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonDecode, phpShape, record, type PhpRecord } from "../configuration/phpValues"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadTemplate } from "../configuration/templateStore"
import { phpJsonEncode } from "../laravel/phpJson"
import { iso8601, uuidList } from "../laravel/sql"
import { insertAuditEvent, type AuditEventInput } from "../operations/recordAuditEvent"

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
  recordAudit(event: AuditEventInput): Promise<void>
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

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

async function rows<T>(executor: Executor, query: SQL): Promise<T[]> {
  return (await executor.execute(query)).rows as T[]
}

export const OPEN_STATES = ["pendiente", "en_ejecucion"]

const MESSAGE_COLUMNS = sql`mensaje_ia_plantilla_id::text as id, plantilla_id::text as template_id, usuario_id::text as user_id,
  contenido_mensaje::text as content, ${iso8601(sql.raw("enviado_en"))} as sent_at, ${iso8601(sql.raw("ocultado_en"))} as hidden_at`

const PROPOSAL_COLUMNS = sql`propuesta_ia_plantilla_id::text as id, plantilla_id::text as template_id, mensaje_ia_plantilla_id::text as message_id,
  solicitada_por::text as requested_by, estructura_propuesta::text as structure, cambios_propuesta::text as changes,
  huella_plantilla_base as fingerprint, version_borrador_propuesta as draft_version, estado_propuesta as state,
  decidida_por::text as decided_by, ${iso8601(sql.raw("creada_en"))} as created_at`

type MessageRow = { id: string; template_id: string; user_id: string; content: string; sent_at: string; hidden_at: string | null }

type ProposalRow = {
  id: string
  template_id: string
  message_id: string
  requested_by: string
  structure: string
  changes: string
  fingerprint: string
  draft_version: string
  state: string
  decided_by: string | null
  created_at: string
}

function messageOf(row: MessageRow): StoredMessage {
  return { id: row.id, templateId: row.template_id, userId: row.user_id, content: record(phpJsonDecode(row.content)), sentAt: row.sent_at, hiddenAt: row.hidden_at }
}

function proposalOf(row: ProposalRow): StoredProposal {
  return {
    id: row.id,
    templateId: row.template_id,
    messageId: row.message_id,
    requestedBy: row.requested_by,
    structure: record(phpJsonDecode(row.structure)),
    changes: record(phpJsonDecode(row.changes)),
    fingerprint: row.fingerprint,
    draftVersion: row.draft_version,
    state: row.state,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
  }
}

export function jsonbOf(value: unknown): SQL {
  return sql`${phpJsonEncode(phpShape(value))}::jsonb`
}

const conversationOf = (templateId: string, userId: string) =>
  sql`plantilla_id = ${templateId}::uuid and usuario_id = ${userId}::uuid and ocultado_en is null`

const openState = sql`(contenido_mensaje ->> 'estado') in ('pendiente', 'en_ejecucion')`

async function busy(executor: Executor, templateId: string, userId: string): Promise<boolean> {
  const [row] = await rows<{ found: boolean }>(executor, sql`select exists(select 1 from mensajes_ia_plantilla where ${conversationOf(templateId, userId)} and ${openState}) as found`)
  return row?.found === true
}

export function assistantTx(executor: Executor): AssistantTx {
  return {
    async lockTemplateId() {
      const [row] = await rows<{ id: string }>(executor, sql`select plantilla_id::text as id from plantilla_silabo limit 1 for update`)
      return row?.id ?? null
    },
    async questionByKey(templateId, userId, key) {
      const [row] = await rows<{ id: string }>(
        executor,
        sql`select mensaje_ia_plantilla_id::text as id from mensajes_ia_plantilla
          where plantilla_id = ${templateId}::uuid and usuario_id = ${userId}::uuid and (contenido_mensaje ->> 'rol') = 'usuario'
            and ((contenido_mensaje -> 'entrada') ->> 'clave_idempotencia') = ${key} limit 1`,
      )
      return row?.id ?? null
    },
    async answerTo(questionId) {
      const [row] = await rows<{ id: string }>(
        executor,
        sql`select mensaje_ia_plantilla_id::text as id from mensajes_ia_plantilla where ((contenido_mensaje -> 'entrada') ->> 'respuesta_a_id') = ${questionId} limit 1`,
      )
      return row?.id ?? null
    },
    conversationBusy: (templateId, userId) => busy(executor, templateId, userId),
    async insertMessage(message) {
      await executor.execute(sql`insert into mensajes_ia_plantilla (mensaje_ia_plantilla_id, plantilla_id, usuario_id, contenido_mensaje)
        values (${message.id}::uuid, ${message.templateId}::uuid, ${message.userId}::uuid, ${jsonbOf(message.content)})`)
    },
    async lockProposal(id) {
      const [row] = await rows<ProposalRow>(executor, sql`select ${PROPOSAL_COLUMNS} from propuestas_ia_plantilla where propuesta_ia_plantilla_id = ${id}::uuid limit 1 for update`)
      return row ? proposalOf(row) : null
    },
    async decideProposal(id, state, actorId, at) {
      await executor.execute(sql`update propuestas_ia_plantilla set estado_propuesta = ${state}, decidida_por = ${actorId}::uuid, decidida_en = to_timestamp(${at})
        where propuesta_ia_plantilla_id = ${id}::uuid`)
    },
    async lockMessage(id) {
      const [row] = await rows<MessageRow>(executor, sql`select ${MESSAGE_COLUMNS} from mensajes_ia_plantilla where mensaje_ia_plantilla_id = ${id}::uuid limit 1 for update`)
      return row ? messageOf(row) : null
    },
    async updateMessage(id, content) {
      await executor.execute(sql`update mensajes_ia_plantilla set contenido_mensaje = ${jsonbOf(content)} where mensaje_ia_plantilla_id = ${id}::uuid`)
    },
    async replacePendingProposals(templateId, userId) {
      await executor.execute(sql`update propuestas_ia_plantilla set estado_propuesta = 'reemplazada'
        where plantilla_id = ${templateId}::uuid and solicitada_por = ${userId}::uuid and estado_propuesta = 'pendiente'`)
    },
    async insertProposal(proposal) {
      await executor.execute(sql`insert into propuestas_ia_plantilla (propuesta_ia_plantilla_id, plantilla_id, mensaje_ia_plantilla_id, solicitada_por,
          estructura_propuesta, cambios_propuesta, huella_plantilla_base, version_borrador_propuesta, estado_propuesta)
        values (${proposal.id}::uuid, ${proposal.templateId}::uuid, ${proposal.messageId}::uuid, ${proposal.requestedBy}::uuid,
          ${jsonbOf(proposal.structure)}, ${jsonbOf(proposal.changes)}, ${proposal.fingerprint}, ${proposal.draftVersion}, 'pendiente')`)
    },
    async recordAudit(event) {
      await insertAuditEvent(executor, event)
    },
  }
}

export function assistantStoreOn(executor: Executor, transaction: <T>(work: (tx: AssistantTx) => Promise<T>) => Promise<T>): AssistantStore {
  return {
    template: () => loadTemplate(executor),
    async conversation(templateId, userId) {
      const messages = (
        await rows<MessageRow>(executor, sql`select ${MESSAGE_COLUMNS} from mensajes_ia_plantilla where ${conversationOf(templateId, userId)} order by enviado_en asc`)
      ).map(messageOf)
      if (messages.length === 0) return []
      const proposals = (
        await rows<ProposalRow>(executor, sql`select ${PROPOSAL_COLUMNS} from propuestas_ia_plantilla where mensaje_ia_plantilla_id in (${uuidList(messages.map((message) => message.id))})`)
      ).map(proposalOf)
      return messages.map((message) => ({ ...message, proposal: proposals.find((proposal) => proposal.messageId === message.id) ?? null }))
    },
    conversationBusy: (templateId, userId) => busy(executor, templateId, userId),
    async hideConversation(templateId, userId, at) {
      await executor.execute(sql`update mensajes_ia_plantilla set ocultado_en = to_timestamp(${at}) where ${conversationOf(templateId, userId)}`)
    },
    async openProcess() {
      const [row] = await rows<{ id: string }>(
        executor,
        sql`select convocatoria_universidad_id::text as id from convocatorias_universidad where estado_convocatoria_universidad = 'abierto' limit 1`,
      )
      return row !== undefined
    },
    async processState() {
      for (const [state, name] of [
        ["abierto", "abierta"],
        ["pausado", "pausada"],
      ]) {
        const [row] = await rows<{ found: boolean }>(
          executor,
          sql`select exists(select 1 from convocatorias_universidad where estado_convocatoria_universidad = ${state}) as found`,
        )
        if (row?.found === true) return name
      }
      return "ninguna"
    },
    async proposal(id) {
      const [row] = await rows<ProposalRow>(executor, sql`select ${PROPOSAL_COLUMNS} from propuestas_ia_plantilla where propuesta_ia_plantilla_id = ${id}::uuid limit 1`)
      return row ? proposalOf(row) : null
    },
    async message(id) {
      const [row] = await rows<MessageRow>(executor, sql`select ${MESSAGE_COLUMNS} from mensajes_ia_plantilla where mensaje_ia_plantilla_id = ${id}::uuid limit 1`)
      return row ? messageOf(row) : null
    },
    async history(message, questionId, limit) {
      const found = await rows<MessageRow>(
        executor,
        sql`select ${MESSAGE_COLUMNS} from mensajes_ia_plantilla
          where ${conversationOf(message.templateId, message.userId)}
            and mensaje_ia_plantilla_id not in (${message.id}::uuid, ${questionId}::uuid)
            and enviado_en < (select enviado_en from mensajes_ia_plantilla where mensaje_ia_plantilla_id = ${questionId}::uuid limit 1)
            and (contenido_mensaje ->> 'estado') = 'completado'
          order by enviado_en desc limit ${limit}`,
      )
      return found.map(messageOf)
    },
    async lastProposal(templateId, userId) {
      const [row] = await rows<ProposalRow>(
        executor,
        sql`select ${PROPOSAL_COLUMNS} from propuestas_ia_plantilla where plantilla_id = ${templateId}::uuid and solicitada_por = ${userId}::uuid
          order by creada_en desc limit 1`,
      )
      return row ? proposalOf(row) : null
    },
    transaction,
  }
}

export function createAssistantStore(): AssistantStore {
  return assistantStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(assistantTx(tx as unknown as Executor))))
}
