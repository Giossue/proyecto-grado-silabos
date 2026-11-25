import { Inject, Injectable } from "@nestjs/common"
import { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import type { AssistantStore, AssistantTx, ConversationEntry, StoredMessage, StoredProposal } from "../../server/ai/assistantStore"
import { OPEN_STATES } from "../../server/ai/assistantStore"
import { phpJsonDecode, phpShape, record } from "../../server/configuration/phpValues"
import type { SyllabusTemplate } from "../../server/configuration/templatePresentation"
import { type Db, hasRow, TRANSACTION_OPTIONS } from "../template/template-db"
import { loadTemplateFrom } from "../template/template.repository"

type MessageRow = { id: string; templateId: string; userId: string; content: string | null; sentAt: string; hiddenAt: string | null }

type ProposalRow = Omit<StoredProposal, "structure" | "changes"> & { structure: string | null; changes: string | null }

const isoText = (column: string) => Prisma.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`)

const MESSAGE = Prisma.sql`select m.mensaje_ia_plantilla_id::text as id, m.plantilla_id::text as "templateId", m.usuario_id::text as "userId",
  m.contenido_mensaje::text as content, ${isoText("m.enviado_en")} as "sentAt", ${isoText("m.ocultado_en")} as "hiddenAt"
  from mensajes_ia_plantilla m`

const PROPOSAL = Prisma.sql`select p.propuesta_ia_plantilla_id::text as id, p.plantilla_id::text as "templateId", p.mensaje_ia_plantilla_id::text as "messageId",
  p.solicitada_por::text as "requestedBy", p.estructura_propuesta::text as structure, p.cambios_propuesta::text as changes,
  p.huella_plantilla_base as fingerprint, p.version_borrador_propuesta as "draftVersion", p.estado_propuesta as state,
  p.decidida_por::text as "decidedBy", ${isoText("p.creada_en")} as "createdAt"
  from propuestas_ia_plantilla p`

function messageOf(row: MessageRow): StoredMessage {
  return { ...row, content: record(phpJsonDecode(row.content)) }
}

function proposalOf(row: ProposalRow): StoredProposal {
  return { ...row, structure: record(phpJsonDecode(row.structure)), changes: record(phpJsonDecode(row.changes)) }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return phpShape(value) as Prisma.InputJsonValue
}

const conversationOf = (templateId: string, userId: string) =>
  Prisma.sql`m.plantilla_id = ${templateId}::uuid and m.usuario_id = ${userId}::uuid and m.ocultado_en is null`

const content = (path: string[]) => Prisma.raw(`(m.contenido_mensaje${path.slice(0, -1).map((key) => ` -> '${key}'`).join("")} ->> '${path[path.length - 1]}')`)

function busy(db: Db, templateId: string, userId: string): Promise<boolean> {
  return hasRow(db.$queryRaw<{ id: string }[]>`
    select m.mensaje_ia_plantilla_id::text as id from mensajes_ia_plantilla m
    where ${conversationOf(templateId, userId)} and ${content(["estado"])} = any(${OPEN_STATES}::text[])
    limit 1`)
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

export function assistantTxOn(db: Db): AssistantTx {
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
      await db.mensajes_ia_plantilla.create({
        data: { mensaje_ia_plantilla_id: message.id, plantilla_id: message.templateId, usuario_id: message.userId, contenido_mensaje: jsonValue(message.content) },
      })
    },
    lockProposal: (id) => oneProposal(db, Prisma.sql`p.propuesta_ia_plantilla_id = ${id}::uuid`, true),
    async decideProposal(id, state, actorId, at) {
      await db.propuestas_ia_plantilla.updateMany({ where: { propuesta_ia_plantilla_id: id }, data: { estado_propuesta: state, decidida_por: actorId, decidida_en: new Date(at * 1000) } })
    },
    lockMessage: (id) => oneMessage(db, Prisma.sql`m.mensaje_ia_plantilla_id = ${id}::uuid`, true),
    async updateMessage(id, value) {
      await db.mensajes_ia_plantilla.updateMany({ where: { mensaje_ia_plantilla_id: id }, data: { contenido_mensaje: jsonValue(value) } })
    },
    async replacePendingProposals(templateId, userId) {
      await db.propuestas_ia_plantilla.updateMany({ where: { plantilla_id: templateId, solicitada_por: userId, estado_propuesta: "pendiente" }, data: { estado_propuesta: "reemplazada" } })
    },
    async insertProposal(proposal) {
      await db.propuestas_ia_plantilla.create({
        data: {
          propuesta_ia_plantilla_id: proposal.id,
          plantilla_id: proposal.templateId,
          mensaje_ia_plantilla_id: proposal.messageId,
          solicitada_por: proposal.requestedBy,
          estructura_propuesta: jsonValue(proposal.structure),
          cambios_propuesta: jsonValue(proposal.changes),
          huella_plantilla_base: proposal.fingerprint,
          version_borrador_propuesta: proposal.draftVersion,
          estado_propuesta: "pendiente",
        },
      })
    },
  }
}

async function processExists(db: Db, state: string): Promise<boolean> {
  return hasRow(db.convocatorias_universidad.findMany({ where: { estado_convocatoria_universidad: state }, select: { convocatoria_universidad_id: true }, take: 1 }))
}

export function assistantStoreOn(db: Db, transaction: <T>(work: (tx: AssistantTx) => Promise<T>) => Promise<T>): AssistantStore {
  return {
    template: (): Promise<SyllabusTemplate | null> => loadTemplateFrom(db),
    async conversation(templateId, userId): Promise<ConversationEntry[]> {
      const found = (await db.$queryRaw<MessageRow[]>`${MESSAGE} where ${conversationOf(templateId, userId)} order by m.enviado_en asc`).map(messageOf)
      if (found.length === 0) return []
      const ids = found.map((message) => message.id)
      const offers = (await db.$queryRaw<ProposalRow[]>`${PROPOSAL} where p.mensaje_ia_plantilla_id = any(${ids}::uuid[])`).map(proposalOf)
      return found.map((message) => ({ ...message, proposal: offers.find((proposal) => proposal.messageId === message.id) ?? null }))
    },
    conversationBusy: (templateId, userId) => busy(db, templateId, userId),
    async hideConversation(templateId, userId, at) {
      await db.mensajes_ia_plantilla.updateMany({ where: { plantilla_id: templateId, usuario_id: userId, ocultado_en: null }, data: { ocultado_en: new Date(at * 1000) } })
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
          and m.mensaje_ia_plantilla_id <> all(${[message.id, questionId]}::uuid[])
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

@Injectable()
export class AssistantRepository {
  readonly store: AssistantStore

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.store = assistantStoreOn(prisma, (work) => prisma.$transaction((tx) => work(assistantTxOn(tx)), TRANSACTION_OPTIONS))
  }
}
