import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { laravelJson } from "../laravel/responses"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import { createDashboardRepository, institutionToday } from "./dashboardQueries"
import { administratorMetrics, administratorSetup, coordinatorReadiness, coordinatorSetup, SetupNeedsLaravel, type SetupRepository } from "./setupChecklist"
import { createSetupRepository } from "./setupQueries"

export type ProcessRecord = {
  id: string
  state: string
  period: string
  startsOn: string
  dueOn: string
  periodEndsOn: string
}

export type ConvocationRecord = { id: string; state: string }

export type TeacherSyllabus = { convocation: ConvocationRecord; process: ProcessRecord; dueAt: number }

export interface DashboardRepository {
  inProgressProcess(): Promise<ProcessRecord | null>
  latestProcess(): Promise<ProcessRecord | null>
  convocation(careerId: string, processId: string): Promise<ConvocationRecord | null>
  teacherOpenSyllabi(userId: string, careerId: string | null): Promise<TeacherSyllabus[]>
  finalizedTeacherConvocation(userId: string, processId: string, careerId: string | null): Promise<ConvocationRecord | null>
  libraryCounts(): Promise<Record<string, number>>
}

export type DashboardDeps = { bridge: BridgeDeps; dashboard: DashboardRepository; today: () => string; setup: SetupRepository; templates: TemplateStore }

type Deadline = Record<string, unknown>

const PROCESS_PAUSED = "pausado"
const PROCESS_CLOSED = "cerrado"
const PROCESS_OPEN = "abierto"
const CONVOCATION_PAUSED = "pausada"
const CONVOCATION_CLOSED = "cerrada"
const CONVOCATION_PREPARATION = "preparacion"

function defaultDeps(): DashboardDeps {
  return { bridge: defaultBridgeDeps(), dashboard: createDashboardRepository(), today: institutionToday, setup: createSetupRepository(), templates: createTemplateStore() }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function deadlinePayload(process: ProcessRecord, convocation: ConvocationRecord | null, today: string): Deadline {
  const start = process.startsOn
  const due = process.dueOn
  let state = "active"
  if (process.state === PROCESS_CLOSED || convocation?.state === CONVOCATION_CLOSED) state = "closed"
  else if (process.state === PROCESS_PAUSED || convocation?.state === CONVOCATION_PAUSED) state = "paused"
  else if (today < start) state = "upcoming"
  else if (today > due) state = "overdue"
  return {
    period: process.period,
    starts_at: start,
    due_at: due,
    state,
    days_until_start: Math.max(0, daysBetween(today, start)),
    days_until_due: Math.max(0, daysBetween(today, due)),
    convocation_id: convocation?.id ?? null,
    paused_by: state !== "paused" ? null : process.state === PROCESS_PAUSED ? "administracion" : "coordinacion",
    classes_ended: today > process.periodEndsOn,
    career_pending: false,
  }
}

async function careerDeadline(careerId: string | null, deps: DashboardDeps, today: string): Promise<Deadline | null> {
  const process = await deps.dashboard.latestProcess()
  if (process === null || careerId === null) return null
  const convocation = await deps.dashboard.convocation(careerId, process.id)
  return { ...deadlinePayload(process, convocation, today), career_pending: convocation === null || convocation.state === CONVOCATION_PREPARATION }
}

async function teacherDeadline(session: LaravelSession, deps: DashboardDeps, today: string): Promise<Deadline | null> {
  const careerId = session.activeRole?.careerId ?? null
  const syllabi = await deps.dashboard.teacherOpenSyllabi(session.user.id, careerId)
  const [nearest] = [...syllabi].sort((left, right) => left.dueAt - right.dueAt)
  if (nearest) return deadlinePayload(nearest.process, nearest.convocation, today)

  const inProgress = await deps.dashboard.inProgressProcess()
  if (inProgress !== null) {
    const convocation = careerId === null ? null : await deps.dashboard.convocation(careerId, inProgress.id)
    const paused = inProgress.state === PROCESS_PAUSED || convocation?.state === CONVOCATION_PAUSED
    if (paused) return deadlinePayload(inProgress, convocation, today)
  }

  const latest = await deps.dashboard.latestProcess()
  if (latest === null || latest.state !== PROCESS_CLOSED) return null
  const convocation = await deps.dashboard.finalizedTeacherConvocation(session.user.id, latest.id, careerId)
  return convocation === null ? null : deadlinePayload(latest, convocation, today)
}

async function libraryDeadline(deps: DashboardDeps, today: string): Promise<Deadline | null> {
  const process = await deps.dashboard.latestProcess()
  return process === null ? null : deadlinePayload(process, null, today)
}

async function administratorPause(deps: DashboardDeps, today: string): Promise<Deadline | null> {
  const process = await deps.dashboard.latestProcess()
  return process === null || process.state === PROCESS_OPEN ? null : deadlinePayload(process, null, today)
}

async function libraryMetrics(deps: DashboardDeps) {
  const totals = await deps.dashboard.libraryCounts()
  const count = (key: string) => totals[key] ?? 0
  return [
    {
      key: "library_pending",
      label: "En revisión",
      value: count("pendiente"),
      suffix: null,
      hint: count("pendiente") === 0 ? "Nada pendiente por ahora" : "Enviados por los docentes; falta verificar la bibliografía",
    },
    { key: "library_signed", label: "Aprobados", value: count("firmado"), suffix: null, hint: "Bibliografía aprobada y firmada" },
    { key: "library_commented", label: "Corrección solicitada", value: count("devuelto"), suffix: null, hint: "Con observaciones para el docente" },
  ]
}

export async function dashboardDeadline(request: Request, deps: DashboardDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const today = deps.today()
  let deadline: Deadline | null = null
  switch (session.activeRole?.role) {
    case "coordinador":
      deadline = await careerDeadline(session.activeRole.careerId, deps, today)
      break
    case "docente":
      deadline = await teacherDeadline(session, deps, today)
      break
    case "bibliotecario":
      deadline = await libraryDeadline(deps, today)
      break
    case "administrador":
      deadline = await administratorPause(deps, today)
      break
  }
  return laravelJson({ deadline })
}

async function administratorDashboard(deps: DashboardDeps, today: string): Promise<Record<string, unknown>> {
  return {
    metrics: await administratorMetrics(await deps.dashboard.inProgressProcess(), deps.setup, today),
    setup: await administratorSetup(deps.setup, deps.templates),
    deadline: null,
    coordination_convocation: null,
  }
}

async function coordinatorDashboard(careerId: string | null, deps: DashboardDeps, today: string): Promise<Record<string, unknown>> {
  const readiness =
    careerId === null
      ? null
      : await coordinatorReadiness(careerId, await deps.dashboard.inProgressProcess(), (career, process) => deps.dashboard.convocation(career, process), deps.setup, deps.templates, today)
  const process = readiness?.process ?? null
  const convocation = readiness?.convocation ?? null
  return {
    metrics: [],
    setup: await coordinatorSetup(careerId, readiness, deps.setup),
    deadline:
      process === null
        ? null
        : { ...deadlinePayload(process, convocation, today), career_pending: convocation === null || convocation.state === CONVOCATION_PREPARATION },
    coordination_convocation:
      careerId === null || readiness === null || process === null
        ? null
        : {
            process_id: process.id,
            period: process.period,
            convocation_id: convocation?.id ?? null,
            can_open: readiness.canOpen,
            state: convocation?.state ?? null,
            process_open: process.state === PROCESS_OPEN,
          },
  }
}

export async function dashboardIndex(request: Request, deps: DashboardDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const role = session.activeRole?.role
  const today = deps.today()
  if (role === "administrador" || role === "coordinador") {
    try {
      return laravelJson(role === "administrador" ? await administratorDashboard(deps, today) : await coordinatorDashboard(session.activeRole?.careerId ?? null, deps, today))
    } catch (error) {
      if (error instanceof SetupNeedsLaravel) return deps.bridge.forward(request)
      throw error
    }
  }
  if (role !== "docente" && role !== "bibliotecario") return deps.bridge.forward(request)
  return laravelJson({
    metrics: role === "bibliotecario" ? await libraryMetrics(deps) : [],
    setup: null,
    deadline: role === "bibliotecario" ? await libraryDeadline(deps, today) : await teacherDeadline(session, deps, today),
    coordination_convocation: null,
  })
}
