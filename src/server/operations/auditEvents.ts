import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { isYmdAfterOrEqual, passesYmdFormat } from "../laravel/dates"
import { laravelInput, type PhpValue } from "../laravel/input"
import { lengthAwarePaginator, resolveCurrentPage } from "../laravel/pagination"
import { laravelQuery, laravelRequestUrl } from "../laravel/request"
import { laravelJson, validationError } from "../laravel/responses"
import { phpIsNumeric, validateInput } from "../laravel/validation"
import { createAuditRepository } from "./auditEventQueries"
import labels from "./auditLabels.json"

export type AuditFilters = {
  technical: boolean
  action: string
  result: string
  from: string
  to: string
  period: string
  role: string
  career: string
}

export type AuditEventRow = {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  result: string
  actorUserId: string | null
  actorName: string | null
  actorUserName: string | null
  actorRole: string | null
  assignmentRole: string | null
  actorCareer: string | null
  assignmentCareer: string | null
  metadata: unknown
  occurredAt: string
}

export type Option = { value: string; label: string }

export interface AuditRepository {
  page(filters: AuditFilters, page: number, perPage: number): Promise<{ total: number; items: AuditEventRow[] }>
  actionOptions(): Promise<string[]>
  periodOptions(): Promise<Option[]>
  careerOptions(): Promise<Option[]>
  targetNames(type: string, ids: string[]): Promise<Map<string, string>>
}

export type AuditDeps = { bridge: BridgeDeps; audit: AuditRepository }

type Detail = { label: string; value: string | number | boolean }

const PER_PAGE = 20
const FORBIDDEN = "No tiene permiso para hacer esto."
const ACTIONS: Record<string, string> = labels.actions
const RESOURCES: Record<string, string> = labels.resources
const DETAILS: Record<string, string> = labels.details
const PAIRS: Record<string, string> = labels.pairs
const VALUES: Record<string, string> = labels.values
export const ROLE_LABELS: Record<string, string> = {
  administrador: "Administrador",
  coordinador: "Coordinador",
  docente: "Docente",
  bibliotecario: "Bibliotecario",
}
const ATTRIBUTES = {
  technical: "actividad técnica",
  action: "acción",
  result: "resultado",
  period: "período",
  role: "rol",
  career: "carrera",
  from: "fecha desde",
  to: "fecha hasta",
}

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

export function actionLabel(action: string): string {
  return own(ACTIONS, action) ?? "Acción registrada"
}

export function resourceLabel(resource: string): string {
  return own(RESOURCES, resource) ?? "Recurso del sistema"
}

type Scalar = string | number | boolean

function isScalar(value: unknown): value is Scalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

function phpTruthy(value: Scalar | null): boolean {
  if (typeof value === "string") return value !== "" && value !== "0"
  if (typeof value === "number") return value !== 0
  return value === true
}

function looseEquals(left: Scalar | null, right: Scalar | null): boolean {
  if (left === null && right === null) return true
  if (left === null || right === null) {
    const other = (left === null ? right : left) as Scalar
    if (typeof other === "string") return other === ""
    return !phpTruthy(other)
  }
  if (typeof left === "boolean" || typeof right === "boolean") return phpTruthy(left) === phpTruthy(right)
  if (typeof left === "number" && typeof right === "number") return left === right
  if (typeof left === "number" || typeof right === "number") {
    const text = (typeof left === "string" ? left : right) as string
    const number = (typeof left === "number" ? left : right) as number
    return phpIsNumeric(text) ? Number(text) === number : text === String(number)
  }
  if (phpIsNumeric(left) && phpIsNumeric(right)) return Number(left) === Number(right)
  return left === right
}

function valueText(value: Scalar | null): string {
  if (value === null || value === "") return "—"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  return own(VALUES, String(value)) ?? String(value)
}

export function safeDetails(metadata: unknown): Detail[] {
  const entries: [string, unknown][] = typeof metadata === "object" && metadata !== null ? Object.entries(metadata) : []
  const values = new Map(entries)
  const paired: string[] = []
  const details: Detail[] = []
  for (const [field, label] of Object.entries(PAIRS)) {
    const [beforeKey, afterKey] = field === "state" ? ["from_state", "to_state"] : [`before_${field}`, `after_${field}`]
    if (!values.has(beforeKey) && !values.has(afterKey)) continue
    paired.push(beforeKey, afterKey)
    const before = values.get(beforeKey) ?? null
    const after = values.get(afterKey) ?? null
    if ((before !== null && !isScalar(before)) || (after !== null && !isScalar(after))) continue
    if (!looseEquals(before as Scalar | null, after as Scalar | null)) {
      details.push({ label, value: `${valueText(before as Scalar | null)} → ${valueText(after as Scalar | null)}` })
    }
  }
  for (const [key, value] of entries) {
    const label = own(DETAILS, key)
    if (!paired.includes(key) && label !== undefined && isScalar(value)) {
      details.push({ label, value: typeof value === "string" ? (own(VALUES, value) ?? value) : value })
    }
  }
  return details
}

function actorName(event: AuditEventRow): string {
  if (event.actorName !== null) return event.actorName
  if (event.actorUserName !== null) return event.actorUserName
  return event.actorUserId === null ? "Sistema" : "Cuenta eliminada"
}

async function describeTargets(events: AuditEventRow[], repository: AuditRepository): Promise<Map<string, string>> {
  const byType = new Map<string, string[]>()
  for (const event of events) {
    if (event.resourceId === null || event.resourceId === "") continue
    const ids = byType.get(event.resourceType) ?? []
    if (!ids.includes(event.resourceId)) ids.push(event.resourceId)
    byType.set(event.resourceType, ids)
  }
  const names = new Map<string, Map<string, string>>()
  for (const [type, ids] of byType) names.set(type, await repository.targetNames(type, ids))
  return new Map(events.map((event) => [event.id, event.resourceId === null ? "" : (names.get(event.resourceType)?.get(event.resourceId) ?? "")]))
}

function stringInput(value: PhpValue | undefined): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (value === true) return "1"
  return ""
}

function booleanInput(value: PhpValue | undefined): boolean {
  if (value === true) return true
  if (typeof value === "number") return value === 1
  return typeof value === "string" && ["1", "true", "on", "yes"].includes(value.toLowerCase())
}

function defaultDeps(): AuditDeps {
  return { bridge: defaultBridgeDeps(), audit: createAuditRepository() }
}

export async function listAuditEvents(request: Request, deps: AuditDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (session.activeRole?.role !== "administrador") return laravelJson({ message: FORBIDDEN }, 403)

  const input = await laravelInput(request)
  const dateFormat = { check: passesYmdFormat, message: "El campo :attribute debe coincidir con el formato Y-m-d." }
  const errors = await validateInput(
    input,
    {
      technical: ["nullable", "boolean"],
      action: ["nullable", "string", { max: 120 }],
      result: ["nullable", "string", { in: ["exito", "fallido"] }],
      period: ["nullable", "uuid"],
      role: ["nullable", "string", { max: 40 }],
      career: ["nullable", "uuid"],
      from: ["nullable", dateFormat],
      to: [
        "nullable",
        dateFormat,
        { check: (value) => isYmdAfterOrEqual(value, input.from), message: "El campo :attribute debe ser una fecha posterior o igual a fecha desde." },
      ],
    },
    ATTRIBUTES,
  )
  if (Object.keys(errors).length > 0) return validationError(errors)

  const filters: AuditFilters = {
    technical: booleanInput(input.technical),
    action: stringInput(input.action),
    result: stringInput(input.result),
    from: stringInput(input.from),
    to: stringInput(input.to),
    period: stringInput(input.period),
    role: stringInput(input.role),
    career: stringInput(input.career),
  }
  const query = laravelQuery(new URL(request.url))
  const currentPage = resolveCurrentPage(query.get("page") ?? null)
  const { total, items } = await deps.audit.page(filters, currentPage, PER_PAGE)
  const targets = await describeTargets(items, deps.audit)
  const actions = await deps.audit.actionOptions()
  const periods = await deps.audit.periodOptions()
  const careers = await deps.audit.careerOptions()

  return laravelJson({
    filters,
    action_options: actions.map((value) => ({ value, label: actionLabel(value) })),
    period_options: periods,
    role_options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
    career_options: careers,
    events: lengthAwarePaginator({
      items: items.map((event) => ({
        id: event.id,
        action: actionLabel(event.action),
        resource: resourceLabel(event.resourceType),
        target: targets.get(event.id) ?? "",
        result: event.result,
        actor: actorName(event),
        role: event.actorRole ?? (event.assignmentRole === null ? null : (ROLE_LABELS[event.assignmentRole] ?? null)),
        career: event.actorCareer ?? event.assignmentCareer,
        details: safeDetails(event.metadata),
        occurred_at: event.occurredAt,
      })),
      total,
      perPage: PER_PAGE,
      currentPage,
      path: laravelRequestUrl(request),
      query,
    }),
  })
}
