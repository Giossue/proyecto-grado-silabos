import { requireSession } from "../auth/requireSession"
import type { AppSession, SessionUser } from "../auth/types"
import { isPhpArray, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, jsonError, apiJson, serverError, unauthenticated, validationError } from "../http/responses"
import type { Throttle } from "../http/throttle"
import { accessibilitySchema, profileSchema, teacherFormationSchema } from "@silabos/shared/schemas/account"
import { passwordConfirmationSchema } from "@silabos/shared/schemas/auth"
import { validateSchema } from "../http/schemaValidation"
import { phpBoolean } from "./accountRules"
import { issueInvitation, revokeSessions, updateManagedUserProfile, updateTeacherFormation, type Accessibility, type Account } from "./accounts"
import {
  isAdministrator,
  passwordRecoveryThrottle,
  perform,
  stringOf,
  uniqueEmail,
  type IdentityWriteDeps,
} from "./accountWrites"
import { sessionPayload } from "./session"

async function answerSession(deps: IdentityWriteDeps, session: AppSession, original: Request, accessibility?: Accessibility): Promise<Response> {
  const profile = await deps.session.profiles.find(session.user.id)
  if (profile === null) return unauthenticated()
  const payload = sessionPayload(session, profile, deps.session)
  if (accessibility !== undefined) payload.user.accessibility = accessibility
  return apiJson(payload)
}

export async function updateProfile(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isAdministrator(session)) return forbidden()
  const input = await requestInput(request)
  const { errors } = await validateSchema(profileSchema(uniqueEmail(deps, session.user.id)), input)
  if (errors !== null) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) =>
    updateManagedUserProfile(ctx, session.user, { name: stringOf(input.nombre), email: stringOf(input.correo_electronico) }),
  )
  if (outcome instanceof Response) return outcome
  return answerSession(deps, session, original)
}

export async function updateAccessibility(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "optional" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active) return forbidden()
  const input = await requestInput(request)
  const { errors } = await validateSchema(accessibilitySchema, input)
  if (errors !== null) return validationError(errors)
  const preferences: Accessibility = {
    high_contrast: phpBoolean(input.high_contrast),
    text_size: stringOf(input.text_size),
    no_motion: phpBoolean(input.no_motion),
    dyslexia: phpBoolean(input.dyslexia),
  }
  await deps.accounts.direct((tx) => tx.setAccessibility(session.user.id, preferences))
  return answerSession(deps, session, original, preferences)
}

export async function updateFormation(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active) return forbidden()
  const input = await requestInput(request)
  const { errors } = await validateSchema(teacherFormationSchema, input)
  if (errors !== null) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) => updateTeacherFormation(ctx, session.user.id, stringOf(input.formacion_experiencia)))
  if (outcome instanceof Response) return outcome
  return answerSession(deps, session, original)
}

const RESEND_MESSAGE = "Si su cuenta aún no estaba activada, se envió un enlace de activación."

export async function resendOwnActivation(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const original = request.clone()
  let gate: Throttle | null = null
  const session = await requireSession(
    request,
    {
      activeRole: "optional",
      afterAuthentication: async () => {
        gate = passwordRecoveryThrottle(deps, request, await requestInput(request.clone()))
        return gate.hit()
      },
    },
    deps.bridge,
  )
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  if (session instanceof Response) return finish(session)
  if (session.user.emailVerifiedAt === null) {
    const issuer = await deps.accounts.direct((tx) => tx.latestInvitationIssuer(session.user.id))
    const target = { id: session.user.id } as Account
    const outcome = await perform(deps, original, session, (ctx) => issueInvitation(ctx, target), issuer?.id ?? session.user.id)
    if (outcome instanceof Response) return finish(outcome)
  }
  return finish(apiJson({ message: RESEND_MESSAGE }, 202))
}

export async function destroySession(request: Request, id: string, deps: IdentityWriteDeps): Promise<Response> {
  const session = await requireSession(request, {}, deps.bridge)
  if (session instanceof Response) return session
  if (session.session.id === id) return jsonError(422, "La sesión actual se cierra desde la opción Cerrar sesión.")
  const userId = session.user.id
  await deps.accounts.direct(async (tx) => {
    await tx.deleteSession(id, userId)
  })
  return apiJson({ message: "La sesión seleccionada fue cerrada." })
}

const scalarPassword = (value: PhpValue | undefined): string | null => {
  if (value === undefined || value === null || isPhpArray(value)) return null
  if (value === true) return "1"
  if (value === false) return ""
  return String(value)
}

async function confirmCurrentPassword(input: PhpArray, user: SessionUser, deps: IdentityWriteDeps): Promise<Record<string, string[]> | null> {
  if (isPhpArray(input.current_password ?? null)) return null
  const plain = scalarPassword(input.current_password)
  const matches = plain === null ? false : await deps.verifyPassword(plain, user.passwordHash)
  if (matches === null) return null
  return (await validateSchema(passwordConfirmationSchema(matches), input)).errors ?? {}
}

const closedMessage = (closed: number) => ({
  message: closed === 1 ? "Se cerró una sesión adicional." : `Se cerraron ${closed} sesiones adicionales.`,
  closed_sessions: closed,
})

export async function destroyOtherSessions(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const session = await requireSession(request, {}, deps.bridge)
  if (session instanceof Response) return session
  const errors = await confirmCurrentPassword(await requestInput(request), session.user, deps)
  if (errors === null) return serverError()
  if (Object.keys(errors).length > 0) return validationError(errors)
  const closed = await deps.accounts.direct((tx) => revokeSessions({ tx }, session.user.id, session.session.id))
  return apiJson(closedMessage(closed))
}
