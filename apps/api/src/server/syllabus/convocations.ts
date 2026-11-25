import { HttpFailure, Missing } from "../http/failures"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { phpQuery } from "../http/input"
import { lengthAwarePaginator, resolveCurrentPage } from "../http/pagination"
import { queryParams, requestUrl } from "../http/request"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { listingFiltersSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { CONVOCATION_OPEN, hasRole, ROLE_COORDINATOR } from "./policy"
import { convocationName } from "./syllabusSql"
import { phpFalsy } from "./teacherSyllabi"
import { createConvocationRepository } from "./convocationQueries"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export const TEMPLATE_NAME = "Plantilla institucional de sílabo"

export type ConvocationListFilters = { careerId: string | null; search: string | null; state: string | null }
export type ProcessListRow = { processId: string; processState: string; period: string; convocationId: string | null; convocationState: string | null; syllabiCount: number }
export type ConvocationRecord = { id: string; careerId: string; career: string; state: string; processState: string; period: string; startsOn: string; dueOn: string }
export type LatestRevision = { id: string; stage: { approved: boolean; verified: boolean }; returnedBy: string | null }
export type ConvocationSyllabus = {
  id: string
  subject: string
  code: string
  liveSubject: string
  state: string
  parallel: string
  startedAt: string | null
  latestRevision: LatestRevision | null
  teachers: string[]
}

export interface ConvocationTx {
  lockConvocation(id: string): Promise<string | null>
  updateState(id: string, state: string): Promise<void>
}

export interface ConvocationRepository {
  page(filters: ConvocationListFilters, page: number, perPage: number): Promise<{ total: number; items: ProcessListRow[] }>
  convocation(id: string): Promise<ConvocationRecord | null>
  syllabi(convocationId: string): Promise<ConvocationSyllabus[]>
  transaction<T>(work: (tx: ConvocationTx) => Promise<T>): Promise<T>
}

export type ConvocationDeps = { bridge: BridgeDeps; convocations: ConvocationRepository; now: () => number }

const PER_PAGE = 20
const CONVOCATION_STATES = ["sin_iniciar", "preparacion", "abierta", "pausada", "cerrada"]
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

export function defaultConvocationDeps(): ConvocationDeps {
  return { bridge: defaultBridgeDeps(), convocations: createConvocationRepository(), now: () => Math.floor(Date.now() / 1000) }
}

function mayView(session: AppSession, convocation: ConvocationRecord): boolean {
  return hasRole(session, ROLE_COORDINATOR) && session.activeRole?.careerId === convocation.careerId
}

export function revisionStage(syllabusState: string, revision: LatestRevision | null): string | null {
  if (syllabusState !== "en_revision" || revision === null || revision.stage.approved) return null
  return revision.stage.verified ? "coordinacion" : "biblioteca"
}

function byteOrder(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

export async function convocations(request: Request, deps: ConvocationDeps = defaultConvocationDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!hasRole(session, ROLE_COORDINATOR)) return forbidden()
  const input = phpQuery(new URL(request.url))
  const { errors } = await validateSchema(listingFiltersSchema(CONVOCATION_STATES), input)
  if (errors !== null) return validationError(errors)
  const search = typeof input.q === "string" ? input.q.replace(PHP_TRIM, "") : null
  const state = typeof input.state === "string" && CONVOCATION_STATES.includes(input.state) ? input.state : null
  const query = queryParams(new URL(request.url))
  const currentPage = resolveCurrentPage(query.get("page") ?? null)
  const filters = { careerId: session.activeRole?.careerId ?? null, search: phpFalsy(search) ? null : search, state }
  const { total, items } = await deps.convocations.page(filters, currentPage, PER_PAGE)
  const data = items.map((item) => ({
    id: item.convocationId,
    process_id: item.processId,
    name: item.period,
    state: item.convocationState ?? "sin_iniciar",
    process_state: item.processState,
    period: item.period,
    template: TEMPLATE_NAME,
    syllabi_count: item.syllabiCount,
  }))
  return apiJson({
    filters: { q: filters.search, state },
    convocations: lengthAwarePaginator({ items: data, total, perPage: PER_PAGE, currentPage, path: requestUrl(request), query }),
  })
}

async function boundConvocation(request: Request, id: string, deps: ConvocationDeps): Promise<{ session: AppSession; convocation: ConvocationRecord } | Response> {
  let convocation: ConvocationRecord | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        convocation = isUuid(id) ? await deps.convocations.convocation(id) : null
        return convocation === null ? modelNotFound(MODELS.convocation, id) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (convocation === null) return modelNotFound(MODELS.convocation, id)
  return { session, convocation }
}

export async function convocationDetail(request: Request, id: string, deps: ConvocationDeps = defaultConvocationDeps()): Promise<Response> {
  const bound = await boundConvocation(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, convocation } = bound
  if (!mayView(session, convocation)) return aborted(403)
  const syllabi = (await deps.convocations.syllabi(convocation.id))
    .map((item, index) => ({ item, index }))
    .sort((left, right) => byteOrder(`${left.item.liveSubject}|${left.item.parallel}`, `${right.item.liveSubject}|${right.item.parallel}`) || left.index - right.index)
    .map(({ item }) => item)
  const count = (state: string) => syllabi.filter((item) => item.state === state).length
  return apiJson({
    convocation: {
      id: convocation.id,
      name: convocationName(convocation.career, convocation.period),
      state: convocation.state,
      process: { name: convocation.period, state: convocation.processState },
      period: convocation.period,
      template: TEMPLATE_NAME,
      start_date: convocation.startsOn,
      draft_deadline: convocation.dueOn,
      counts: { total: syllabi.length, not_started: count("sin_iniciar"), draft: count("borrador"), in_review: count("en_revision"), approved: count("aprobado") },
      syllabi: syllabi.map((item) => ({
        id: item.id,
        subject: item.subject,
        code: item.code,
        state: item.state,
        stage: revisionStage(item.state, item.latestRevision),
        revision_id: item.latestRevision?.id ?? null,
        returned_by: item.state === "correccion_solicitada" ? (item.latestRevision?.returnedBy ?? null) : null,
        iniciado_en: item.startedAt,
        parallels: [item.parallel],
        teachers: [...new Set(item.teachers)],
      })),
    },
  })
}

class StateChanged extends Error {}

export async function pauseConvocation(request: Request, id: string, deps: ConvocationDeps = defaultConvocationDeps()): Promise<Response> {
  const bound = await boundConvocation(request, id, deps)
  if (bound instanceof Response) return bound
  const { session, convocation } = bound
  if (!mayView(session, convocation) || convocation.state !== CONVOCATION_OPEN) return forbidden()
  try {
    await deps.convocations.transaction(async (tx) => {
      const state = await tx.lockConvocation(convocation.id)
      if (state === null) throw new Missing(MODELS.convocation, convocation.id)
      if (state !== CONVOCATION_OPEN) throw new StateChanged()
      await tx.updateState(convocation.id, "pausada")
    })
  } catch (error) {
    if (error instanceof StateChanged) return validationError({ convocation: ["Solo una convocatoria abierta puede pausarse."] })
    if (error instanceof HttpFailure) return error.response
    throw error
  }
  return apiJson({ message: "Convocatoria en pausa. Los docentes de la carrera no editan ni envían; la malla queda editable." })
}
