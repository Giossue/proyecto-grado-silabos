import type { AppSession } from "../auth/types"
import { MODELS } from "../http/models"
import { forbidden } from "../http/responses"
import { modelNotFound } from "../http/router"
import { ROLE_ADMINISTRATOR, ROLE_COORDINATOR } from "../identity/accountRules"

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export async function resolveCareerScope<T>(
  session: AppSession,
  requestedCareerId: string | null,
  load: (careerId: string) => Promise<T | null>,
  refusal: () => Response = forbidden,
): Promise<T | Response> {
  const role = session.activeRole
  if (!session.user.active || role === null) return refusal()
  if (role.role === ROLE_ADMINISTRATOR) {
    if (requestedCareerId === null) return refusal()
    const career = UUID.test(requestedCareerId) ? await load(requestedCareerId) : null
    return career ?? modelNotFound(MODELS.career, requestedCareerId)
  }
  if (role.role !== ROLE_COORDINATOR || role.careerId === null) return refusal()
  if (requestedCareerId !== null && requestedCareerId !== role.careerId) return refusal()
  return (await load(role.careerId)) ?? refusal()
}

export function activeCareerId(careerActive: (careerId: string) => Promise<boolean>): (careerId: string) => Promise<string | null> {
  return async (careerId) => ((await careerActive(careerId)) ? careerId : null)
}
