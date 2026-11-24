import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { isUuid } from "../academic/structure"
import { phpQuery, type PhpValue } from "../laravel/input"
import { lengthAwarePaginator, resolveCurrentPage } from "../laravel/pagination"
import { laravelQuery, laravelRequestUrl } from "../laravel/request"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { createManagedUserRepository } from "./managedUserQueries"

export type ManagedUserFilters = { search: string | null; status: string | null; role: string | null; career: string | null }
export type ManagedAssignment = { id: string; role: string; careerLabel: string | null; active: boolean }
export type ManagedUserRow = {
  id: string
  name: string
  email: string
  active: boolean
  verified: boolean
  twoFactor: boolean
  invitationActive: boolean
  assignments: ManagedAssignment[]
}

export interface ManagedUserRepository {
  page(filters: ManagedUserFilters, page: number, perPage: number): Promise<{ total: number; items: ManagedUserRow[] }>
  careers(): Promise<{ id: string; nombre: string }[]>
}

export type ManagedUserDeps = { bridge: BridgeDeps; users: ManagedUserRepository }

export function defaultManagedUserDeps(): ManagedUserDeps {
  return { bridge: defaultBridgeDeps(), users: createManagedUserRepository() }
}

export const ROLE_NAMES: [string, string][] = [
  ["administrador", "Administrador"],
  ["coordinador", "Coordinador"],
  ["docente", "Docente"],
  ["bibliotecario", "Bibliotecario"],
]

const PER_PAGE = 20
const STATUSES = ["active", "pending", "inactive"]
const ROLE_CODES = ROLE_NAMES.map(([code]) => code)
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

const roleName = (code: string) => ROLE_NAMES.find(([role]) => role === code)?.[1] ?? code
const stringOrNull = (value: PhpValue | undefined) => (typeof value === "string" ? value : null)
const falsy = (value: string | null) => value === null || value === "" || value === "0"

export async function managedUsers(request: Request, deps: ManagedUserDeps = defaultManagedUserDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active || session.activeRole?.role !== "administrador") return forbidden()
  const input = phpQuery(new URL(request.url))
  const errors = await validateInput(
    input,
    {
      q: ["nullable", "string", { max: 120 }],
      status: ["nullable", { in: ["all", ...STATUSES] }],
      role: ["nullable", { in: ["all", ...ROLE_CODES] }],
      career: ["nullable", "string", { max: 36 }],
      page: ["nullable", "integer", { min: 1 }],
    },
    { q: "búsqueda", status: "estado", role: "rol", career: "carrera", page: "página" },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  const q = stringOrNull(input.q)
  const search = q === null ? null : q.replace(PHP_TRIM, "")
  const status = STATUSES.includes(stringOrNull(input.status) ?? "") ? (input.status as string) : null
  const role = ROLE_CODES.includes(stringOrNull(input.role) ?? "") ? (input.role as string) : null
  const careerInput = stringOrNull(input.career)
  const career = careerInput !== null && isUuid(careerInput) ? careerInput : null
  const query = laravelQuery(new URL(request.url))
  const currentPage = resolveCurrentPage(query.get("page") ?? null)
  const { total, items } = await deps.users.page({ search: falsy(search) ? null : search, status, role, career }, currentPage, PER_PAGE)
  const data = items.map((user) => {
    const effective = user.assignments.filter((assignment) => assignment.active)
    return {
      id: user.id,
      nombre: user.name,
      correo_electronico: user.email,
      active: user.active,
      pending_activation: !user.verified,
      invitation_expired: !user.verified && !user.invitationActive,
      two_factor_enabled: user.twoFactor,
      roles: effective.map((assignment) => ({ id: assignment.id, code: assignment.role, name: roleName(assignment.role), career_name: assignment.careerLabel })),
      careers: effective.map((assignment) => assignment.careerLabel),
      assignments: user.assignments.map((assignment) => ({ id: assignment.id, role_name: roleName(assignment.role), career_name: assignment.careerLabel, active: assignment.active })),
    }
  })
  return laravelJson({
    users: lengthAwarePaginator({ items: data, total, perPage: PER_PAGE, currentPage, path: laravelRequestUrl(request), query }),
    filters: { q: search, status, role, career },
    roles: ROLE_NAMES.map(([codigo, nombre]) => ({ codigo, nombre })),
    careers: await deps.users.careers(),
  })
}
