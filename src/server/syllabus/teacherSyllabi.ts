import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { phpQuery, type PhpArray } from "../laravel/input"
import { strnatcasecmp } from "../laravel/naturalSort"
import { lengthAwarePaginator, resolveCurrentPage } from "../laravel/pagination"
import { laravelQuery, laravelRequestUrl } from "../laravel/request"
import { aborted, forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { hasRole, ROLE_TEACHER } from "./policy"
import { convocationName } from "./syllabusSql"
import { createTeacherSyllabusRepository } from "./teacherSyllabusQueries"
import { laravelRouter, routeAllows } from "../laravel/router"

export type TeacherPageFilters = { userId: string; careerId: string | null; search: string | null; state: string | null }

export type TeacherSyllabusRow = {
  id: string
  subject: string
  code: string
  career: string
  period: string
  state: string
  startedAt: string | null
  parallel: string
  savedAt: string | null
}

export type PastSyllabusRow = {
  id: string
  careerId: string
  career: string
  subject: string
  period: string
  periodEndsOn: string
  state: string
  parallel: string
  savedAt: string | null
}

export interface TeacherSyllabusRepository {
  page(filters: TeacherPageFilters, page: number, perPage: number): Promise<{ total: number; items: TeacherSyllabusRow[] }>
  convocationOpen(careerId: string | null): Promise<boolean>
  past(userId: string, careerId: string | null): Promise<PastSyllabusRow[]>
}

export type TeacherSyllabusDeps = { bridge: BridgeDeps; syllabi: TeacherSyllabusRepository }

const PER_PAGE = 20
const SYLLABUS_STATES = ["sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

export function defaultTeacherSyllabusDeps(): TeacherSyllabusDeps {
  return { bridge: defaultBridgeDeps(), syllabi: createTeacherSyllabusRepository() }
}

export function phpFalsy(value: string | null): boolean {
  return value === null || value === "" || value === "0"
}

async function authorizedTeacher(request: Request, deps: TeacherSyllabusDeps): Promise<{ session: LaravelSession; input: PhpArray } | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!hasRole(session, ROLE_TEACHER)) return forbidden()
  const input = phpQuery(new URL(request.url))
  const errors = await validateInput(
    input,
    {
      q: ["nullable", "string", { max: 120 }],
      state: ["nullable", { in: ["all", ...SYLLABUS_STATES] }],
      page: ["nullable", "integer", { min: 1 }],
    },
    { q: "búsqueda", state: "estado", page: "página" },
  )
  if (Object.keys(errors).length > 0) return validationError(errors)
  return { session, input }
}

export async function teacherSyllabi(request: Request, deps: TeacherSyllabusDeps = defaultTeacherSyllabusDeps()): Promise<Response> {
  const authorized = await authorizedTeacher(request, deps)
  if (authorized instanceof Response) return authorized
  const { session, input } = authorized
  const search = typeof input.q === "string" ? input.q.replace(PHP_TRIM, "") : null
  const state = typeof input.state === "string" && SYLLABUS_STATES.includes(input.state) ? input.state : null
  const careerId = session.activeRole?.careerId ?? null
  const query = laravelQuery(new URL(request.url))
  const currentPage = resolveCurrentPage(query.get("page") ?? null)
  const filters = { userId: session.user.id, careerId, search: phpFalsy(search) ? null : search, state }
  const { total, items } = await deps.syllabi.page(filters, currentPage, PER_PAGE)
  const data = items.map((item) => ({
    id: item.id,
    subject: item.subject,
    code: item.code,
    convocation: convocationName(item.career, item.period),
    period: item.period,
    state: item.state,
    iniciado_en: item.startedAt,
    parallels: [item.parallel],
    guardado_en: item.savedAt,
  }))
  return laravelJson({
    filters: { q: phpFalsy(search) ? null : search, state },
    syllabi: lengthAwarePaginator({ items: data, total, perPage: PER_PAGE, currentPage, path: laravelRequestUrl(request), query }),
    convocation_open: await deps.syllabi.convocationOpen(careerId),
  })
}

export async function teacherHistory(request: Request, deps: TeacherSyllabusDeps = defaultTeacherSyllabusDeps()): Promise<Response> {
  const authorized = await authorizedTeacher(request, deps)
  if (authorized instanceof Response) return authorized
  const groups = new Map<string, { id: string; name: string; syllabi_count: number }>()
  for (const item of await deps.syllabi.past(authorized.session.user.id, null)) {
    const group = groups.get(item.careerId)
    if (group) group.syllabi_count++
    else groups.set(item.careerId, { id: item.careerId, name: item.career, syllabi_count: 1 })
  }
  return laravelJson({ careers: [...groups.values()].sort((left, right) => strnatcasecmp(left.name, right.name)) })
}

export async function teacherHistoryCareer(request: Request, career: string, deps: TeacherSyllabusDeps = defaultTeacherSyllabusDeps()): Promise<Response> {
  if (!routeAllows(request)) return laravelRouter(request)
  const authorized = await authorizedTeacher(request, deps)
  if (authorized instanceof Response) return authorized
  const syllabi = (await deps.syllabi.past(authorized.session.user.id, career)).sort((left, right) => (left.periodEndsOn === right.periodEndsOn ? 0 : left.periodEndsOn < right.periodEndsOn ? 1 : -1))
  if (syllabi.length === 0) return aborted(404)
  return laravelJson({
    career: { id: career, name: syllabi[0].career },
    syllabi: syllabi.map((item) => ({ id: item.id, subject: item.subject, period: item.period, state: item.state, parallels: [item.parallel], guardado_en: item.savedAt })),
  })
}
