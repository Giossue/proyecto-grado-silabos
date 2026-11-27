import { eligibleAssignments } from "../auth/activeRole"
import type { AppSession, SessionStore } from "../auth/types"
import type { PhpRecord } from "../configuration/phpValues"
import type { DraftSyllabus } from "../syllabus/draftField"
import { mayEdit, ROLE_TEACHER } from "../syllabus/policy"
import { assistantAvailable, type AiConfig } from "./config"
import type { AiAgentGateway } from "./gateway"
import { NOT_ALLOWED, runTeacherAssistant, TEACHER_NOT_ALLOWED, TEACHER_UNAVAILABLE, type TeacherOutcome } from "./teacherAssistant"
import { OPEN_ANSWER_STATES, type TeacherAssistantStore, type TeacherMessage } from "./teacherAssistantStore"
import { readAssistantSnapshot } from "./teacherContext"
import { userTag } from "./templateAssistant"

export const HISTORY_TURNS = 6
export const JOB_FAILED = "asistente_fallido"
export const PSEUDONYM_PREFIX = "doc"

export type TeacherAccessDeps = { config: () => AiConfig; enabled: () => Promise<boolean> }
export type TeacherAnswerDeps = TeacherAccessDeps & {
  store: TeacherAssistantStore
  today: () => string
  teacherSession: (userId: string, careerId: string) => Promise<AppSession | null>
  gateway: (config: AiConfig) => AiAgentGateway
  appKey: () => string
  now: () => number
  newProposalId: () => string
}

export async function assistantSwitchedOn(deps: TeacherAccessDeps): Promise<boolean> {
  return (await deps.enabled()) && assistantAvailable(deps.config())
}

export function teacherSessionOn(sessions: SessionStore) {
  return async (userId: string, careerId: string): Promise<AppSession | null> => {
    const user = await sessions.findUser(userId)
    if (user === null || !user.active || user.emailVerifiedAt === null) return null
    const eligibleRoles = eligibleAssignments(await sessions.effectiveRoleAssignments(userId))
    const activeRole = eligibleRoles.find((assignment) => assignment.role === ROLE_TEACHER && assignment.careerId === careerId)
    if (activeRole === undefined) return null
    return { user, activeRole, eligibleRoles, session: { id: "", token: "", userId, activeRoleAssignmentId: activeRole.id, cookies: [] } }
  }
}

async function editableSyllabus(message: TeacherMessage, deps: TeacherAnswerDeps): Promise<DraftSyllabus | null> {
  if (!(await assistantSwitchedOn(deps))) return null
  const syllabus = await deps.store.syllabus(message.syllabusId, message.userId)
  if (syllabus === null) return null
  const session = await deps.teacherSession(message.userId, syllabus.careerId)
  return session !== null && mayEdit(session, syllabus, deps.today()) ? syllabus : null
}

const isOpen = (message: TeacherMessage | null): message is TeacherMessage => message !== null && message.role === "asistente" && OPEN_ANSWER_STATES.includes(message.state)

const failure = (error: string): PhpRecord => ({ texto: "", error })

async function close(messageId: string, deps: Pick<TeacherAnswerDeps, "store" | "now">, errorCode: string, error: string): Promise<void> {
  await deps.store.transaction(async (tx) => {
    const message = await tx.lockMessage(messageId)
    if (!isOpen(message)) return
    await tx.updateAnswer(messageId, { state: "fallido", content: failure(error), sentFields: [], errorCode, completedAt: deps.now() })
  })
}

async function complete(messageId: string, outcome: TeacherOutcome, deps: TeacherAnswerDeps): Promise<void> {
  await deps.store.transaction(async (tx) => {
    const message = await tx.lockMessage(messageId)
    if (!isOpen(message)) return
    const completed = outcome.status === "completado"
    await tx.updateAnswer(messageId, {
      state: outcome.status,
      content: {
        ...(completed ? { texto: outcome.message } : failure(outcome.message)),
        traza: outcome.trace,
        uso: outcome.usage,
        pasos: outcome.steps,
        version_pasarela: outcome.gatewayVersion,
      },
      sentFields: outcome.sentFields,
      errorCode: outcome.errorCode,
      completedAt: deps.now(),
    })
    if (outcome.proposals.length === 0) return
    await tx.replacePendingProposals(
      message.syllabusId,
      message.userId,
      outcome.proposals.map((proposal) => ({ fieldId: proposal.fieldId, space: proposal.target.space })),
    )
    for (const [position, proposal] of outcome.proposals.entries()) await tx.insertProposal({ ...proposal, id: deps.newProposalId(), messageId, position })
  })
}

export async function answerTeacherAssistant(messageId: string, deps: TeacherAnswerDeps): Promise<void> {
  const message = await deps.store.transaction(async (tx) => {
    const locked = await tx.lockMessage(messageId)
    if (!isOpen(locked)) return null
    await tx.updateAnswer(messageId, { state: "en_ejecucion", content: locked.content, sentFields: [], errorCode: null, completedAt: null })
    return locked
  })
  if (message === null) return
  const syllabus = await editableSyllabus(message, deps)
  if (syllabus === null) return close(messageId, deps, NOT_ALLOWED, TEACHER_NOT_ALLOWED)
  const question = message.replyTo === null ? null : await deps.store.message(message.replyTo)
  const snapshot = await readAssistantSnapshot(deps.store.reading, syllabus)
  if (question === null || question.syllabusId !== message.syllabusId || question.userId !== message.userId || snapshot === null) {
    return close(messageId, deps, JOB_FAILED, TEACHER_UNAVAILABLE)
  }
  const config = deps.config()
  const outcome = await runTeacherAssistant(
    { gateway: deps.gateway(config), config, permitted: async () => (await editableSyllabus(message, deps)) !== null },
    snapshot,
    String(question.content.texto ?? ""),
    await deps.store.earlierTurns(question, HISTORY_TURNS),
    userTag(message.userId, deps.appKey(), PSEUDONYM_PREFIX),
  )
  await complete(messageId, outcome, deps)
}

export function failTeacherAssistant(messageId: string, deps: Pick<TeacherAnswerDeps, "store" | "now">): Promise<void> {
  return close(messageId, deps, JOB_FAILED, TEACHER_UNAVAILABLE)
}
