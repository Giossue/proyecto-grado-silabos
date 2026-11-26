import { carbonInstant, institutionDateOfValue } from "@silabos/shared/lib/phpDates"
import { HttpFailure, Missing } from "../http/failures"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { processCreationSchema, redoConfirmationSchema } from "@silabos/shared/schemas/syllabus"
import { mergeErrors, validateSchema } from "../http/schemaValidation"
import { list, phpString } from "../configuration/phpValues"
import { normalizeFieldDocument, TemplateValidationError, type TemplateDefinition } from "../configuration/templateRuntime"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import { institutionToday } from "../shared/clock"
import { hasRole, PROCESS_OPEN, PROCESS_PAUSED, ROLE_ADMINISTRATOR } from "./policy"
import { TEMPLATE_NAME } from "./convocations"
import { createProcessRepository } from "./processQueries"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

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
  lockInProgress(): Promise<{ id: string; period: string | null } | null>
  periodHasProcess(periodId: string): Promise<boolean>
  createProcess(periodId: string, startsAt: string, dueAt: string): Promise<string>
}

export interface ProcessRepository {
  list(): Promise<ProcessRow[]>
  templateHasFields(templateId: string): Promise<boolean>
  periods(): Promise<{ id: string; codigo: string }[]>
  find(id: string): Promise<ProcessRow | null>
  counts(processId: string): Promise<{ state: string; total: number }[]>
  periodEndsOn(periodId: string): Promise<string | null>
  activeCareerCount(): Promise<number>
  activeCareersWithoutCoordinator(): Promise<number>
  transaction<T>(work: (tx: ProcessTx) => Promise<T>): Promise<T>
}

export type ProcessDeps = { bridge: BridgeDeps; processes: ProcessRepository; templates: TemplateStore; today: () => string; now: () => number }

export type ProcessCoreDeps = Omit<ProcessDeps, "bridge">

const MAX_EXTENSIONS = 2
const ANOTHER_IN_PROGRESS = "Hay otra convocatoria en curso; finalícela o elimínela antes de reabrir esta"
const TEMPLATE_NOT_READY = "La plantilla no está lista para usarse. Complétela; «Antes de empezar» indica qué falta."
const IN_PROGRESS = [PROCESS_OPEN, PROCESS_PAUSED]
const EMPTY_COUNTS = ["sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]

export function defaultProcessDeps(): ProcessDeps {
  return { bridge: defaultBridgeDeps(), processes: createProcessRepository(), templates: createTemplateStore(), today: institutionToday, now: () => Math.floor(Date.now() / 1000) }
}


export function display(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

export function templateProblem(template: SyllabusTemplate, definition: TemplateDefinition, errorKey = "template"): string | null {
  const keys = template.sections.map((section) => section.key)
  const missing = list(definition.required_sections)
    .map((key) => phpString(key))
    .filter((key) => !keys.includes(key))
  if (missing.length > 0) return `La plantilla no tiene las áreas obligatorias: ${missing.join(", ")}.`
  for (const section of template.sections) {
    if (section.blocks.length === 0) return `La sección «${section.title}» de la plantilla está vacía.`
    for (const block of section.blocks) {
      if (block.fields.length === 0) return `La sección «${block.title}» de la plantilla no tiene campos.`
      for (const field of block.fields) {
        try {
          normalizeFieldDocument(field.content, definition, errorKey)
        } catch (error) {
          if (error instanceof TemplateValidationError) return Object.values(error.errors).flat()[0] ?? "La plantilla no se puede usar."
          throw error
        }
      }
    }
  }
  return null
}

export function templateUsable(template: SyllabusTemplate, definition: TemplateDefinition): boolean {
  return templateProblem(template, definition) === null
}

function blockReason(process: ProcessRow, all: ProcessRow[], template: SyllabusTemplate | null, today: string): string | null {
  if (process.extensions >= MAX_EXTENSIONS) return `Ya se usaron las ${MAX_EXTENSIONS} prórrogas de esta convocatoria.`
  const limitOn = process.periodEndsOn
  if (process.dueOn >= limitOn) return `El plazo ya llega al último día de clases (${display(limitOn)}).`
  if (limitOn < today) return `Las clases del período terminaron el ${display(limitOn)}.`
  if (process.state === "cerrado" && all.some((other) => other.id !== process.id && IN_PROGRESS.includes(other.state))) return ANOTHER_IN_PROGRESS
  if (process.state === "cerrado") {
    if (template === null) return TEMPLATE_NOT_READY
    if (!templateUsable(template, template.definition)) return TEMPLATE_NOT_READY
  }
  return null
}

async function administrator(request: Request, deps: ProcessDeps): Promise<AppSession | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  return hasRole(session, ROLE_ADMINISTRATOR) ? session : forbidden()
}

export async function syllabusProcesses(request: Request, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const session = await administrator(request, deps)
  if (session instanceof Response) return session
  return processList(deps)
}

export async function processList(deps: ProcessCoreDeps): Promise<Response> {
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
    if (error instanceof HttpFailure) return error.response
    throw error
  }
  const structured = template !== null && template.sections.length > 0 && template.sections.some((section) => section.blocks.length > 0) && (await deps.processes.templateHasFields(template.id))
  const active = rows.find((process) => IN_PROGRESS.includes(process.state)) ?? null
  return apiJson({
    processes,
    template: structured ? TEMPLATE_NAME : null,
    periods: await deps.processes.periods(),
    active_process: active === null ? null : { name: active.period, period: active.period, state: active.state },
  })
}

async function boundProcess(request: Request, id: string, deps: ProcessDeps): Promise<{ session: AppSession; process: ProcessRow } | Response> {
  let process: ProcessRow | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        process = isUuid(id) ? await deps.processes.find(id) : null
        return process === null ? modelNotFound(MODELS.process, id) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (process === null) return modelNotFound(MODELS.process, id)
  return { session, process }
}

export async function processImpact(request: Request, id: string, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const bound = await boundProcess(request, id, deps)
  if (bound instanceof Response) return bound
  if (!hasRole(bound.session, ROLE_ADMINISTRATOR)) return forbidden()
  return processImpactOf(bound.process, deps)
}

export async function processImpactOf(process: ProcessRow, deps: ProcessCoreDeps): Promise<Response> {
  const syllabi: Record<string, number> = Object.fromEntries(EMPTY_COUNTS.map((state) => [state, 0]))
  for (const row of await deps.processes.counts(process.id)) syllabi[row.state] = row.total
  return apiJson({ syllabi, total: Object.values(syllabi).reduce((sum, value) => sum + value, 0) })
}

class StateChanged extends Error {}

export async function pauseProcess(request: Request, id: string, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const original = request.clone()
  const bound = await boundProcess(original, id, deps)
  if (bound instanceof Response) return bound
  return pauseBoundProcess(bound.session, bound.process, await requestInput(request), deps)
}

export async function pauseBoundProcess(session: AppSession, process: ProcessRow, input: PhpArray, deps: ProcessCoreDeps): Promise<Response> {
  if (!hasRole(session, ROLE_ADMINISTRATOR) || process.state !== PROCESS_OPEN) return forbidden()
  const { errors } = await validateSchema(redoConfirmationSchema, input)
  if (errors !== null) return validationError(errors)
  try {
    await deps.processes.transaction(async (tx) => {
      const state = await tx.lockProcess(process.id)
      if (state === null) throw new Missing(MODELS.process, process.id)
      if (state !== PROCESS_OPEN) throw new StateChanged()
      await tx.pause(process.id)
    })
  } catch (error) {
    if (error instanceof StateChanged) return validationError({ process: ["El proceso no está en un estado que admita esta acción."] })
    if (error instanceof HttpFailure) return error.response
    throw error
  }
  return apiJson({ message: "Proceso en pausa. Los envíos se detienen y la plantilla queda editable." })
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DUE_MESSAGE = "La fecha de entrega debe ser posterior al inicio y a hoy."

function institutionTimezone(): string {
  return process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"
}

function localParts(time: number): { day: string; offset: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: institutionTimezone(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  )
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, offset: local - Math.floor(time / 1000) * 1000 }
}


function localMoment(day: string, seconds: number): string {
  const [year, month, date] = day.split("-").map(Number)
  const wall = Date.UTC(year, month - 1, date) + seconds * 1000
  let time = wall - localParts(wall).offset
  time = wall - localParts(time).offset
  return `${new Date(time).toISOString().slice(0, 19)}+00:00`
}

export function processDay(value: PhpValue | undefined, start: boolean): PhpValue | undefined {
  if (typeof value !== "string" || value.trim() === "") return value
  const day = DATE_ONLY.test(value) ? value : institutionDateOfValue(value)
  if (day === null) return value
  return localMoment(day, start ? 0 : 86_399)
}

function dayOf(value: PhpValue | undefined): string | null {
  return institutionDateOfValue(value)
}

export function processInstant(value: PhpValue | undefined): number {
  return Math.floor((carbonInstant(String(value)) ?? Number.NaN) / 1000)
}

function eloquentMoment(value: PhpValue | undefined): string {
  if (typeof value === "number") return `${new Date(value * 1000).toISOString().slice(0, 19)}+00:00`
  return value as string
}

class CreateRejected extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("rejected")
  }
}

async function createValidation(input: PhpArray, deps: ProcessCoreDeps): Promise<Record<string, string[]>> {
  const errors = (await validateSchema(processCreationSchema(async (value) => typeof value === "string" && (await deps.processes.periodEndsOn(value)) !== null), input)).errors ?? {}
  const today = deps.today()
  const startsOn = dayOf(input.starts_at)
  const dueOn = dayOf(input.due_at)
  if (startsOn !== null && startsOn < today) mergeErrors(errors, "starts_at", ["El inicio no puede ser anterior a hoy."])
  if (dueOn !== null && dueOn < today) mergeErrors(errors, "due_at", [DUE_MESSAGE])
  if (startsOn !== null && dueOn !== null && dueOn < startsOn) mergeErrors(errors, "due_at", [DUE_MESSAGE])
  const periodId = input.period_id
  const endOn = typeof periodId === "string" ? await deps.processes.periodEndsOn(periodId) : null
  if (endOn === null) return errors
  if (endOn < today) {
    mergeErrors(errors, "period_id", [`El período académico ya terminó (${display(endOn)}). Elija uno vigente.`])
    return errors
  }
  for (const [key, on] of [["starts_at", startsOn], ["due_at", dueOn]] as const) {
    if (on !== null && on > endOn) mergeErrors(errors, key, [`La fecha no puede pasar del fin del período (${display(endOn)}).`])
  }
  return errors
}

async function assertInstitutionReady(deps: ProcessCoreDeps): Promise<SyllabusTemplate> {
  const template = await deps.templates.template()
  const structured =
    template !== null && template.sections.length > 0 && template.sections.some((section) => section.blocks.length > 0) && (await deps.processes.templateHasFields(template.id))
  if (template === null || !structured) {
    throw new CreateRejected({ process: ["La plantilla institucional está vacía. Aplique el formato oficial o configure sus bloques antes de abrir la convocatoria."] })
  }
  const problem = templateProblem(template, template.definition, "process")
  if (problem !== null) throw new CreateRejected({ process: [problem] })
  if ((await deps.processes.activeCareerCount()) === 0) throw new CreateRejected({ process: ["No existen carreras activas en la estructura institucional."] })
  const withoutCoordinator = await deps.processes.activeCareersWithoutCoordinator()
  if (withoutCoordinator > 0) {
    throw new CreateRejected({ process: [`La estructura institucional no está lista: ${withoutCoordinator} carrera(s) sin coordinación activa.`] })
  }
  return template
}

export async function createProcess(request: Request, deps: ProcessDeps = defaultProcessDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  return createProcessFor(session, await requestInput(request), deps)
}

export async function createProcessFor(session: AppSession, input: PhpArray, deps: ProcessCoreDeps): Promise<Response> {
  input.starts_at = processDay(input.starts_at, true) as PhpValue
  input.due_at = processDay(input.due_at, false) as PhpValue
  if (!hasRole(session, ROLE_ADMINISTRATOR)) return forbidden()
  const errors = await createValidation(input, deps)
  if (Object.keys(errors).length > 0) return validationError(errors)
  const periodId = input.period_id as string
  const startsAt = eloquentMoment(input.starts_at)
  const dueAt = eloquentMoment(input.due_at)
  try {
    await assertInstitutionReady(deps)
    await deps.processes.transaction(async (tx) => {
      const active = await tx.lockInProgress()
      if (active !== null) {
        throw new CreateRejected({
          process: [`La convocatoria «${active.period ?? ""}» sigue vigente. Finalícela o elimínela antes de abrir otra convocatoria institucional.`],
        })
      }
      if (await tx.periodHasProcess(periodId)) throw new CreateRejected({ period_id: ["Ya existe una convocatoria institucional para este período académico."] })
      await tx.createProcess(periodId, startsAt, dueAt)
    })
  } catch (error) {
    if (error instanceof CreateRejected) return validationError(error.errors)
    if (error instanceof HttpFailure) return error.response
    throw error
  }
  return apiJson({ message: "Convocatoria institucional abierta. Las coordinaciones ya pueden iniciar sus convocatorias." }, 201)
}
