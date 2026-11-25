import type { RoleAssignmentRecord } from "./types"

export const ROLE_COORDINATOR = "coordinador"

export function isEligible(assignment: RoleAssignmentRecord): boolean {
  return assignment.role !== ROLE_COORDINATOR || assignment.careerId !== null
}

export function eligibleAssignments(effective: RoleAssignmentRecord[]): RoleAssignmentRecord[] {
  return effective.filter(isEligible)
}

export type ActiveRoleResolution = {
  assignment: RoleAssignmentRecord | null
  writesSession: boolean
}

export function resolveActiveRole(sessionRoleId: unknown, eligible: RoleAssignmentRecord[]): ActiveRoleResolution {
  const sole = eligible.length === 1 ? eligible[0] : null
  if (typeof sessionRoleId !== "string") {
    return { assignment: sole, writesSession: sole !== null }
  }
  const current = eligible.find((assignment) => assignment.id === sessionRoleId)
  if (current) return { assignment: current, writesSession: false }
  return { assignment: sole, writesSession: true }
}
