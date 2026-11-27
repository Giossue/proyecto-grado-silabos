import { Prisma } from "../../generated/prisma/client"
import { type Db, inTransaction } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { fromEpoch, hasRows, iso8601, jsonbValue, jsonText } from "../../prisma/sql"
import { isRecord, phpJsonDecode, phpShape, phpString, record, type PhpRecord } from "../configuration/phpValues"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadTemplate } from "../shared/templateStore"
import { openSessionSql } from "./sessionStore"

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
  hideConversation(templateId: string, userId: string, at: number): Promise<void>
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
  openProcess(): Promise<boolean>
  processState(): Promise<string>
  proposal(id: string): Promise<StoredProposal | null>
  message(id: string): Promise<StoredMessage | null>
  history(message: StoredMessage, questionId: string, limit: number): Promise<StoredMessage[]>
  lastProposal(templateId: string, userId: string): Promise<StoredProposal | null>
  transaction<T>(work: (tx: AssistantTx) => Promise<T>): Promise<T>
}

export const OPEN_STATES = ["pendiente", "en_ejecucion"]

const MESSAGES = Prisma.sql`from mensajes_ia m inner join sesiones_ia s on s.sesion_ia_id = m.sesion_ia_id`

const OFFER = "(m.contenido_mensaje -> 'propuesta')"
const offerText = (key: string) => Prisma.raw(`${OFFER} ->> '${key}'`)

const MESSAGE = Prisma.sql`select m.mensaje_ia_id::text as id, s.plantilla_id::text as "templateId", s.usuario_id::text as "userId",
  ${jsonText(Prisma.raw("(m.contenido_mensaje - 'propuesta')"))} as content, m.rol as role, m.estado as state, m.codigo_error as "errorCode",
  ${iso8601(Prisma.raw("m.completado_en"))} as "completedAt", m.clave_idempotencia as "idempotencyKey", m.respuesta_a_id::text as "replyTo",
  ${iso8601(Prisma.raw("m.creado_en"))} as "sentAt", ${iso8601(Prisma.raw("s.cerrada_en"))} as "hiddenAt"
  ${MESSAGES}`

const PROPOSAL = Prisma.sql`select ${offerText("id")} as id, s.plantilla_id::text as "templateId", m.mensaje_ia_id::text as "messageId",
  s.usuario_id::text as "requestedBy", ${jsonText(Prisma.raw(`(${OFFER} -> 'estructura')`))} as structure, ${jsonText(Prisma.raw(`(${OFFER} -> 'cambios')`))} as changes,
  ${offerText("huella_plantilla_base")} as fingerprint, ${offerText("version_borrador")} as "draftVersion", ${offerText("estado")} as state,
  ${offerText("decidida_por")} as "decidedBy", ${offerText("creada_en")} as "createdAt"
  ${MESSAGES}`

const proposalById = (id: string) => Prisma.sql`${offerText("id")} = ${id}::uuid::text and s.plantilla_id is not null`
const templateMessage = (id: string) => Prisma.sql`m.mensaje_ia_id = ${id}::uuid and s.plantilla_id is not null`
const ownedBy = (templateId: string, userId: string) => Prisma.sql`s.plantilla_id = ${templateId}::uuid and s.usuario_id = ${userId}::uuid`

export type MessageColumns = { role: string; state: string; errorCode: string | null; completedAt: string | null; idempotencyKey: string | null; replyTo: string | null }

type MessageRow = MessageColumns & { id: string; templateId: string; userId: string; content: string | null; sentAt: string; hiddenAt: string | null }

type ProposalRow = Omit<StoredProposal, "structure" | "changes"> & { structure: string | null; changes: string | null }

const nullableText = (value: unknown): string | null => (value === null || value === undefined ? null : phpString(value))

export function splitMessageContent(content: PhpRecord): { columns: MessageColumns; content: PhpRecord } {
  const { rol, estado, codigo_error, completado_en, ...rest } = content
  let idempotencyKey: string | null = null
  let replyTo: string | null = null
  if (isRecord(rest.entrada)) {
    const { clave_idempotencia, respuesta_a_id, ...input } = rest.entrada
    idempotencyKey = nullableText(clave_idempotencia)
    replyTo = nullableText(respuesta_a_id)
    rest.entrada = input
  }
  return {
    columns: { role: phpString(rol), state: phpString(estado), errorCode: nullableText(codigo_error), completedAt: nullableText(completado_en), idempotencyKey, replyTo },
    content: rest,
  }
}

export function joinMessageContent(content: PhpRecord, columns: MessageColumns): PhpRecord {
  const joined: PhpRecord = { rol: columns.role, estado: columns.state, ...content }
  if (columns.replyTo !== null) joined.entrada = { respuesta_a_id: columns.replyTo, ...record(content.entrada) }
  if (columns.idempotencyKey !== null) joined.entrada = { ...record(joined.entrada), clave_idempotencia: columns.idempotencyKey }
  if (columns.errorCode !== null) joined.codigo_error = columns.errorCode
  if (columns.completedAt !== null) joined.completado_en = columns.completedAt
  return joined
}

function messageOf(row: MessageRow): StoredMessage {
  const { role, state, errorCode, completedAt, idempotencyKey, replyTo, content, ...rest } = row
  return { ...rest, content: joinMessageContent(record(phpJsonDecode(content)), { role, state, errorCode, completedAt, idempotencyKey, replyTo }) }
}

function messageJsonbOf(content: PhpRecord): Prisma.Sql {
  return Object.keys(content).length === 0 ? jsonbValue("{}") : jsonbOf(content)
}

function proposalOf(row: ProposalRow): StoredProposal {
  return { ...row, structure: record(phpJsonDecode(row.structure)), changes: record(phpJsonDecode(row.changes)) }
}

export function jsonbOf(value: unknown): Prisma.Sql {
  return jsonbValue(JSON.stringify(phpShape(value)))
}

const conversationOf = (templateId: string, userId: string) => Prisma.sql`${ownedBy(templateId, userId)} and s.cerrada_en is null`

const completedAtOf = (value: string | null) => (value === null ? Prisma.sql`null` : Prisma.sql`${value}::timestamptz`)

function busy(db: Db, templateId: string, userId: string): Promise<boolean> {
  return hasRows(
    db.$queryRaw<{ id: string }[]>`select m.mensaje_ia_id::text as id ${MESSAGES}
      where ${conversationOf(templateId, userId)} and m.estado = any(${OPEN_STATES}::text[])
      limit 1`,
  )
}

async function oneMessage(db: Db, where: Prisma.Sql, lock = false): Promise<StoredMessage | null> {
  const [row] = await db.$queryRaw<MessageRow[]>`${MESSAGE} where ${where} limit 1 ${lock ? Prisma.sql`for update of m` : Prisma.empty}`
  return row ? messageOf(row) : null
}

async function oneProposal(db: Db, where: Prisma.Sql, lock = false): Promise<StoredProposal | null> {
  const [row] = await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where ${where} limit 1 ${lock ? Prisma.sql`for update of m` : Prisma.empty}`
  return row ? proposalOf(row) : null
}

async function firstId(db: Db, where: Prisma.Sql): Promise<string | null> {
  const [row] = await db.$queryRaw<{ id: string }[]>`select m.mensaje_ia_id::text as id ${MESSAGES} where ${where} limit 1`
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
    questionByKey: (templateId, userId, key) => firstId(db, Prisma.sql`${ownedBy(templateId, userId)} and m.rol = 'usuario' and m.clave_idempotencia = ${key}`),
    answerTo: (questionId) => firstId(db, Prisma.sql`m.respuesta_a_id = ${questionId}::uuid`),
    conversationBusy: (templateId, userId) => busy(db, templateId, userId),
    async hideConversation(templateId, userId, at) {
      await db.$executeRaw`update sesiones_ia set cerrada_en = ${fromEpoch(at)} where plantilla_id = ${templateId}::uuid and usuario_id = ${userId}::uuid and cerrada_en is null`
    },
    async insertMessage(message) {
      const { columns, content: rest } = splitMessageContent(message.content)
      await db.$executeRaw`${openSessionSql(message.userId, { templateId: message.templateId })}
        insert into mensajes_ia (mensaje_ia_id, sesion_ia_id, respuesta_a_id, rol, estado, contenido_mensaje, codigo_error, completado_en, clave_idempotencia)
        select ${message.id}::uuid, sesion.sesion_ia_id, ${columns.replyTo}::uuid, ${columns.role}::text, ${columns.state}::text, ${messageJsonbOf(rest)},
          ${columns.errorCode}::text, ${completedAtOf(columns.completedAt)}, ${columns.idempotencyKey}::text
        from sesion`
    },
    lockProposal: (id) => oneProposal(db, proposalById(id), true),
    async decideProposal(id, state, actorId, at) {
      await db.$executeRaw`update mensajes_ia set contenido_mensaje = jsonb_set(contenido_mensaje, '{propuesta}', (contenido_mensaje -> 'propuesta')
          || jsonb_build_object('estado', ${state}::text, 'decidida_por', ${actorId}::uuid, 'decidida_en', ${iso8601(fromEpoch(at))}))
        where (contenido_mensaje -> 'propuesta') ->> 'id' = ${id}::uuid::text`
    },
    lockMessage: (id) => oneMessage(db, templateMessage(id), true),
    async updateMessage(id, value) {
      const { columns, content: rest } = splitMessageContent(value)
      await db.$executeRaw`update mensajes_ia set contenido_mensaje = ${messageJsonbOf(rest)}
          || case when contenido_mensaje -> 'propuesta' is null then '{}'::jsonb else jsonb_build_object('propuesta', contenido_mensaje -> 'propuesta') end,
          rol = ${columns.role}, estado = ${columns.state}, codigo_error = ${columns.errorCode}, completado_en = ${completedAtOf(columns.completedAt)},
          clave_idempotencia = ${columns.idempotencyKey}, respuesta_a_id = ${columns.replyTo}::uuid
        where mensaje_ia_id = ${id}::uuid`
    },
    async replacePendingProposals(templateId, userId) {
      await db.$executeRaw`update mensajes_ia m set contenido_mensaje = jsonb_set(m.contenido_mensaje, '{propuesta,estado}', '"reemplazada"')
        from sesiones_ia s
        where s.sesion_ia_id = m.sesion_ia_id and ${ownedBy(templateId, userId)} and ${offerText("estado")} = 'pendiente'`
    },
    async insertProposal(proposal) {
      const offer = {
        id: proposal.id,
        estructura: proposal.structure,
        cambios: proposal.changes,
        huella_plantilla_base: proposal.fingerprint,
        version_borrador: proposal.draftVersion,
        estado: "pendiente",
      }
      await db.$executeRaw`update mensajes_ia set contenido_mensaje = contenido_mensaje
          || jsonb_build_object('propuesta', ${jsonbOf(offer)} || jsonb_build_object('creada_en', ${iso8601(Prisma.sql`clock_timestamp()`)}))
        where mensaje_ia_id = ${proposal.messageId}::uuid`
    },
  }
}

export function assistantStoreOn(db: Db, transaction: <T>(work: (tx: AssistantTx) => Promise<T>) => Promise<T>): AssistantStore {
  return {
    template: () => loadTemplate(db),
    async conversation(templateId, userId) {
      const found = (await db.$queryRaw<MessageRow[]>`${MESSAGE} where ${conversationOf(templateId, userId)} order by m.creado_en asc`).map(messageOf)
      if (found.length === 0) return []
      const ids = found.map((message) => message.id)
      const offers = (await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where m.mensaje_ia_id = any(${ids}::uuid[]) and ${offerText("id")} is not null`).map(proposalOf)
      return found.map((message) => ({ ...message, proposal: offers.find((proposal) => proposal.messageId === message.id) ?? null }))
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
    proposal: (id) => oneProposal(db, proposalById(id)),
    message: (id) => oneMessage(db, templateMessage(id)),
    async history(message, questionId, limit) {
      const found = await db.$queryRaw<MessageRow[]>`${MESSAGE}
        where ${conversationOf(message.templateId, message.userId)}
          and m.mensaje_ia_id not in (${message.id}::uuid, ${questionId}::uuid)
          and m.creado_en < (select q.creado_en from mensajes_ia q where q.mensaje_ia_id = ${questionId}::uuid limit 1)
          and m.estado = 'completado'
        order by m.creado_en desc
        limit ${limit}`
      return found.map(messageOf)
    },
    async lastProposal(templateId, userId) {
      const [row] = await db.$queryRaw<ProposalRow[]>`${PROPOSAL}
        where ${ownedBy(templateId, userId)} and ${offerText("id")} is not null
        order by m.creado_en desc
        limit 1`
      return row ? proposalOf(row) : null
    },
    transaction,
  }
}

export function createAssistantStore(prisma: PrismaService): AssistantStore {
  return assistantStoreOn(prisma, (work) => inTransaction(prisma, (tx) => work(assistantTx(tx))))
}
