import type { LaravelSession } from "../auth/types"

export const ROLE_TEACHER = "docente"
export const ROLE_COORDINATOR = "coordinador"
export const ROLE_LIBRARIAN = "bibliotecario"
export const ROLE_ADMINISTRATOR = "administrador"
export const EDITABLE_STATES = ["borrador", "correccion_solicitada"]
export const CONVOCATION_OPEN = "abierta"
export const CONVOCATION_PAUSED = "pausada"
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
}

export function hasRole(session: LaravelSession, role: string): boolean {
  return session.user.active && session.activeRole?.role === role
}

function isReviewer(session: LaravelSession, facts: SyllabusFacts): boolean {
  const role = session.activeRole
  if (role === null) return false
  if (role.role === ROLE_COORDINATOR) return role.careerId === facts.careerId
  if (role.role === ROLE_LIBRARIAN) return facts.hasLibrarySubmission
  return false
}

export function mayView(session: LaravelSession, facts: SyllabusFacts): boolean {
  const role = session.activeRole
  if (!session.user.active || role === null) return false
  if (isReviewer(session, facts)) return true
  if (role.role !== ROLE_TEACHER || role.careerId !== facts.careerId) return false
  return facts.currentTeacher || facts.writtenByUser
}

function isCurrentTeacher(session: LaravelSession, facts: SyllabusFacts): boolean {
  const role = session.activeRole
  return session.user.active && role?.role === ROLE_TEACHER && role.careerId === facts.careerId && facts.currentTeacher
}

function canTeacherEdit(session: LaravelSession, facts: SyllabusFacts, today: string, enforceDeadline: boolean): boolean {
  if (!isCurrentTeacher(session, facts)) return false
  return isRunning(facts) && (!enforceDeadline || !(today > facts.dueOn))
}

export function mayEdit(session: LaravelSession, facts: SyllabusFacts, today: string): boolean {
  return canTeacherEdit(session, facts, today, true) && EDITABLE_STATES.includes(facts.state)
}

export function mayStart(session: LaravelSession, facts: SyllabusFacts, today: string): boolean {
  return canTeacherEdit(session, facts, today, true) && facts.state === "sin_iniciar"
}

export function isRunning(facts: Pick<SyllabusFacts, "convocationState" | "processState">): boolean {
  return facts.convocationState === CONVOCATION_OPEN && facts.processState === PROCESS_OPEN
}

export function mayReview(session: LaravelSession, facts: SyllabusFacts): boolean {
  return session.user.active && session.activeRole !== null && isReviewer(session, facts)
}

const DECISIONS_CLOSED = "La convocatoria está cerrada: la revisión queda solo para consulta y no admite decisiones."

export function convocationAllowsDecisions(state: string): boolean {
  return state === CONVOCATION_OPEN || state === CONVOCATION_PAUSED
}

export function decisionBlock(facts: Pick<SyllabusFacts, "convocationState" | "processState">): string | null {
  if (!convocationAllowsDecisions(facts.convocationState)) return DECISIONS_CLOSED
  if (facts.convocationState === CONVOCATION_PAUSED) return "La convocatoria de la carrera está en pausa: las revisiones se retoman cuando se reanude."
  if (facts.processState === PROCESS_PAUSED) return "Administración pausó la convocatoria institucional: las revisiones se retoman cuando se reanude."
  return null
}
