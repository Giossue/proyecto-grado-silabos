import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { phpQuery, type PhpArray } from "../http/input"
import { lengthAwarePaginator, resolveCurrentPage } from "../http/pagination"
import { queryParams, requestUrl } from "../http/request"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { COORDINATION_HISTORY_SORTS, COORDINATION_REVIEW_SORTS, listSortOf, type CoordinationHistorySort, type CoordinationReviewSort, type ListSort } from "@silabos/shared/schemas/listSort"
import { reviewHistorySchema, reviewSearchSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { hasRole, mayView, ROLE_COORDINATOR, type SyllabusFacts } from "./policy"
import { revisionDiff } from "./revisionDiff"
import { createCoordinationReviewRepository } from "./coordinationReviewQueries"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "./boundSession"

export type ReviewListRow = {
  id: string
  subject: string
  code: string
  period: string
  state: string
  revisionId: string | null
  revisionNumber: number | null
  submittedAt: string | null
  approved: boolean
  verified: boolean
}

export type HistoryFilters = { careerId: string; search: string; periodId: string | null }

export type HistoryRow = {
  id: string
  subject: string
  code: string
  period: string
  parallel: string
  revisionId: string | null
  author: string | null
  approvedAt: string | null
}

export type RevisionRecord = { id: string; syllabusId: string; number: number; snapshot: unknown }

export type SyllabusSummary = { id: string; subject: string; code: string; period: string; revisions: { id: string; number: number; submittedAt: string }[] }

export interface CoordinationReviewRepository {
  reviewPage(filters: { careerId: string | null; search: string }, page: number, perPage: number, sort?: ListSort<CoordinationReviewSort>): Promise<{ total: number; items: ReviewListRow[] }>
  teacherNames(syllabusIds: string[]): Promise<Map<string, string[]>>
  historyPage(filters: HistoryFilters, page: number, perPage: number, sort?: ListSort<CoordinationHistorySort>): Promise<{ total: number; items: HistoryRow[] }>
  historyPeriods(careerId: string): Promise<{ id: string; code: string }[]>
  periodExists(id: string): Promise<boolean>
  revision(id: string): Promise<RevisionRecord | null>
  syllabus(id: string, userId: string): Promise<SyllabusFacts | null>
  syllabusSummary(id: string): Promise<SyllabusSummary>
}

export type CoordinationReviewDeps = { bridge: BridgeDeps; reviews: CoordinationReviewRepository }

const PER_PAGE = 20
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

export function defaultCoordinationReviewDeps(): CoordinationReviewDeps {
  return { bridge: defaultBridgeDeps(), reviews: createCoordinationReviewRepository() }
}

export function reviewStage(row: { approved: boolean; verified: boolean }): string {
  return row.approved || !row.verified ? "biblioteca" : "coordinacion"
}

async function coordinator(request: Request, deps: CoordinationReviewDeps): Promise<AppSession | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  return coordinatorOnly(session)
}

function coordinatorOnly(session: AppSession): AppSession | Response {
  return hasRole(session, ROLE_COORDINATOR) ? session : forbidden()
}

function paginate<T>(request: Request, items: T[], total: number, currentPage: number) {
  return lengthAwarePaginator({ items, total, perPage: PER_PAGE, currentPage, path: requestUrl(request), query: queryParams(new URL(request.url)) })
}

function currentPage(request: Request): number {
  return resolveCurrentPage(queryParams(new URL(request.url)).get("page") ?? null)
}

export async function coordinationReviews(request: Request, deps: CoordinationReviewDeps = defaultCoordinationReviewDeps()): Promise<Response> {
  const session = await coordinator(request, deps)
  if (session instanceof Response) return session
  return coordinationReviewsFor(request, session, deps)
}

export async function coordinationReviewsFor(request: Request, authenticated: AppSession, deps: CoordinationReviewDeps): Promise<Response> {
  const session = coordinatorOnly(authenticated)
  if (session instanceof Response) return session
  const input = phpQuery(new URL(request.url))
  const { errors } = await validateSchema(reviewSearchSchema, input)
  if (errors !== null) return validationError(errors)
  const search = (typeof input.search === "string" ? input.search : "").replace(PHP_TRIM, "")
  const page = currentPage(request)
  const sort = listSortOf(COORDINATION_REVIEW_SORTS, input.sort, input.dir)
  const { total, items } = await deps.reviews.reviewPage({ careerId: session.activeRole?.careerId ?? null, search }, page, PER_PAGE, sort)
  const teachers = await deps.reviews.teacherNames(items.map((item) => item.id))
  const data = items.map((item) => ({
    id: item.id,
    revision_id: item.revisionId,
    revision_number: item.revisionNumber,
    subject: item.subject,
    code: item.code,
    period: item.period,
    state: item.state,
    stage: item.state === "en_revision" && item.revisionId !== null ? reviewStage(item) : null,
    teachers: teachers.get(item.id) ?? [],
    submitted_at: item.submittedAt,
  }))
  return apiJson({ filters: { search }, syllabi: paginate(request, data, total, page) })
}

export async function coordinationHistory(request: Request, deps: CoordinationReviewDeps = defaultCoordinationReviewDeps()): Promise<Response> {
  const session = await coordinator(request, deps)
  if (session instanceof Response) return session
  return coordinationHistoryFor(request, session, deps)
}

export async function coordinationHistoryFor(request: Request, authenticated: AppSession, deps: CoordinationReviewDeps): Promise<Response> {
  const session = coordinatorOnly(authenticated)
  if (session instanceof Response) return session
  const input: PhpArray = phpQuery(new URL(request.url))
  const { errors } = await validateSchema(reviewHistorySchema((value) => deps.reviews.periodExists(String(value))), input)
  if (errors !== null) return validationError(errors)
  const careerId = session.activeRole?.careerId ?? null
  if (typeof careerId !== "string") return aborted(403)
  const search = typeof input.q === "string" ? input.q.replace(PHP_TRIM, "") : ""
  const periodId = typeof input.period === "string" ? input.period : null
  const page = currentPage(request)
  const periods = await deps.reviews.historyPeriods(careerId)
  const sort = listSortOf(COORDINATION_HISTORY_SORTS, input.sort, input.dir)
  const { total, items } = await deps.reviews.historyPage({ careerId, search, periodId }, page, PER_PAGE, sort)
  const data = items.map((item) => ({
    id: item.id,
    revision_id: item.revisionId,
    period: item.period,
    subject: item.subject,
    code: item.code,
    parallels: [item.parallel],
    author: item.author,
    approved_at: item.approvedAt,
  }))
  return apiJson({ filters: { q: search === "" ? null : search, period: periodId }, periods, syllabi: paginate(request, data, total, page) })
}

export function comparisonBinder(beforeId: string, afterId: string, deps: Pick<CoordinationReviewDeps, "reviews">): Binder<{ before: RevisionRecord; after: RevisionRecord }> {
  return async () => {
    const before = isUuid(beforeId) ? await deps.reviews.revision(beforeId) : null
    const after = before === null || !isUuid(afterId) ? null : await deps.reviews.revision(afterId)
    if (before === null) return modelNotFound(MODELS.revision, beforeId)
    return after === null ? modelNotFound(MODELS.revision, afterId) : { before, after }
  }
}

export async function compareRevisions(request: Request, beforeId: string, afterId: string, deps: CoordinationReviewDeps = defaultCoordinationReviewDeps()): Promise<Response> {
  const bound = await requireBound(request, comparisonBinder(beforeId, afterId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return compareRevisionsFor(bound.session, bound.bound, deps)
}

export async function compareRevisionsFor(session: AppSession, { before, after }: { before: RevisionRecord; after: RevisionRecord }, deps: CoordinationReviewDeps): Promise<Response> {
  let first = before
  let second = after
  for (const revision of [first, second]) {
    const facts = await deps.reviews.syllabus(revision.syllabusId, session.user.id)
    if (facts === null || !mayView(session, facts)) return aborted(403)
  }
  if (first.syllabusId !== second.syllabusId) return validationError({ revisions: ["Solo pueden compararse revisiones del mismo expediente."] })
  if (first.number > second.number) [first, second] = [second, first]
  const syllabus = await deps.reviews.syllabusSummary(first.syllabusId)
  const latest = syllabus.revisions.toSorted((left, right) => right.number - left.number)[0]
  return apiJson({
    syllabus: {
      id: syllabus.id,
      subject: syllabus.subject,
      code: syllabus.code,
      period: syllabus.period,
      current_revision_id: latest?.id ?? null,
      revisions: syllabus.revisions.map((item) => ({ id: item.id, number: item.number, submitted_at: item.submittedAt })),
    },
    comparison: revisionDiff(first, second),
  })
}
