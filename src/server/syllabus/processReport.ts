import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { phpQuery } from "../laravel/input"
import { laravelSlug } from "../documents/slug"
import { processReportWorkbook } from "../excel/reportWorkbooks"
import { xlsxDownload } from "../excel/workbook"
import { forbidden, laravelHttpError, laravelJson, validationError } from "../laravel/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../laravel/throttle"
import { validateInput } from "../laravel/validation"
import { createProcessReportRepository } from "./processReportQueries"
import { phpCompareStrings } from "./syllabusDetailQueries"

export type ReportProcess = { id: string; period: string | null; startsOn: string; dueOn: string; state: string }
export type ReportRevision = { number: number; submittedAt: number; correctionStage: string | null; approvedAt: number | null }
export type ReportSyllabus = { career: string; state: string; teachers: string[]; subject: string; parallel: string; revisions: ReportRevision[] }

export interface ProcessReportRepository {
  options(): Promise<{ value: string; label: string }[]>
  process(id: string | null): Promise<ReportProcess | null>
  syllabi(processId: string): Promise<ReportSyllabus[]>
}

export type ProcessReportDeps = { bridge: BridgeDeps; reports: ProcessReportRepository; now: () => number }

export function defaultProcessReportDeps(): ProcessReportDeps {
  return { bridge: defaultBridgeDeps(), reports: createProcessReportRepository(), now: () => Date.now() / 1000 }
}

const STATES = ["sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]
const OFFSET = -5 * 3600

function localDate(seconds: number): string {
  return new Date((seconds + OFFSET) * 1000).toISOString().slice(0, 10)
}

function endOfLocalDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number)
  return Date.UTC(year, month - 1, day + 1) / 1000 - OFFSET - 0.000001
}

function phpRound(value: number, precision = 0): number {
  const factor = 10 ** precision
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor
}

function compareTuples(left: string[], right: string[]): number {
  for (let index = 0; index < left.length; index++) {
    const order = phpCompareStrings(left[index], right[index])
    if (order !== 0) return order
  }
  return 0
}

type CareerRow = { career: string; total: number; states: Record<string, number>; returns: { coordinacion: number; biblioteca: number }; late: number }

export function buildReport(process: ReportProcess, syllabi: ReportSyllabus[], now: number) {
  const dueAt = endOfLocalDay(process.dueOn)
  const careers = new Map<string, CareerRow>()
  const daily = new Map<string, { first?: number; resubmitted?: number }>()
  const pending: { teachers: string; career: string; subject: string; parallel: string; state: string; late: boolean }[] = []
  let submitted = 0
  let onTime = 0
  const reviewDays: number[] = []
  for (const syllabus of syllabi) {
    const row = careers.get(syllabus.career) ?? {
      career: syllabus.career,
      total: 0,
      states: Object.fromEntries(STATES.map((state) => [state, 0])),
      returns: { coordinacion: 0, biblioteca: 0 },
      late: 0,
    }
    careers.set(syllabus.career, row)
    row.total++
    const state = STATES.includes(syllabus.state) ? syllabus.state : "borrador"
    row.states[state]++
    const revisions = [...syllabus.revisions].sort((left, right) => left.number - right.number)
    for (const revision of revisions) {
      const day = localDate(revision.submittedAt)
      const kind = revision.number === 1 ? "first" : "resubmitted"
      const counts = daily.get(day) ?? {}
      counts[kind] = (counts[kind] ?? 0) + 1
      daily.set(day, counts)
      if (revision.correctionStage === "coordinacion" || revision.correctionStage === "biblioteca") row.returns[revision.correctionStage]++
    }
    const first = revisions[0]
    if (first !== undefined) {
      submitted++
      if (first.submittedAt <= dueAt) onTime++
      const approval = revisions.filter((revision) => revision.approvedAt !== null).at(-1)
      if (state === "aprobado" && approval !== undefined) reviewDays.push((approval.approvedAt! - first.submittedAt) / 86400)
    }
    const late = state !== "aprobado" && state !== "en_revision" && now > dueAt
    if (late) row.late++
    if (state !== "aprobado") {
      pending.push({ teachers: [...new Set(syllabus.teachers)].join(", "), career: syllabus.career, subject: syllabus.subject, parallel: syllabus.parallel, state, late })
    }
  }
  const sortedCareers = [...careers.values()].sort((left, right) => phpCompareStrings(left.career, right.career))
  pending.sort((left, right) => compareTuples([left.career, left.teachers, left.subject], [right.career, right.teachers, right.subject]))
  const total = syllabi.length
  const approved = sortedCareers.reduce((sum, row) => sum + row.states.aprobado, 0)
  return {
    process: { id: process.id, period: process.period, starts_at: process.startsOn, due_at: process.dueOn, state: process.state },
    kpis: {
      total,
      approved_percent: total === 0 ? 0 : phpRound((approved * 100) / total),
      on_time_percent: submitted === 0 ? null : phpRound((onTime * 100) / submitted),
      review_days: reviewDays.length === 0 ? null : phpRound(reviewDays.reduce((sum, value) => sum + value, 0) / reviewDays.length, 1),
    },
    careers: sortedCareers.map((row) => ({
      ...row,
      approved: row.states.aprobado,
      pending: row.total - row.states.aprobado,
      returned: row.states.correccion_solicitada,
      progress: phpRound((row.states.aprobado * 100) / Math.max(1, row.total)),
    })),
    daily: [...daily.entries()]
      .sort(([left], [right]) => phpCompareStrings(left, right))
      .map(([day, counts]) => ({ day, first: counts.first ?? 0, resubmitted: counts.resubmitted ?? 0 })),
    pending,
  }
}

export async function processReport(request: Request, deps: ProcessReportDeps = defaultProcessReportDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active || session.activeRole?.role !== "administrador") return forbidden()
  const input = phpQuery(new URL(request.url))
  const errors = await validateInput(input, { process: ["nullable", "uuid"] }, { process: "convocatoria" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const requested = typeof input.process === "string" && input.process !== "" ? input.process : null
  const process = await deps.reports.process(requested)
  if (requested !== null && process === null) return deps.bridge.forward(request)
  return laravelJson({
    options: await deps.reports.options(),
    report: process === null ? null : buildReport(process, await deps.reports.syllabi(process.id), deps.now()),
  })
}

export type ProcessReportExportDeps = ProcessReportDeps & { limiter: RateLimiter }

export async function exportProcessReport(request: Request, deps: ProcessReportExportDeps = { ...defaultProcessReportDeps(), limiter: sharedRateLimiter() }): Promise<Response> {
  let gate: Throttle | null = null
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: (user) => {
        gate = throttle(deps.limiter, { key: `throttle:10,1:${user.id}`, maxAttempts: 10, decaySeconds: 60 }, deps.bridge.now)
        return gate.hit()
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return finish(session)
  if (!session.user.active || session.activeRole?.role !== "administrador") return finish(forbidden())
  const input = phpQuery(new URL(request.url))
  const errors = await validateInput(input, { process: ["nullable", "uuid"] }, { process: "convocatoria" })
  if (Object.keys(errors).length > 0) return finish(validationError(errors))
  const requested = typeof input.process === "string" && input.process !== "" ? input.process : null
  const process = await deps.reports.process(requested)
  if (requested !== null && process === null) return finish(await deps.bridge.forward(request))
  if (process === null) return finish(laravelHttpError(404, "No hay convocatorias para reportar."))
  const data = buildReport(process, await deps.reports.syllabi(process.id), deps.now())
  return finish(xlsxDownload(await processReportWorkbook(data), `reporte-${laravelSlug(String(data.process.period ?? "convocatoria"))}.xlsx`))
}
