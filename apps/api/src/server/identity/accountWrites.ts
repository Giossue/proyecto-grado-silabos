import { HttpFailure } from "../http/failures"
import { requestBoolean } from "../syllabus/inProgressWork"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import { bcryptHash, bcryptVerify } from "../auth/bcrypt"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { institutionToday } from "../dashboard/dashboardQueries"
import { isJsonRequest, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { managedUserSchema, newManagedUserSchema, type ExistsCheck } from "@silabos/shared/schemas/people"
import type { UniqueCheck } from "@silabos/shared/schemas/account"
import { validateSchema } from "../http/schemaValidation"
import { frontendUrl } from "../mail/config"
import { queueMail } from "../mail/sendMailJob"
import { withAfterCommit } from "../queue/dispatch"
import {
  collapseNameColumns,
  fullName,
  phpBoolean,
  phpCastBool,
  randomString,
  ROLE_ADMINISTRATOR,
} from "./accountRules"
import {
  AccountValidation,
  assignRole,
  createManagedUser,
  deleteManagedUser,
  removeUserRole,
  RESEND,
  resendActivation,
  setUserStatus,
  updateManagedUserProfile,
  type Account,
  type AccountRepository,
  type AccountServices,
  type ActionContext,
  type RoleGrant,
} from "./accounts"
import { createAccountRepository } from "./accountStore"
import { createProfileRepository, type SessionDeps } from "./session"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export type IdentityWriteDeps = {
  bridge: BridgeDeps
  accounts: AccountRepository
  services: AccountServices
  limiter: RateLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  session: Pick<SessionDeps, "profiles" | "today" | "timezone">
}

export function defaultIdentityWriteDeps(): IdentityWriteDeps {
  return {
    bridge: defaultBridgeDeps(),
    accounts: createAccountRepository(),
    services: {
      random: randomString,
      hashPassword: (plain) => bcryptHash(plain, Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10)),
      frontendUrl: () => frontendUrl(),
      queueMail,
    },
    limiter: sharedRateLimiter(),
    verifyPassword: bcryptVerify,
    session: { profiles: createProfileRepository(), today: institutionToday, timezone: () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil" },
  }
}

export function isAdministrator(session: AppSession): boolean {
  return session.user.active && session.activeRole?.role === ROLE_ADMINISTRATOR
}

export function acceptsBody(request: Request): boolean {
  return request.headers.get("content-type") === null || isJsonRequest(request)
}

export function blank(value: PhpValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  return typeof value === "object" && Object.keys(value).length === 0
}

export const stringOf = (value: PhpValue | undefined): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value))

export type Performed<T> = { value: T } | Response

export async function perform<T>(
  deps: IdentityWriteDeps,
  original: Request,
  session: AppSession,
  work: (ctx: ActionContext) => Promise<T>,
  actorId: string = session.user.id,
): Promise<Performed<T>> {
  try {
    const value = await withAfterCommit((afterCommit) =>
      deps.accounts.transaction((tx) =>
        work({ tx, actorId, activeRoleId: session.activeRole?.id ?? null, now: deps.bridge.now(), afterCommit, services: deps.services }),
      ),
    )
    return { value }
  } catch (error) {
    if (error instanceof AccountValidation) return validationError(error.errors)
    if (error instanceof HttpFailure) return error.response
    throw error
  }
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || ""
}

export function passwordRecoveryThrottle(deps: IdentityWriteDeps, request: Request, input: PhpArray): Throttle {
  const email = typeof input.email === "string" ? input.email.toLowerCase() : ""
  return throttle(deps.limiter, { key: `password-recovery:${email}|${clientIp(request)}`, maxAttempts: 3, decaySeconds: 60 }, deps.bridge.now)
}

export type BoundAccount = { session: AppSession; target: Account; original: Request; finish: (response: Response) => Response }

export async function bindAccount(
  request: Request,
  id: string,
  deps: IdentityWriteDeps,
  options: { throttled?: boolean; extra?: () => Promise<true | Response> } = {},
): Promise<BoundAccount | Response> {
  const original = request.clone()
  let target: Account | null = null
  let gate: Throttle | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        if (options.throttled) {
          gate = passwordRecoveryThrottle(deps, request, await requestInput(request.clone()))
          const limited = await gate.hit()
          if (limited) return limited
        }
        target = isUuid(id) ? await deps.accounts.findAccount(id) : null
        if (target === null) return modelNotFound(MODELS.user, id)
        const extra = options.extra ? await options.extra() : true
        return extra instanceof Response ? extra : null
      },
    },
    deps.bridge,
  )
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  if (session instanceof Response) return finish(session)
  return { session, target: target as unknown as Account, original, finish }
}

export function careerExists(deps: IdentityWriteDeps): ExistsCheck {
  return (value) => deps.accounts.activeCareer(value)
}

export function uniqueEmail(deps: IdentityWriteDeps, ignore: string | null): UniqueCheck {
  return async (value) => !(await deps.accounts.emailTaken(stringOf(value), ignore))
}

export async function storeManagedUser(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isAdministrator(session)) return forbidden()
  const input = collapseNameColumns(await requestInput(request))
  const { errors } = await validateSchema(newManagedUserSchema({ roleCode: input.role_code, unique: uniqueEmail(deps, null), careerExists: careerExists(deps) }), input)
  if (errors !== null) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) =>
    createManagedUser(ctx, {
      name: fullName(stringOf(input.nombres), stringOf(input.apellidos)),
      email: stringOf(input.correo_electronico),
      roleCode: stringOf(input.role_code),
      careerId: blank(input.career_id) ? null : stringOf(input.career_id),
      replaceCoordinator: phpBoolean(input.replace_coordinator),
      confirmed: requestBoolean(input.confirm_purge),
    }),
  )
  if (outcome instanceof Response) return outcome
  const created = outcome.value
  return apiJson({ message: "Cuenta creada con su rol inicial.", user: { id: created.id, nombre: created.name, correo_electronico: created.email } }, 201)
}

export async function updateManagedUser(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  const input = await requestInput(request)
  const governance = "active" in input || "role_code" in input
  if (!isAdministrator(session) || (governance && session.user.id === target.id)) return forbidden()
  const { errors } = await validateSchema(
    managedUserSchema({ roleCode: input.role_code, unique: uniqueEmail(deps, target.id), careerExists: careerExists(deps), currentName: target.name }),
    input,
  )
  if (errors !== null) return validationError(errors)
  const outcome = await perform(deps, original, session, async (ctx) => {
    await updateManagedUserProfile(ctx, target, { name: stringOf(input.nombre), email: stringOf(input.correo_electronico) })
    if ("role_code" in input) {
      await assignRole(ctx, target, {
        roleCode: stringOf(input.role_code),
        careerId: blank(input.career_id) ? null : stringOf(input.career_id),
        replaceCoordinator: phpCastBool(input.replace_coordinator ?? false),
        confirmed: requestBoolean(input.confirm_purge),
      })
    }
    if ("active" in input && phpCastBool(input.active) !== target.active) await setUserStatus(ctx, target, phpCastBool(input.active))
  })
  if (outcome instanceof Response) return outcome
  return apiJson({ message: "Cuenta actualizada." })
}

export function managesPending(session: AppSession, target: Account): boolean {
  return session.user.active && session.user.id !== target.id && target.active && !target.verified && session.activeRole?.role === ROLE_ADMINISTRATOR
}

export async function resendManagedUserActivation(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps, { throttled: true })
  if (bound instanceof Response) return bound
  const { session, target, original, finish } = bound
  if (!managesPending(session, target)) return finish(forbidden())
  const outcome = await perform(deps, original, session, (ctx) => resendActivation(ctx, target, RESEND))
  if (outcome instanceof Response) return finish(outcome)
  return finish(apiJson({ message: `Invitación de activación enviada a ${target.email}.` }))
}

export async function destroyManagedUser(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  if (!managesPending(session, target)) return forbidden()
  const outcome = await perform(deps, original, session, (ctx) => deleteManagedUser(ctx, target))
  if (outcome instanceof Response) return outcome
  return apiJson({ message: "Cuenta eliminada." })
}

export async function removeManagedUserRole(
  request: Request,
  id: string,
  assignmentId: string,
  deps: IdentityWriteDeps = defaultIdentityWriteDeps(),
): Promise<Response> {
  let assignment: RoleGrant | null = null
  const bound = await bindAccount(request, id, deps, {
    extra: async () => {
      assignment = isUuid(assignmentId) ? await deps.accounts.findGrant(assignmentId) : null
      return assignment === null ? modelNotFound(MODELS.roleAssignment, assignmentId) : true
    },
  })
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  const grant = assignment as unknown as RoleGrant
  if (!isAdministrator(session)) return forbidden()
  if (grant.userId !== target.id) return aborted(404)
  const outcome = await perform(deps, original, session, (ctx) => removeUserRole(ctx, target, grant))
  if (outcome instanceof Response) return outcome
  return apiJson({ message: "Rol retirado." })
}
