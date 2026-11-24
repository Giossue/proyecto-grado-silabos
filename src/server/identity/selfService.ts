import "server-only"
import { authenticateAndTrack, commitTracking, requireSession } from "../auth/requireSession"
import { withWriter } from "../auth/sessionWriter"
import { controllerJson, FORWARD, fromController, statefulRequest, type Outcome } from "../auth/statefulRequest"
import type { LaravelSession, SessionUser } from "../auth/types"
import { parseCookieHeader } from "../laravel/cookies"
import { isPhpArray, laravelInput, type PhpArray, type PhpValue } from "../laravel/input"
import { forbidden, laravelHttpError, laravelJson, unauthenticated, validationError } from "../laravel/responses"
import { recallerCookieName } from "../laravel/sessionGuard"
import type { Throttle } from "../laravel/throttle"
import { validateInput } from "../laravel/validation"
import { emailRule, emailShape, phpBoolean } from "./accountRules"
import { issueInvitation, revokeSessions, updateManagedUserProfile, updateTeacherFormation, type Accessibility, type Account } from "./accounts"
import {
  ACCOUNT_ATTRIBUTES,
  acceptsBody,
  defaultIdentityWriteDeps,
  isAdministrator,
  passwordRecoveryThrottle,
  perform,
  stringOf,
  uniqueEmail,
  type IdentityWriteDeps,
} from "./accountWrites"
import { sessionPayload } from "./session"

async function answerSession(deps: IdentityWriteDeps, session: LaravelSession, original: Request, accessibility?: Accessibility): Promise<Response> {
  const profile = await deps.session.profiles.find(session.user.id)
  if (profile === null) return deps.bridge.forward(original)
  const payload = sessionPayload(session, profile, deps.session)
  if (accessibility !== undefined) payload.user.accessibility = accessibility
  return laravelJson(payload)
}

export async function updateProfile(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isAdministrator(session)) return forbidden()
  if (!acceptsBody(request)) return deps.bridge.forward(original)
  const input = await laravelInput(request)
  if (emailShape(input.correo_electronico) === "unknown") return deps.bridge.forward(original)
  const errors = await validateInput(
    input,
    {
      nombre: ["required", "string", { max: 255 }],
      correo_electronico: ["required", "string", emailRule(), { max: 255 }, uniqueEmail(deps, session.user.id)],
    },
    ACCOUNT_ATTRIBUTES,
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) =>
    updateManagedUserProfile(ctx, session.user, { name: stringOf(input.nombre), email: stringOf(input.correo_electronico) }),
  )
  if (outcome instanceof Response) return outcome
  return answerSession(deps, session, original)
}

const ACCESSIBILITY_ATTRIBUTES = {
  high_contrast: "alto contraste",
  text_size: "tamaño del texto",
  no_motion: "sin animaciones",
  wide_spacing: "texto espaciado",
}

export async function updateAccessibility(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "optional" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active) return forbidden()
  if (!acceptsBody(request)) return deps.bridge.forward(original)
  const input = await laravelInput(request)
  const errors = await validateInput(
    input,
    {
      high_contrast: ["required", "boolean"],
      text_size: ["required", "string", { in: ["100", "115", "130", "150"] }],
      no_motion: ["required", "boolean"],
      wide_spacing: ["required", "boolean"],
    },
    ACCESSIBILITY_ATTRIBUTES,
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const preferences: Accessibility = {
    high_contrast: phpBoolean(input.high_contrast),
    text_size: stringOf(input.text_size),
    no_motion: phpBoolean(input.no_motion),
    wide_spacing: phpBoolean(input.wide_spacing),
  }
  await deps.accounts.direct((tx) => tx.setAccessibility(session.user.id, preferences))
  return answerSession(deps, session, original, preferences)
}

export async function updateFormation(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active) return forbidden()
  if (!acceptsBody(request)) return deps.bridge.forward(original)
  const input = await laravelInput(request)
  const errors = await validateInput(input, { formacion_experiencia: ["required", "string"] }, { formacion_experiencia: "formación y experiencia" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) => updateTeacherFormation(ctx, session.user.id, stringOf(input.formacion_experiencia)))
  if (outcome instanceof Response) return outcome
  return answerSession(deps, session, original)
}

const RESEND_MESSAGE = "Si su cuenta aún no estaba activada, se envió un enlace de activación."

export async function resendOwnActivation(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  let gate: Throttle | null = null
  const session = await requireSession(
    request,
    {
      activeRole: "optional",
      afterAuthentication: async () => {
        gate = passwordRecoveryThrottle(deps, request, await laravelInput(request.clone()))
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
  return finish(laravelJson({ message: RESEND_MESSAGE }, 202))
}

type Tracked = { session: LaravelSession; touch: string | null; refresh: () => Promise<void> }

async function track(request: Request, original: Request, deps: IdentityWriteDeps): Promise<Tracked | Response> {
  const authentication = await authenticateAndTrack(request, {}, deps.bridge)
  const { outcome, touch } = authentication
  if ("deferred" in outcome) return deps.bridge.forward(original)
  const refresh = () => commitTracking(authentication, original, deps.bridge)
  if (outcome instanceof Response) {
    await refresh()
    return outcome
  }
  return { session: outcome, touch, refresh }
}

export async function destroySession(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const tracked = await track(request, request, deps)
  if (tracked instanceof Response) return tracked
  const { session, touch, refresh } = tracked
  if (touch !== null && touch === id) {
    await refresh()
    return laravelHttpError(422, "La sesión actual se cierra desde la opción Cerrar sesión.")
  }
  const userId = session.user.id
  await deps.accounts.direct(async (tx) => {
    await tx.deleteSession(id, userId)
  })
  await refresh()
  return laravelJson({ message: "La sesión seleccionada fue cerrada." })
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
  return validateInput(
    input,
    { current_password: ["required", "string", { check: () => matches, message: "La contraseña actual no es correcta." }] },
    ACCOUNT_ATTRIBUTES,
  )
}

async function closeOtherSessions(deps: IdentityWriteDeps, userId: string, currentId: string | null, random = deps.services.random): Promise<number> {
  return deps.accounts.direct(async (tx) => {
    const deleted = await revokeSessions({ tx, services: { ...deps.services, random } }, userId, currentId)
    return deleted
  })
}

const closedMessage = (closed: number) => ({
  message: closed === 1 ? "Se cerró una sesión adicional." : `Se cerraron ${closed} sesiones adicionales.`,
  closed_sessions: closed,
})

function destroyRememberedOtherSessions(request: Request, deps: IdentityWriteDeps): Promise<Response> {
  const writer = deps.writer ?? { ...withWriter(deps.bridge), random: deps.services.random }
  return statefulRequest(request, writer, { group: "api", authenticates: true }, async (context): Promise<Outcome> => {
    const user = context.user
    if (user === null) return unauthenticated()
    if (!acceptsBody(request)) return FORWARD
    const errors = await confirmCurrentPassword(await laravelInput(request), user, deps)
    if (errors === null) return FORWARD
    if (Object.keys(errors).length > 0) return fromController(validationError(errors))
    let token = ""
    const closed = await closeOtherSessions(deps, user.id, context.state.id, (length) => (token = deps.services.random(length)))
    await context.login(user)
    context.queueRecaller(user, token)
    return controllerJson(closedMessage(closed))
  })
}

export async function destroyOtherSessions(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  if (parseCookieHeader(request.headers.get("cookie")).has(recallerCookieName())) return destroyRememberedOtherSessions(request, deps)
  const original = request.clone()
  const tracked = await track(request, original, deps)
  if (tracked instanceof Response) return tracked
  const { session, touch, refresh } = tracked
  if (!acceptsBody(request)) return deps.bridge.forward(original)
  const errors = await confirmCurrentPassword(await laravelInput(request), session.user, deps)
  if (errors === null) return deps.bridge.forward(original)
  if (Object.keys(errors).length > 0) {
    await refresh()
    return validationError(errors)
  }
  const closed = await closeOtherSessions(deps, session.user.id, touch)
  await refresh()
  return laravelJson(closedMessage(closed))
}
