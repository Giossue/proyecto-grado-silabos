import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { requestInput } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { careerTeacherSchema } from "@silabos/shared/schemas/people"
import { validateSchema } from "../http/schemaValidation"
import { collapseNameColumns, fullName, ROLE_ADMINISTRATOR, ROLE_COORDINATOR, ROLE_TEACHER } from "./accountRules"
import { createCareerTeacher, RESEND, removeCareerTeacher, resendActivation, type Account } from "./accounts"
import { bindAccount, defaultIdentityWriteDeps, perform, stringOf, type IdentityWriteDeps } from "./accountWrites"

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

async function mayAddTeachers(session: AppSession, deps: IdentityWriteDeps): Promise<boolean> {
  const role = session.activeRole
  return session.user.active && role?.role === ROLE_COORDINATOR && role.careerId !== null && (await deps.accounts.activeCareer(role.careerId))
}

async function teachesInCareer(session: AppSession, target: Account, deps: IdentityWriteDeps): Promise<boolean> {
  const careerId = session.activeRole?.careerId ?? null
  return careerId !== null && deps.accounts.hasEffectiveRole(target.id, ROLE_TEACHER, careerId)
}

async function mayResend(session: AppSession, target: Account, deps: IdentityWriteDeps): Promise<boolean> {
  if (!session.user.active || session.user.id === target.id || !target.active || target.verified) return false
  if (session.activeRole?.role === ROLE_ADMINISTRATOR) return true
  return session.activeRole?.role === ROLE_COORDINATOR && (await teachesInCareer(session, target, deps))
}

export async function storeCareerTeacher(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!(await mayAddTeachers(session, deps))) return forbidden()
  const input = collapseNameColumns(await requestInput(request))
  if (typeof input.correo_electronico === "string") input.correo_electronico = input.correo_electronico.replace(PHP_TRIM, "").toLowerCase()
  const { errors } = await validateSchema(careerTeacherSchema(), input)
  if (errors !== null) return validationError(errors)
  const careerId = session.activeRole?.careerId as string
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

export async function destroyCareerTeacher(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  if (!(await mayAddTeachers(session, deps)) || !target.active || !(await teachesInCareer(session, target, deps))) return forbidden()
  const careerId = session.activeRole?.careerId as string
  const outcome = await perform(deps, original, session, (ctx) => removeCareerTeacher(ctx, target, careerId))
  if (outcome instanceof Response) return outcome
  const count = outcome.value
  const message =
    count === 0
      ? "Docente retirado de su carrera."
      : count === 1
        ? "Docente retirado de su carrera; su paralelo quedó sin docente."
        : `Docente retirado de su carrera; sus ${count} paralelos quedaron sin docente.`
  return apiJson({ message })
}

export async function resendCareerTeacherActivation(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps, { throttled: true })
  if (bound instanceof Response) return bound
  const { session, target, original, finish } = bound
  if (!(await mayResend(session, target, deps))) return finish(forbidden())
  const outcome = await perform(deps, original, session, (ctx) => resendActivation(ctx, target, RESEND))
  if (outcome instanceof Response) return finish(outcome)
  return finish(apiJson({ message: `Invitación de activación enviada a ${target.email}.` }))
}
