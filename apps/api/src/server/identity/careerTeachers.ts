import { activeCareerId, resolveCareerScope } from "../academic/careerScope"
import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { Missing } from "../http/failures"
import { requestInput } from "../http/input"
import { MODELS } from "../http/models"
import { forbidden, apiJson, validationError } from "../http/responses"
import { careerTeacherSchema } from "@silabos/shared/schemas/people"
import { validateSchema } from "../http/schemaValidation"
import { collapseNameColumns, fullName, ROLE_ADMINISTRATOR, ROLE_COORDINATOR, ROLE_TEACHER } from "./accountRules"
import { createCareerTeacher, RESEND, removeCareerTeacher, resendActivation, type Account } from "./accounts"
import { bindAccount, perform, stringOf, type IdentityWriteDeps } from "./accountWrites"

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

function teacherCareer(session: AppSession, deps: IdentityWriteDeps, requestedCareerId: string | null): Promise<string | Response> {
  return resolveCareerScope(session, requestedCareerId, activeCareerId((careerId) => deps.accounts.activeCareer(careerId)))
}

async function teachesInCareer(careerId: string | null, target: Account, deps: IdentityWriteDeps): Promise<boolean> {
  return careerId !== null && deps.accounts.hasEffectiveRole(target.id, ROLE_TEACHER, careerId)
}

async function mayResend(session: AppSession, target: Account, deps: IdentityWriteDeps, requestedCareerId: string | null): Promise<boolean | Response> {
  const careerId = requestedCareerId === null ? (session.activeRole?.careerId ?? null) : await teacherCareer(session, deps, requestedCareerId)
  if (careerId instanceof Response) return careerId
  if (!session.user.active || session.user.id === target.id || !target.active || target.verified) return false
  if (session.activeRole?.role === ROLE_ADMINISTRATOR) return true
  return session.activeRole?.role === ROLE_COORDINATOR && (await teachesInCareer(careerId, target, deps))
}

export async function storeCareerTeacher(request: Request, deps: IdentityWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const careerId = await teacherCareer(session, deps, requestedCareerId)
  if (careerId instanceof Response) return careerId
  const input = collapseNameColumns(await requestInput(request))
  if (typeof input.correo_electronico === "string") input.correo_electronico = input.correo_electronico.replace(PHP_TRIM, "").toLowerCase()
  const { errors } = await validateSchema(careerTeacherSchema(), input)
  if (errors !== null) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) =>
    createCareerTeacher(ctx, { name: fullName(stringOf(input.nombres), stringOf(input.apellidos)), email: stringOf(input.correo_electronico) }, careerId),
  )
  if (outcome instanceof Response) return outcome
  const { created, attached } = outcome.value
  const message = created
    ? "Docente creado para su carrera. Recibirá un enlace de activación por correo."
    : attached
      ? "Docente incorporado a su carrera. Conserva su nombre y acceso actuales."
      : "El docente ya está disponible en su carrera. Conserva su nombre y acceso actuales."
  return apiJson({ message })
}

export async function destroyCareerTeacher(request: Request, id: string, deps: IdentityWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  const careerId = await teacherCareer(session, deps, requestedCareerId)
  if (careerId instanceof Response) return careerId
  if (!target.active || !(await teachesInCareer(careerId, target, deps))) return forbidden()
  const outcome = await perform(deps, original, session, (ctx) => removeCareerTeacher(ctx, target, careerId))
  if (outcome instanceof Response) return outcome
  const count = outcome.value
  const message =
    count === 0
      ? "Docente desactivado en su carrera."
      : count === 1
        ? "Docente desactivado en su carrera; su paralelo quedó sin docente."
        : `Docente desactivado en su carrera; sus ${count} paralelos quedaron sin docente.`
  return apiJson({ message })
}

/** Gives a deactivated teacher the career back; their parallels are assigned again by hand. */
export async function reactivateCareerTeacher(request: Request, id: string, deps: IdentityWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  const careerId = await teacherCareer(session, deps, requestedCareerId)
  if (careerId instanceof Response) return careerId
  // Only someone who already taught here: adding anybody else goes through the teacher form, by email.
  if (!target.active || (await deps.accounts.direct((tx) => tx.findGrant(target.id, ROLE_TEACHER, careerId, true))) === null) return forbidden()
  const outcome = await perform(deps, original, session, async (ctx) => {
    // createCareerTeacher finds the account by email: lock it first, so the address cannot stop being this teacher's.
    if ((await ctx.tx.lockAccountByEmail(target.email.toLowerCase()))?.id !== target.id) throw new Missing(MODELS.user, target.id)
    return createCareerTeacher(ctx, { name: target.name, email: target.email }, careerId)
  })
  if (outcome instanceof Response) return outcome
  return apiJson({ message: "Docente reactivado en su carrera." })
}

export async function resendCareerTeacherActivation(request: Request, id: string, deps: IdentityWriteDeps, requestedCareerId: string | null = null): Promise<Response> {
  const bound = await bindAccount(request, id, deps, { throttled: true })
  if (bound instanceof Response) return bound
  const { session, target, original, finish } = bound
  const allowed = await mayResend(session, target, deps, requestedCareerId)
  if (allowed instanceof Response) return finish(allowed)
  if (!allowed) return finish(forbidden())
  const outcome = await perform(deps, original, session, (ctx) => resendActivation(ctx, target, RESEND))
  if (outcome instanceof Response) return finish(outcome)
  return finish(apiJson({ message: `Invitación de activación enviada a ${target.email}.` }))
}
