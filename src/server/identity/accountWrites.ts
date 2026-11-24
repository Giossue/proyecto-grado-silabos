import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import { bcryptHash, bcryptVerify } from "../auth/bcrypt"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import type { SessionWriterDeps } from "../auth/sessionWriter"
import { isUuid } from "../academic/structure"
import { institutionToday } from "../dashboard/dashboardQueries"
import { isJsonRequest, laravelInput, type PhpArray, type PhpValue } from "../laravel/input"
import { aborted, forbidden, laravelJson, validationError } from "../laravel/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../laravel/throttle"
import { validateInput, type Rule } from "../laravel/validation"
import { frontendUrl } from "../mail/config"
import { queueMail } from "../mail/sendMailJob"
import { withAfterCommit } from "../queue/dispatch"
import {
  collapseNameColumns,
  emailRule,
  emailShape,
  fullName,
  isValidFullName,
  nameColumnMessages,
  nameColumnRules,
  normalizeName,
  phpBoolean,
  phpCastBool,
  randomString,
  requiresCareer,
  ROLE_ADMINISTRATOR,
  roleCodeRule,
} from "./accountRules"
import {
  AccountValidation,
  assignRole,
  createManagedUser,
  deleteManagedUser,
  NeedsLaravel,
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

export type IdentityWriteDeps = {
  bridge: BridgeDeps
  accounts: AccountRepository
  services: AccountServices
  limiter: RateLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  session: Pick<SessionDeps, "profiles" | "today" | "timezone">
  writer?: SessionWriterDeps
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

export const ACCOUNT_ATTRIBUTES: Record<string, string> = {
  nombre: "nombre",
  correo_electronico: "correo electrónico",
  password: "contraseña",
  role_code: "rol",
  career_id: "carrera",
  replace_coordinator: "reemplazo de coordinación",
  faculty_id: "facultad",
  active: "activo",
  activo: "activo",
  user_id: "usuario",
  current_password: "contraseña actual",
}

export function isAdministrator(session: LaravelSession): boolean {
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
  session: LaravelSession,
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
    if (error instanceof NeedsLaravel) return deps.bridge.forward(original)
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

export type BoundAccount = { session: LaravelSession; target: Account; original: Request; finish: (response: Response) => Response }

export async function bindAccount(
  request: Request,
  id: string,
  deps: IdentityWriteDeps,
  options: { throttled?: boolean; extra?: () => Promise<boolean> } = {},
): Promise<BoundAccount | Response> {
  if (!isUuid(id)) return deps.bridge.forward(request)
  const original = request.clone()
  let target: Account | null = null
  let gate: Throttle | null = null
  let forwarded = false
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        if (options.throttled) {
          gate = passwordRecoveryThrottle(deps, request, await laravelInput(request.clone()))
          const limited = await gate.hit()
          if (limited) return limited
        }
        target = await deps.accounts.findAccount(id)
        if (target === null || (options.extra && !(await options.extra()))) {
          forwarded = true
          return deps.bridge.forward(original)
        }
        return null
      },
    },
    deps.bridge,
  )
  const finish = (response: Response) => (forwarded ? response : ((gate as Throttle | null)?.decorate(response) ?? response))
  if (session instanceof Response) return finish(session)
  return { session, target: target as unknown as Account, original, finish }
}

function careerRules(deps: IdentityWriteDeps, roleCode: PhpValue | undefined): Rule[] {
  return ["nullable", ...(requiresCareer(roleCode) ? (["required"] as Rule[]) : []), "uuid", { exists: (value) => deps.accounts.activeCareer(String(value)) }]
}

export function uniqueEmail(deps: IdentityWriteDeps, ignore: string | null): Rule {
  return { unique: async (value) => !(await deps.accounts.emailTaken(stringOf(value), ignore)) }
}

export async function storeManagedUser(request: Request, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const original = request.clone()
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isAdministrator(session)) return forbidden()
  if (!acceptsBody(request)) return deps.bridge.forward(original)
  const input = collapseNameColumns(await laravelInput(request))
  if (emailShape(input.correo_electronico) === "unknown") return deps.bridge.forward(original)
  const errors = await validateInput(
    input,
    {
      nombres: nameColumnRules(),
      apellidos: nameColumnRules(),
      nombre: ["prohibited"],
      correo_electronico: ["required", "string", emailRule(), { max: 255 }, uniqueEmail(deps, null)],
      password: ["prohibited"],
      role_code: ["required", roleCodeRule()],
      career_id: careerRules(deps, input.role_code),
      replace_coordinator: ["sometimes", "boolean"],
      faculty_id: ["prohibited"],
    },
    ACCOUNT_ATTRIBUTES,
    {
      messages: {
        "correo_electronico.unique": "Ya existe una cuenta con este correo.",
        "career_id.required": "Seleccione la carrera que limita este rol.",
        ...nameColumnMessages(),
      },
    },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const outcome = await perform(deps, original, session, (ctx) =>
    createManagedUser(ctx, {
      name: fullName(stringOf(input.nombres), stringOf(input.apellidos)),
      email: stringOf(input.correo_electronico),
      roleCode: stringOf(input.role_code),
      careerId: blank(input.career_id) ? null : stringOf(input.career_id),
      replaceCoordinator: phpBoolean(input.replace_coordinator),
    }),
  )
  if (outcome instanceof Response) return outcome
  const created = outcome.value
  return laravelJson({ message: "Cuenta creada con su rol inicial.", user: { id: created.id, nombre: created.name, correo_electronico: created.email } }, 201)
}

export async function updateManagedUser(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  if (!acceptsBody(request)) return deps.bridge.forward(original)
  const input = await laravelInput(request)
  const governance = "active" in input || "role_code" in input
  if (!isAdministrator(session) || (governance && session.user.id === target.id)) return forbidden()
  if (emailShape(input.correo_electronico) === "unknown") return deps.bridge.forward(original)
  const errors = await validateInput(
    input,
    {
      nombre: [
        "required",
        "string",
        { max: 180 },
        {
          check: (value) => typeof value !== "string" || isValidFullName(value) || normalizeName(value) === normalizeName(target.name),
          message: "Escriba los nombres y los apellidos, solo con letras.",
        },
      ],
      correo_electronico: ["required", "string", emailRule(), { max: 255 }, uniqueEmail(deps, target.id)],
      active: ["sometimes", "required", "boolean"],
      role_code: ["sometimes", "required", roleCodeRule()],
      ...(blank(input.role_code) ? {} : { career_id: careerRules(deps, input.role_code) }),
      replace_coordinator: ["sometimes", "boolean"],
      faculty_id: ["prohibited"],
    },
    ACCOUNT_ATTRIBUTES,
    {
      messages: {
        "correo_electronico.unique": "Ya existe otra cuenta con este correo.",
        "career_id.required": "El campo carrera es obligatorio a menos que rol esté en administrador, bibliotecario.",
      },
    },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const outcome = await perform(deps, original, session, async (ctx) => {
    await updateManagedUserProfile(ctx, target, { name: stringOf(input.nombre), email: stringOf(input.correo_electronico) })
    if ("role_code" in input) {
      await assignRole(ctx, target, {
        roleCode: stringOf(input.role_code),
        careerId: blank(input.career_id) ? null : stringOf(input.career_id),
        replaceCoordinator: phpCastBool(input.replace_coordinator ?? false),
      })
    }
    if ("active" in input && phpCastBool(input.active) !== target.active) await setUserStatus(ctx, target, phpCastBool(input.active))
  })
  if (outcome instanceof Response) return outcome
  return laravelJson({ message: "Cuenta actualizada." })
}

export function managesPending(session: LaravelSession, target: Account): boolean {
  return session.user.active && session.user.id !== target.id && target.active && !target.verified && session.activeRole?.role === ROLE_ADMINISTRATOR
}

export async function resendManagedUserActivation(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps, { throttled: true })
  if (bound instanceof Response) return bound
  const { session, target, original, finish } = bound
  if (!managesPending(session, target)) return finish(forbidden())
  const outcome = await perform(deps, original, session, (ctx) => resendActivation(ctx, target, RESEND))
  if (outcome instanceof Response) return finish(outcome)
  return finish(laravelJson({ message: `Invitación de activación enviada a ${target.email}.` }))
}

export async function destroyManagedUser(request: Request, id: string, deps: IdentityWriteDeps = defaultIdentityWriteDeps()): Promise<Response> {
  const bound = await bindAccount(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  if (!managesPending(session, target)) return forbidden()
  const outcome = await perform(deps, original, session, (ctx) => deleteManagedUser(ctx, target))
  if (outcome instanceof Response) return outcome
  return laravelJson({ message: "Cuenta eliminada." })
}

export async function removeManagedUserRole(
  request: Request,
  id: string,
  assignmentId: string,
  deps: IdentityWriteDeps = defaultIdentityWriteDeps(),
): Promise<Response> {
  if (!isUuid(assignmentId)) return deps.bridge.forward(request)
  let assignment: RoleGrant | null = null
  const bound = await bindAccount(request, id, deps, {
    extra: async () => {
      assignment = await deps.accounts.findGrant(assignmentId)
      return assignment !== null
    },
  })
  if (bound instanceof Response) return bound
  const { session, target, original } = bound
  const grant = assignment as unknown as RoleGrant
  if (!isAdministrator(session)) return forbidden()
  if (grant.userId !== target.id) return aborted(404)
  const outcome = await perform(deps, original, session, (ctx) => removeUserRole(ctx, target, grant))
  if (outcome instanceof Response) return outcome
  return laravelJson({ message: "Rol retirado." })
}
