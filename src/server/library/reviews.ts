import "server-only"
import { requireSession, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isPhpArray, phpQuery, type PhpArray, type PhpValue } from "../laravel/input"
import { lengthAwarePaginator, resolveCurrentPage } from "../laravel/pagination"
import { laravelQuery, laravelRequestUrl } from "../laravel/request"
import { laravelHttpError, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { createLibraryReviewRepository } from "./reviewQueries"

export const REVIEW_STATES = ["pendiente", "atendido"]
export const REVIEW_OUTCOMES = ["firmado", "devuelto", "reemplazado"]

export type ReviewPeriod = "actual" | "terminado"

export type ReviewFilters = {
  state: string | null
  search: string | null
  facultyId: string | null
  period: ReviewPeriod
  periodId: string | null
  handledBy: string | null
}

export type ReviewRow = {
  revisionId: string
  syllabusId: string
  revisionNumber: number
  sentAt: string
  sentBy: string
  signedBy: string | null
  responsibleId: string | null
  state: string
  outcome: string | null
}

export type SyllabusSummary = {
  subject: string
  code: string
  faculty: string | null
  career: string
  period: string
  parallel: string
  teachers: string[]
}

export interface LibraryReviewRepository {
  page(filters: ReviewFilters, page: number, perPage: number): Promise<{ total: number; items: ReviewRow[] }>
  summaries(syllabusIds: string[]): Promise<Map<string, SyllabusSummary>>
  userNames(userIds: string[]): Promise<Map<string, string>>
  faculties(): Promise<{ id: string; name: string }[]>
  pastPeriods(): Promise<{ id: string; code: string }[]>
  existing(table: "facultades" | "periodos_academicos", ids: string[]): Promise<number>
}

export type LibraryReviewDeps = { bridge: BridgeDeps; reviews: LibraryReviewRepository }

const PER_PAGE = 20
const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

class QueryFailed extends Error {}

export function defaultLibraryReviewDeps(): LibraryReviewDeps {
  return { bridge: defaultBridgeDeps(), reviews: createLibraryReviewRepository() }
}

function exists(deps: LibraryReviewDeps, table: "facultades" | "periodos_academicos") {
  return async (value: PhpValue) => {
    const values = isPhpArray(value) ? Object.values(value) : [value]
    if (values.some((item) => typeof item !== "string" || !UUID.test(item))) throw new QueryFailed()
    const distinct = [...new Set(values as string[])]
    return (await deps.reviews.existing(table, distinct)) >= distinct.length
  }
}

type Listing = { session: LaravelSession; input: PhpArray }

async function authorizeListing(request: Request, deps: LibraryReviewDeps): Promise<Listing | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (session.activeRole?.role !== "bibliotecario") return laravelJson({ message: "No tiene permiso para hacer esto." }, 403)
  const input = phpQuery(new URL(request.url))
  let errors: Record<string, string[]>
  try {
    errors = await validateInput(
      input,
      {
        state: ["nullable", "string", { in: [...REVIEW_STATES, ...REVIEW_OUTCOMES] }],
        q: ["nullable", "string", { max: 120 }],
        faculty: ["nullable", "uuid", { exists: exists(deps, "facultades") }],
        period: ["nullable", "uuid", { exists: exists(deps, "periodos_academicos") }],
        mine: ["nullable", "boolean"],
      },
      { faculty: "facultad", period: "período", mine: "solo los míos" },
    )
  } catch (error) {
    if (error instanceof QueryFailed) return laravelHttpError(500, "Server Error")
    throw error
  }
  if (Object.keys(errors).length > 0) return validationError(errors)
  return { session, input }
}

function optionalString(value: PhpValue | undefined): string | null {
  return typeof value === "string" ? value : null
}

async function listing(request: Request, deps: LibraryReviewDeps, input: PhpArray, period: ReviewPeriod, periodId: string | null, handledBy: string | null) {
  const state = optionalString(input.state)
  const q = optionalString(input.q)
  const search = q === null ? null : q.replace(PHP_TRIM, "")
  const facultyId = optionalString(input.faculty)
  const url = new URL(request.url)
  const query = laravelQuery(url)
  const currentPage = resolveCurrentPage(query.get("page") ?? null)
  const { total, items } = await deps.reviews.page({ state, search, facultyId, period, periodId, handledBy }, currentPage, PER_PAGE)
  const syllabi = await deps.reviews.summaries([...new Set(items.map((item) => item.syllabusId))])
  const names = await deps.reviews.userNames([...new Set(items.flatMap((item) => (item.responsibleId === null ? [] : [item.responsibleId])))])
  const data = items.map((item) => {
    const syllabus = syllabi.get(item.syllabusId) ?? null
    return {
      syllabus_id: syllabus === null ? null : item.syllabusId,
      subject: syllabus?.subject ?? null,
      code: syllabus?.code ?? null,
      faculty: syllabus?.faculty ?? null,
      career: syllabus?.career ?? null,
      period: syllabus?.period ?? null,
      parallels: syllabus === null ? [] : [syllabus.parallel],
      teachers: syllabus?.teachers ?? [],
      revision_number: item.revisionNumber,
      revision_id: item.revisionId,
      sent_at: item.sentAt,
      sent_by: item.sentBy,
      signed_by: item.signedBy,
      responsible: item.responsibleId === null ? null : (names.get(item.responsibleId) ?? null),
      state: item.state,
      outcome: item.state === "atendido" && typeof item.outcome === "string" ? item.outcome : null,
    }
  })
  return {
    filters: { q: search === null || search === "" || search === "0" ? null : search, state, faculty: facultyId, period: periodId, mine: handledBy !== null },
    faculties: await deps.reviews.faculties(),
    reviews: lengthAwarePaginator({ items: data, total, perPage: PER_PAGE, currentPage, path: laravelRequestUrl(request), query }),
  }
}

export async function libraryReviews(request: Request, deps: LibraryReviewDeps = defaultLibraryReviewDeps()): Promise<Response> {
  const authorized = await authorizeListing(request, deps)
  if (authorized instanceof Response) return authorized
  return laravelJson(await listing(request, deps, authorized.input, "actual", null, null))
}

export async function libraryHistory(request: Request, deps: LibraryReviewDeps = defaultLibraryReviewDeps()): Promise<Response> {
  const authorized = await authorizeListing(request, deps)
  if (authorized instanceof Response) return authorized
  const { session, input } = authorized
  const mine = input.mine === "1" || input.mine === 1 || input.mine === true
  const result = await listing(request, deps, input, "terminado", optionalString(input.period), mine ? session.user.id : null)
  return laravelJson({ ...result, periods: await deps.reviews.pastPeriods() })
}
