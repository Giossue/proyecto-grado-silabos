import type { AppSession } from "../auth/types"

export const ROLE_TEACHER = "docente"
export const ROLE_COORDINATOR = "coordinador"
export const ROLE_LIBRARIAN = "bibliotecario"
export const ROLE_ADMINISTRATOR = "administrador"
export const EDITABLE_STATES = ["borrador", "correccion_solicitada"]
export const CONVOCATION_OPEN = "abierto"
export const CONVOCATION_PAUSED = "pausado"
export const PROCESS_OPEN = "abierto"
export const PROCESS_PAUSED = "pausado"

export type SyllabusFacts = {
  id: string
  state: string
  careerId: string
  convocationState: string
  processState: string
  dueOn: string
  currentTeacher: boolean
  writtenByUser: boolean
  hasLibrarySubmission: boolean
  started?: boolean
}

export function editableState(state: string, started: boolean): boolean {
  return EDITABLE_STATES.includes(state) || (state === "sin_iniciar" && started)
}

export function hasRole(session: AppSession, role: string): boolean {
  return session.user.active && session.activeRole?.role === role
}

function isReviewer(session: AppSession, facts: SyllabusFacts): boolean {
  const role = session.activeRole
  if (role === null) return false
  if (role.role === ROLE_COORDINATOR) return role.careerId === facts.careerId
  if (role.role === ROLE_LIBRARIAN) return facts.hasLibrarySubmission
  return false
}

export function mayView(session: AppSession, facts: SyllabusFacts): boolean {
  const role = session.activeRole
  if (!session.user.active || role === null) return false
  if (isReviewer(session, facts)) return true
  if (role.role !== ROLE_TEACHER || role.careerId !== facts.careerId) return false
  return facts.currentTeacher || facts.writtenByUser
}

function isCurrentTeacher(session: AppSession, facts: SyllabusFacts): boolean {
  const role = session.activeRole
  return session.user.active && role?.role === ROLE_TEACHER && role.careerId === facts.careerId && facts.currentTeacher
}

function canTeacherEdit(session: AppSession, facts: SyllabusFacts, today: string, enforceDeadline: boolean): boolean {
  if (!isCurrentTeacher(session, facts)) return false
  return isRunning(facts) && (!enforceDeadline || !(today > facts.dueOn))
}

export function mayEdit(session: AppSession, facts: SyllabusFacts, today: string): boolean {
  return canTeacherEdit(session, facts, today, true) && editableState(facts.state, facts.started === true)
}

export function mayStart(session: AppSession, facts: SyllabusFacts, today: string): boolean {
  return canTeacherEdit(session, facts, today, true) && facts.state === "sin_iniciar"
}

export function isRunning(facts: Pick<SyllabusFacts, "convocationState" | "processState">): boolean {
  return facts.convocationState === CONVOCATION_OPEN && facts.processState === PROCESS_OPEN
}

export function mayReview(session: AppSession, facts: SyllabusFacts): boolean {
  return session.user.active && session.activeRole !== null && isReviewer(session, facts)
}

const DECISIONS_CLOSED = "El proceso de sílabos está cerrado: la revisión queda solo para consulta y no admite decisiones."

export function convocationAllowsDecisions(state: string): boolean {
  return state === CONVOCATION_OPEN || state === CONVOCATION_PAUSED
}

export function decisionBlock(facts: Pick<SyllabusFacts, "convocationState" | "processState">): string | null {
  if (!convocationAllowsDecisions(facts.convocationState)) return DECISIONS_CLOSED
  if (facts.convocationState === CONVOCATION_PAUSED) return "El proceso de sílabos de la carrera está en pausa: las revisiones se retoman cuando se reanude."
  if (facts.processState === PROCESS_PAUSED) return "Administración pausó el proceso de sílabos: las revisiones se retoman cuando se reanude."
  return null
}
