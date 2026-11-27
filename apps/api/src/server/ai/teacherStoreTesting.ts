import { fakeTemplateStore } from "../configuration/testing"
import type { DraftSyllabus } from "../syllabus/draftField"
import { OPEN_ANSWER_STATES, proposalsOf, type TeacherAssistantStore, type TeacherAssistantTx, type TeacherMessage, type TeacherProposal } from "./teacherAssistantStore"
import type { SyllabusReading } from "./teacherContext"
import { SUBJECT_ID, teacherWorld, type TeacherWorld } from "./teacherTesting"

export const SYLLABUS_ID = "50000000-0000-4000-8000-000000000001"
export const OTHER_SYLLABUS_ID = "50000000-0000-4000-8000-000000000002"
export const CAREER_ID = "c0000000-0000-4000-8000-000000000001"

export type StoreWorld = TeacherWorld & {
  teachers: Map<string, string[]>
  facts: Omit<DraftSyllabus, "id" | "currentTeacher">
  version: number
  messages: TeacherMessage[]
  deleted: Set<string>
  clock: number
}

export function storeWorld(userId: string, allowed: string[] = []): StoreWorld {
  return {
    ...teacherWorld(allowed),
    teachers: new Map([
      [SYLLABUS_ID, [userId]],
      [OTHER_SYLLABUS_ID, [userId]],
    ]),
    facts: {
      state: "borrador",
      careerId: CAREER_ID,
      convocationState: "abierto",
      processState: "abierto",
      dueOn: "2099-12-31",
      writtenByUser: true,
      hasLibrarySubmission: false,
      subjectId: SUBJECT_ID,
    },
    version: 3,
    messages: [],
    deleted: new Set(),
    clock: 1_800_000_000,
  }
}

const copy = <T>(value: T): T => structuredClone(value)
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const open = (message: TeacherMessage) => message.role === "asistente" && OPEN_ANSWER_STATES.includes(message.state)

export function proposalsIn(world: StoreWorld): TeacherProposal[] {
  const conversations = new Map<string, TeacherMessage[]>()
  for (const message of world.messages) {
    const key = `${message.syllabusId}:${message.userId}`
    conversations.set(key, [...(conversations.get(key) ?? []), message])
  }
  return [...conversations.values()].flatMap((messages) => structuredClone(proposalsOf(messages)))
}

export function fakeTeacherStore(world: StoreWorld): TeacherAssistantStore {
  const reading: SyllabusReading = {
    templates: {
      template: () => fakeTemplateStore({ template: copy(world.template), values: world.subjectValues }).template(),
      subjectValues: (subjectId) => fakeTemplateStore({ template: world.template, values: world.subjectValues }).subjectValues(subjectId),
      valuesForSubjects: (subjects, fields) => fakeTemplateStore({ template: world.template, values: world.subjectValues }).valuesForSubjects(subjects, fields),
      liveFields: (ids, careerOnly) => fakeTemplateStore({ template: world.template, values: world.subjectValues }).liveFields(ids, careerOnly),
    },
    values: async () => copy(world.values),
    academicContext: async () => copy(world.context),
    allowedKeys: async () => new Set(world.allowed),
  }
  const locks = new Map<string, Promise<void>>()
  const mine = (syllabusId: string, userId: string) => world.messages.filter((message) => message.syllabusId === syllabusId && message.userId === userId)
  const found = <T extends { id: string }>(items: T[], id: string): T | null => copy(items.find((item) => item.id === id) ?? null)

  const transactionOn = (held: (() => void)[], writes: (() => void)[]): TeacherAssistantTx => {
    const write = (change: () => () => void) => writes.push(change())
    return {
      async lockConversation(syllabusId, userId) {
        const key = `${syllabusId}:${userId}`
        const previous = locks.get(key) ?? Promise.resolve()
        let release = () => {}
        locks.set(key, previous.then(() => new Promise<void>((resolve) => (release = resolve))))
        await previous
        held.push(() => release())
      },
      answerByKey: async (syllabusId, userId, key) => {
        await Promise.resolve()
        const question = mine(syllabusId, userId).find((message) => message.key === key)
        return question === undefined ? null : (world.messages.find((message) => message.replyTo === question.id)?.id ?? null)
      },
      openAnswer: async (syllabusId, userId) => {
        const result = copy(mine(syllabusId, userId).find(open) ?? null)
        await new Promise((resolve) => setTimeout(resolve, 1))
        return result
      },
      insertMessage: async (message) => {
        const row: TeacherMessage = { ...stored(message), sentFields: [], proposals: [], errorCode: null, createdAt: world.clock }
        if (open(row) && mine(row.syllabusId, row.userId).some(open)) throw new Error("mensajes_ia_pedido_abierto_unica")
        write(() => {
          world.messages.push(row)
          return () => void (world.messages = world.messages.filter((item) => item.id !== row.id))
        })
      },
      lockMessage: async (id) => found(world.messages, id),
      updateAnswer: async (id, change) => {
        write(() => {
          const before = copy(world.messages.find((message) => message.id === id)!)
          world.messages = world.messages.map((message) =>
            message.id === id ? { ...message, state: change.state, content: stored(change.content), sentFields: [...change.sentFields], proposals: stored(change.proposals), errorCode: change.errorCode } : message,
          )
          return () => void (world.messages = world.messages.map((message) => (message.id === id ? before : message)))
        })
      },
    }
  }

  return {
    reading,
    syllabus: async (id, userId) =>
      world.teachers.has(id) && !world.deleted.has(id) ? { ...world.facts, id, currentTeacher: world.teachers.get(id)!.includes(userId) } : null,
    message: async (id) => found(world.messages, id),
    conversation: async (syllabusId, userId, limit) => {
      const messages = copy(mine(syllabusId, userId).slice(-limit))
      return { messages, proposals: copy(proposalsOf(messages)) }
    },
    earlierTurns: async (question, limit) => {
      const own = mine(question.syllabusId, question.userId)
      const position = own.findIndex((message) => message.id === question.id)
      const answers = own
        .slice(0, position)
        .filter((message) => message.role === "asistente" && message.state === "completado")
        .slice(-limit)
      const proposals = proposalsOf(answers)
      return answers.map((answer) => ({
        question: String(own.find((message) => message.id === answer.replyTo)!.content.texto),
        answer: String(answer.content.texto),
        proposals: proposals.filter((proposal) => proposal.messageId === answer.id).map((proposal) => ({ label: proposal.target.fieldLabel, state: proposal.state, text: proposal.text })),
        sentFields: [...answer.sentFields],
      }))
    },
    async transaction(work) {
      const held: (() => void)[] = []
      const writes: (() => void)[] = []
      try {
        return await work(transactionOn(held, writes))
      } catch (error) {
        for (const undo of writes.reverse()) undo()
        throw error
      } finally {
        for (const release of held) release()
      }
    },
  }
}
