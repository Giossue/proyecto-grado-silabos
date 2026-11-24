import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { list, phpString } from "../configuration/phpValues"
import { normalizeFieldDocument, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import { institutionToday } from "../dashboard/dashboardQueries"
import { hasRole, PROCESS_OPEN, PROCESS_PAUSED, ROLE_ADMINISTRATOR } from "./policy"
import { TEMPLATE_NAME } from "./convocations"
import { createProcessRepository } from "./processQueries"

export type ProcessRow = {
  id: string
  state: string
  period: string
  periodId: string
  periodEndsOn: string
  startsOn: string
  dueOn: string
  convocationsCount: number
  extensions: number
}

export interface ProcessTx {
  lockProcess(id: string): Promise<string | null>
  pause(id: string): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export interface ProcessRepository {
  list(): Promise<ProcessRow[]>
  templateHasFields(templateId: string): Promise<boolean>
  periods(): Promise<{ id: string; codigo: string }[]>
  find(id: string): Promise<ProcessRow | null>
  counts(processId: string): Promise<{ state: string; total: number }[]>
  transaction<T>(work: (tx: ProcessTx) => Promise<T>): Promise<T>
}

export type ProcessDeps = { bridge: BridgeDeps; processes: ProcessRepository; templates: TemplateStore; today: () => string; now: () => number }

const MAX_EXTENSIONS = 2
const ANOTHER_IN_PROGRESS = "Hay otra convocatoria en curso; finalícela o elimínela antes de reabrir esta"
const TEMPLATE_NOT_READY = "La plantilla no está lista para usarse. Complétela; «Antes de empezar» indica qué falta."
const IN_PROGRESS = [PROCESS_OPEN, PROCESS_PAUSED]
const EMPTY_COUNTS = ["sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]

export function defaultProcessDeps(): ProcessDeps {
  return { bridge: defaultBridgeDeps(), processes: createProcessRepository(), templates: createTemplateStore(), today: institutionToday, now: () => Math.floor(Date.now() / 1000) }
}

class NeedsLaravel extends Error {}

function display(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

export function templateUsable(template: SyllabusTemplate, definition: TemplateDefinition): boolean {
  const keys = template.sections.map((section) => section.key)
  if (list(definition.required_sections).some((key) => !keys.includes(phpString(key)))) return false
  for (const section of template.sections) {
    if (section.blocks.length === 0) return false
    for (const block of section.blocks) {
      if (block.fields.length === 0) return false
      for (const field of block.fields) {
        try {
          normalizeFieldDocument(field.content, definition, "template")
        } catch (error) {
          if (error instanceof TemplateValidationError) return false
          throw error
        }
      }
    }
  }
  return true
}

function blockReason(process: ProcessRow, all: ProcessRow[], template: SyllabusTemplate | null, today: string): string | null {
  if (process.extensions >= MAX_EXTENSIONS) return `Ya se usaron las ${MAX_EXTENSIONS} prórrogas de esta convocatoria.`
  const limitOn = process.periodEndsOn
  if (process.dueOn >= limitOn) return `El plazo ya llega al último día de clases (${display(limitOn)}).`
  if (limitOn < today) return `Las clases del período terminaron el ${display(limitOn)}.`
  if (process.state === "cerrado" && all.some((other) => other.id !== process.id && IN_PROGRESS.includes(other.state))) return ANOTHER_IN_PROGRESS
  if (process.state === "cerrado") {
    if (template === null) return TEMPLATE_NOT_READY
    if (template.definition === null) throw new NeedsLaravel()
    if (!templateUsable(template, template.definition)) return TEMPLATE_NOT_READY
  }
  return null
}

async function administrator(request: Request, deps: ProcessDeps): Promise<LaravelSession | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  return hasRole(session, ROLE_ADMINISTRATOR) ? session : forbidden()
}

export async function syllabusProcesses(request: Request, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const session = await administrator(request, deps)
  if (session instanceof Response) return session
  const template = await deps.templates.template()
  const rows = await deps.processes.list()
  const today = deps.today()
  let processes
  try {
    processes = rows.map((process) => ({
      id: process.id,
      name: process.period,
      state: process.state,
      template: TEMPLATE_NAME,
      period_id: process.periodId,
      period_name: process.period,
      starts_at: process.startsOn,
      due_at: process.dueOn,
      convocations_count: process.convocationsCount,
      configurable: process.state === PROCESS_PAUSED,
      deletable: process.state !== "cerrado",
      extensions_used: process.extensions,
      extensions_max: MAX_EXTENSIONS,
      extension_limit_on: process.periodEndsOn,
      extension_block_reason: blockReason(process, rows, template, today),
    }))
  } catch (error) {
    if (error instanceof NeedsLaravel) return deps.bridge.forward(request)
    throw error
  }
  const structured = template !== null && template.sections.length > 0 && template.sections.some((section) => section.blocks.length > 0) && (await deps.processes.templateHasFields(template.id))
  const active = rows.find((process) => IN_PROGRESS.includes(process.state)) ?? null
  return laravelJson({
    processes,
    template: structured ? TEMPLATE_NAME : null,
    periods: await deps.processes.periods(),
    active_process: active === null ? null : { name: active.period, period: active.period, state: active.state },
  })
}

async function boundProcess(request: Request, id: string, deps: ProcessDeps): Promise<{ session: LaravelSession; process: ProcessRow } | Response> {
  if (!isUuid(id)) return deps.bridge.forward(request)
  let process: ProcessRow | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        process = await deps.processes.find(id)
        return process === null ? deps.bridge.forward(request) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (process === null) return deps.bridge.forward(request)
  return { session, process }
}

export async function processImpact(request: Request, id: string, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const bound = await boundProcess(request, id, deps)
  if (bound instanceof Response) return bound
  if (!hasRole(bound.session, ROLE_ADMINISTRATOR)) return forbidden()
  const syllabi: Record<string, number> = Object.fromEntries(EMPTY_COUNTS.map((state) => [state, 0]))
  for (const row of await deps.processes.counts(bound.process.id)) syllabi[row.state] = row.total
  return laravelJson({ syllabi, total: Object.values(syllabi).reduce((sum, value) => sum + value, 0) })
}

class StateChanged extends Error {}

class Missing extends Error {}

export async function pauseProcess(request: Request, id: string, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const original = request.clone()
  const bound = await boundProcess(original, id, deps)
  if (bound instanceof Response) return bound
  const { session, process } = bound
  if (!hasRole(session, ROLE_ADMINISTRATOR) || process.state !== PROCESS_OPEN) return forbidden()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const errors = await validateInput(await laravelInput(request), { confirmar_rehacer: ["sometimes", "boolean"] }, { confirmar_rehacer: "confirmación para rehacer los sílabos" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  try {
    await deps.processes.transaction(async (tx) => {
      const state = await tx.lockProcess(process.id)
      if (state === null) throw new Missing()
      if (state !== PROCESS_OPEN) throw new StateChanged()
      await tx.pause(process.id)
      await tx.recordAudit({
        actorId: session.user.id,
        roleAssignmentId: session.activeRole?.id ?? null,
        action: "proceso_silabos.pausado",
        resourceType: "proceso_silabos",
        resourceId: process.id,
        result: "exito",
        metadata: { previous_state: state },
        occurredAt: deps.now(),
      })
    })
  } catch (error) {
    if (error instanceof StateChanged) return validationError({ process: ["El proceso no está en un estado que admita esta acción."] })
    if (error instanceof Missing) return deps.bridge.forward(original)
    throw error
  }
  return laravelJson({ message: "Proceso en pausa. Los envíos se detienen y la plantilla queda editable." })
}
