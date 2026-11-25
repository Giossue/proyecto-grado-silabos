import "server-only"
import { and, asc, desc, eq, inArray, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm"
import { db, type Executor } from "@/db"
import { fromEpoch, hasRows, isoText, jsonbValue, jsonText } from "@/db/expressions"
import { convocatoriasUniversidad, mensajesIaPlantilla, plantillaSilabo, propuestasIaPlantilla } from "@/db/schema"
import { phpJsonDecode, phpShape, record, type PhpRecord } from "../configuration/phpValues"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { loadTemplate } from "../configuration/templateStore"
import { phpJsonEncode } from "../http/phpJson"

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

const MESSAGE = {
  id: mensajesIaPlantilla.mensajeIaPlantillaId,
  templateId: mensajesIaPlantilla.plantillaId,
  userId: mensajesIaPlantilla.usuarioId,
  content: jsonText(mensajesIaPlantilla.contenidoMensaje),
  sentAt: isoText(mensajesIaPlantilla.enviadoEn),
  hiddenAt: isoText(mensajesIaPlantilla.ocultadoEn) as SQL<string | null>,
}

const PROPOSAL = {
  id: propuestasIaPlantilla.propuestaIaPlantillaId,
  templateId: propuestasIaPlantilla.plantillaId,
  messageId: propuestasIaPlantilla.mensajeIaPlantillaId,
  requestedBy: propuestasIaPlantilla.solicitadaPor,
  structure: jsonText(propuestasIaPlantilla.estructuraPropuesta),
  changes: jsonText(propuestasIaPlantilla.cambiosPropuesta),
  fingerprint: propuestasIaPlantilla.huellaPlantillaBase,
  draftVersion: propuestasIaPlantilla.versionBorradorPropuesta,
  state: propuestasIaPlantilla.estadoPropuesta,
  decidedBy: propuestasIaPlantilla.decididaPor,
  createdAt: isoText(propuestasIaPlantilla.creadaEn),
}

type MessageRow = { id: string; templateId: string; userId: string; content: string | null; sentAt: string; hiddenAt: string | null }

type ProposalRow = Omit<StoredProposal, "structure" | "changes"> & { structure: string | null; changes: string | null }

function messageOf(row: MessageRow): StoredMessage {
  return { ...row, content: record(phpJsonDecode(row.content)) }
}

function proposalOf(row: ProposalRow): StoredProposal {
  return { ...row, structure: record(phpJsonDecode(row.structure)), changes: record(phpJsonDecode(row.changes)) }
}

export function jsonbOf(value: unknown): SQL {
  return jsonbValue(phpJsonEncode(phpShape(value)))
}

const conversationOf = (templateId: string, userId: string) =>
  and(eq(mensajesIaPlantilla.plantillaId, templateId), eq(mensajesIaPlantilla.usuarioId, userId), isNull(mensajesIaPlantilla.ocultadoEn))

const content = (path: string[]) =>
  sql`(${mensajesIaPlantilla.contenidoMensaje}${sql.raw(path.slice(0, -1).map((key) => ` -> '${key}'`).join(""))} ->> ${sql.raw(`'${path[path.length - 1]}'`)})`

function busy(executor: Executor, templateId: string, userId: string): Promise<boolean> {
  return hasRows(
    executor
      .select({ id: mensajesIaPlantilla.mensajeIaPlantillaId })
      .from(mensajesIaPlantilla)
      .where(and(conversationOf(templateId, userId), inArray(content(["estado"]), OPEN_STATES)))
      .limit(1),
  )
}

const messages = (executor: Executor) => executor.select(MESSAGE).from(mensajesIaPlantilla)
const proposals = (executor: Executor) => executor.select(PROPOSAL).from(propuestasIaPlantilla)

export function assistantTx(executor: Executor): AssistantTx {
  return {
    async lockTemplateId() {
      const [row] = await executor.select({ id: plantillaSilabo.plantillaId }).from(plantillaSilabo).limit(1).for("update")
      return row?.id ?? null
    },
    async questionByKey(templateId, userId, key) {
      const [row] = await executor
        .select({ id: mensajesIaPlantilla.mensajeIaPlantillaId })
        .from(mensajesIaPlantilla)
        .where(
          and(
            eq(mensajesIaPlantilla.plantillaId, templateId),
            eq(mensajesIaPlantilla.usuarioId, userId),
            eq(content(["rol"]), "usuario"),
            eq(content(["entrada", "clave_idempotencia"]), key),
          ),
        )
        .limit(1)
      return row?.id ?? null
    },
    async answerTo(questionId) {
      const [row] = await executor
        .select({ id: mensajesIaPlantilla.mensajeIaPlantillaId })
        .from(mensajesIaPlantilla)
        .where(eq(content(["entrada", "respuesta_a_id"]), questionId))
        .limit(1)
      return row?.id ?? null
    },
    conversationBusy: (templateId, userId) => busy(executor, templateId, userId),
    async insertMessage(message) {
      await executor.insert(mensajesIaPlantilla).values({
        mensajeIaPlantillaId: message.id,
        plantillaId: message.templateId,
        usuarioId: message.userId,
        contenidoMensaje: jsonbOf(message.content),
      })
    },
    async lockProposal(id) {
      const [row] = await proposals(executor).where(eq(propuestasIaPlantilla.propuestaIaPlantillaId, id)).limit(1).for("update")
      return row ? proposalOf(row) : null
    },
    async decideProposal(id, state, actorId, at) {
      await executor
        .update(propuestasIaPlantilla)
        .set({ estadoPropuesta: state, decididaPor: actorId, decididaEn: fromEpoch(at) })
        .where(eq(propuestasIaPlantilla.propuestaIaPlantillaId, id))
    },
    async lockMessage(id) {
      const [row] = await messages(executor).where(eq(mensajesIaPlantilla.mensajeIaPlantillaId, id)).limit(1).for("update")
      return row ? messageOf(row) : null
    },
    async updateMessage(id, value) {
      await executor.update(mensajesIaPlantilla).set({ contenidoMensaje: jsonbOf(value) }).where(eq(mensajesIaPlantilla.mensajeIaPlantillaId, id))
    },
    async replacePendingProposals(templateId, userId) {
      await executor
        .update(propuestasIaPlantilla)
        .set({ estadoPropuesta: "reemplazada" })
        .where(
          and(
            eq(propuestasIaPlantilla.plantillaId, templateId),
            eq(propuestasIaPlantilla.solicitadaPor, userId),
            eq(propuestasIaPlantilla.estadoPropuesta, "pendiente"),
          ),
        )
    },
    async insertProposal(proposal) {
      await executor.insert(propuestasIaPlantilla).values({
        propuestaIaPlantillaId: proposal.id,
        plantillaId: proposal.templateId,
        mensajeIaPlantillaId: proposal.messageId,
        solicitadaPor: proposal.requestedBy,
        estructuraPropuesta: jsonbOf(proposal.structure),
        cambiosPropuesta: jsonbOf(proposal.changes),
        huellaPlantillaBase: proposal.fingerprint,
        versionBorradorPropuesta: proposal.draftVersion,
        estadoPropuesta: "pendiente",
      })
    },
  }
}

export function assistantStoreOn(executor: Executor, transaction: <T>(work: (tx: AssistantTx) => Promise<T>) => Promise<T>): AssistantStore {
  return {
    template: () => loadTemplate(executor),
    async conversation(templateId, userId) {
      const found = (await messages(executor).where(conversationOf(templateId, userId)).orderBy(asc(mensajesIaPlantilla.enviadoEn))).map(messageOf)
      if (found.length === 0) return []
      const offers = (
        await proposals(executor).where(
          inArray(
            propuestasIaPlantilla.mensajeIaPlantillaId,
            found.map((message) => message.id),
          ),
        )
      ).map(proposalOf)
      return found.map((message) => ({ ...message, proposal: offers.find((proposal) => proposal.messageId === message.id) ?? null }))
    },
    conversationBusy: (templateId, userId) => busy(executor, templateId, userId),
    async hideConversation(templateId, userId, at) {
      await executor.update(mensajesIaPlantilla).set({ ocultadoEn: fromEpoch(at) }).where(conversationOf(templateId, userId))
    },
    openProcess: () =>
      hasRows(
        executor
          .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
          .from(convocatoriasUniversidad)
          .where(eq(convocatoriasUniversidad.estadoConvocatoriaUniversidad, "abierto"))
          .limit(1),
      ),
    async processState() {
      for (const [state, name] of [
        ["abierto", "abierta"],
        ["pausado", "pausada"],
      ]) {
        const found = await hasRows(
          executor
            .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
            .from(convocatoriasUniversidad)
            .where(eq(convocatoriasUniversidad.estadoConvocatoriaUniversidad, state))
            .limit(1),
        )
        if (found) return name
      }
      return "ninguna"
    },
    async proposal(id) {
      const [row] = await proposals(executor).where(eq(propuestasIaPlantilla.propuestaIaPlantillaId, id)).limit(1)
      return row ? proposalOf(row) : null
    },
    async message(id) {
      const [row] = await messages(executor).where(eq(mensajesIaPlantilla.mensajeIaPlantillaId, id)).limit(1)
      return row ? messageOf(row) : null
    },
    async history(message, questionId, limit) {
      const question = executor
        .select({ sentAt: mensajesIaPlantilla.enviadoEn })
        .from(mensajesIaPlantilla)
        .where(eq(mensajesIaPlantilla.mensajeIaPlantillaId, questionId))
        .limit(1)
      const found = await messages(executor)
        .where(
          and(
            conversationOf(message.templateId, message.userId),
            notInArray(mensajesIaPlantilla.mensajeIaPlantillaId, [message.id, questionId]),
            lt(mensajesIaPlantilla.enviadoEn, sql`${question}`),
            eq(content(["estado"]), "completado"),
          ),
        )
        .orderBy(desc(mensajesIaPlantilla.enviadoEn))
        .limit(limit)
      return found.map(messageOf)
    },
    async lastProposal(templateId, userId) {
      const [row] = await proposals(executor)
        .where(and(eq(propuestasIaPlantilla.plantillaId, templateId), eq(propuestasIaPlantilla.solicitadaPor, userId)))
        .orderBy(desc(propuestasIaPlantilla.creadaEn))
        .limit(1)
      return row ? proposalOf(row) : null
    },
    transaction,
  }
}

export function createAssistantStore(): AssistantStore {
  return assistantStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(assistantTx(tx as unknown as Executor))))
}
