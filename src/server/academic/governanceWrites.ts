import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isJsonRequest, isPhpArray, laravelInput, type PhpArray, type PhpValue } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { mergeErrors, validateInput, type Rule } from "../laravel/validation"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { GenerationRejected, laravelBoolean } from "../syllabus/inProgressWork"
import { Missing, Rejected, settle } from "../syllabus/reviewDecisions"
import { NeedsLaravel } from "../syllabus/snapshotDocuments"
import { createGovernanceWriteDeps } from "./governanceWriteStore"
import { CONVOCATION_LOCK_REASON, isUuid, STUDY_MODALITIES } from "./structure"

export const CAMPUSES = [
  "Campus Matriz Dr. Gabriel Galarza López",
  "Campus Laguacoto",
  "Campus CENI (Centro de Eventos Nacionales e Internacionales)",
  "Extensión San Miguel",
  "Sede Chimbo",
]

export type FacultyRow = { id: string; name: string; campus: string; libraries: string | null }
export type CareerRow = { id: string; facultyId: string; code: string; name: string; modality: string | null }
export type PeriodRow = { id: string; code: string; startsOn: string; endsOn: string; weeks: number | null }
export type CareerData = { facultyId: string; modality: string; code: string; name: string; cycleCount: number }
export type PeriodData = { code: string; startsOn: string; endsOn: string; weeks: number }

export interface GovernanceWriteTx {
  createCareer(data: CareerData): Promise<string>
  createPeriod(data: PeriodData): Promise<string>
  lockFaculty(id: string): Promise<FacultyRow | null>
  lockCareer(id: string): Promise<CareerRow | null>
  lockPeriod(id: string): Promise<PeriodRow | null>
  lockActiveFaculty(id: string): Promise<boolean>
  facultyNames(ids: string[]): Promise<Map<string, string>>
  careersOfFaculty(facultyId: string): Promise<string[]>
  periodRunning(periodId: string): Promise<boolean>
  updateColumns(entity: "facultad" | "carrera" | "periodo", id: string, columns: Record<string, unknown>): Promise<void>
  facultyHasActiveCareers(id: string): Promise<boolean>
  careerInProgress(id: string): Promise<boolean>
  careerHasActiveRoles(id: string): Promise<boolean>
  setActive(entity: "facultad" | "carrera", id: string, active: boolean): Promise<void>
  replace<T>(confirmed: boolean, change: () => Promise<T>, periodId: string | null): Promise<T>
  guard<T>(confirmed: boolean, careerIds: string[] | null, change: () => Promise<T>, periodId: string | null): Promise<T>
  sync(confirmed: boolean, careerIds: string[]): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type GovernanceWriteDeps = {
  bridge: BridgeDeps
  now: () => number
  activeFacultyExists(id: string): Promise<boolean>
  facultyExists(id: string): Promise<boolean>
  careerCodeTaken(code: string, except: string | null): Promise<boolean>
  transaction<T>(work: (tx: GovernanceWriteTx) => Promise<T>): Promise<T>
}

export function defaultGovernanceWriteDeps(): GovernanceWriteDeps {
  return { bridge: defaultBridgeDeps(), ...createGovernanceWriteDeps() }
}

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const LIBRARY = /^[A-Za-z0-9_-]{1,20}$/
const FIELD_LABELS: Record<string, string> = {
  facultad_id: "Facultad",
  campus_facultad: "Campus",
  bibliotecas_koha_facultad: "Bibliotecas de Koha",
  codigo_carrera: "Código de carrera",
  codigo_periodo_academico: "Código de período",
  nombre_facultad: "Nombre",
  nombre_carrera: "Nombre",
  fecha_inicio_periodo: "Fecha de inicio",
  fecha_fin_periodo: "Fecha de fin",
  cantidad_semanas_lectivas: "Semanas lectivas",
}
const AUDIT_KEYS: Record<string, string> = {
  campus_facultad: "campus",
  bibliotecas_koha_facultad: "catalog_libraries",
  codigo_carrera: "code",
  codigo_periodo_academico: "code",
  nombre_facultad: "name",
  nombre_carrera: "name",
  fecha_inicio_periodo: "starts_on",
  fecha_fin_periodo: "ends_on",
  cantidad_semanas_lectivas: "teaching_weeks",
}
const END_BEFORE_START = "La fecha de fin debe ser igual o posterior a la fecha de inicio."

function validDay(value: string): boolean {
  const match = DATE_ONLY.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000
}

export function periodWeeks(startsOn: string, endsOn: string): number {
  const monday = (day: string) => {
    const days = dayNumber(day)
    return days - ((new Date(days * 86_400_000).getUTCDay() + 6) % 7)
  }
  return Math.floor((monday(endsOn) - monday(startsOn)) / 7) + 1
}

export function periodLabel(startsOn: string, endsOn: string): string {
  const [startYear, startMonth] = startsOn.split("-").map(Number)
  const [endYear, endMonth] = endsOn.split("-").map(Number)
  const year = startYear === endYear ? String(startYear) : `${startYear}-${endYear}`
  return `${MONTHS[startMonth - 1]}-${MONTHS[endMonth - 1]} ${year}`
}

function dateRule(): Rule {
  return {
    fails: (value) => {
      if (typeof value === "string") {
        if (!DATE_ONLY.test(value)) throw new NeedsLaravel()
        return validDay(value) ? [] : ["El campo :attribute debe ser una fecha válida."]
      }
      if (typeof value === "number") throw new NeedsLaravel()
      return ["El campo :attribute debe ser una fecha válida."]
    },
  }
}

function labelled(errors: Record<string, string[]>, labels: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages.map((message) => message.replace(":attribute", labels[key] ?? key))]))
}

function phpIntCast(value: PhpValue | undefined): number {
  if (typeof value === "number") return Math.trunc(value)
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "string") {
    const match = /^\s*[+-]?\d+/.exec(value)
    return match ? Number(match[0]) : 0
  }
  return 0
}

function periodAfter(errors: Record<string, string[]>, input: PhpArray, creating: boolean): void {
  const startsOn = typeof input.starts_on === "string" && DATE_ONLY.test(input.starts_on) ? input.starts_on : null
  const endsOn = typeof input.ends_on === "string" && DATE_ONLY.test(input.ends_on) ? input.ends_on : null
  if (creating && startsOn !== null && endsOn !== null && endsOn < startsOn) mergeErrors(errors, "ends_on", [END_BEFORE_START])
  if (errors.starts_on || errors.ends_on || startsOn === null || endsOn === null) return
  const weeks = periodWeeks(startsOn, endsOn)
  if (weeks > 52) mergeErrors(errors, "ends_on", ["El período no puede superar 52 semanas calendario."])
  if (phpIntCast(input.teaching_weeks ?? 0) > weeks) mergeErrors(errors, "teaching_weeks", [`Las semanas de clase no pueden superar las ${weeks} semanas entre las fechas.`])
}

const PERIOD_LABELS = { starts_on: "fecha de inicio", ends_on: "fecha de fin", teaching_weeks: "teaching weeks", confirm_purge: "confirmación de borrado" }
const CAREER_LABELS = { faculty_id: "facultad", modality: "modalidad", code: "código", nombre: "nombre", cycle_count: "cantidad de ciclos", confirm_purge: "confirmación de borrado" }
const FACULTY_LABELS = { nombre: "nombre", campus: "campus", catalog_libraries: "catalog libraries", confirm_purge: "confirmación de borrado" }

async function validatePeriod(input: PhpArray, creating: boolean): Promise<Record<string, string[]>> {
  const rules: Record<string, Rule[]> = {
    starts_on: ["required", dateRule()],
    ends_on: ["required", dateRule()],
    teaching_weeks: ["nullable", "integer", { min: 1 }, { max: 52 }],
  }
  if (!creating) {
    rules.ends_on.push({
      fails: (value) => {
        const start = input.starts_on
        if (typeof value !== "string" || typeof start !== "string" || !validDay(start) || !validDay(value)) return []
        return value >= start ? [] : ["El campo :attribute debe ser una fecha posterior o igual a fecha de inicio."]
      },
    })
    rules.confirm_purge = ["nullable", "boolean"]
  }
  const errors = labelled(await validateInput(input, rules, PERIOD_LABELS), PERIOD_LABELS)
  periodAfter(errors, input, creating)
  return errors
}

async function careerSession(request: Request, deps: GovernanceWriteDeps): Promise<LaravelSession | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active || session.activeRole?.role !== "administrador") return forbidden()
  return session
}

function audit(session: LaravelSession, deps: GovernanceWriteDeps, fields: Pick<AuditEventInput, "action" | "resourceType" | "resourceId" | "metadata">): AuditEventInput {
  return { actorId: session.user.id, roleAssignmentId: session.activeRole?.id ?? null, result: "exito", occurredAt: deps.now(), ...fields }
}

async function run(original: Request, deps: GovernanceWriteDeps, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof GenerationRejected) return validationError(error.errors)
      throw error
    }
  })
}

export async function createGovernanceRecord(request: Request, entity: string, deps: GovernanceWriteDeps = defaultGovernanceWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!["carrera", "periodo"].includes(entity)) return deps.bridge.forward(original)
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const session = await careerSession(request.clone(), deps)
  if (session instanceof Response) return session
  const input = await laravelInput(request)
  let errors: Record<string, string[]>
  try {
    if (entity === "carrera") {
      errors = labelled(
        await validateInput(
          input,
          {
            faculty_id: ["required", "uuid", { exists: (value) => deps.activeFacultyExists(String(value)) }],
            modality: ["required", "string", { in: STUDY_MODALITIES }],
            code: ["required", "string", { max: 80 }, { unique: async (value) => !(await deps.careerCodeTaken(String(value), null)) }],
            nombre: ["required", "string", { max: 180 }],
            cycle_count: ["required", "integer", { min: 1 }, { max: 30 }],
          },
          CAREER_LABELS,
          { messages: { "code.unique": "Ya existe una carrera con ese código." } },
        ),
        CAREER_LABELS,
      )
    } else errors = await validatePeriod(input, true)
  } catch (error) {
    if (error instanceof NeedsLaravel) return deps.bridge.forward(original)
    throw error
  }
  if (Object.keys(errors).length > 0) return validationError(errors)
  return run(original, deps, async () => {
    const id = await deps.transaction(async (tx) =>
      tx.replace(
        false,
        async () => {
          let created: string
          if (entity === "carrera") {
            created = await tx.createCareer({
              facultyId: input.faculty_id as string,
              modality: input.modality as string,
              code: input.code as string,
              name: input.nombre as string,
              cycleCount: phpIntCast(input.cycle_count),
            })
          } else {
            const startsOn = input.starts_on as string
            const endsOn = input.ends_on as string
            const weeks = input.teaching_weeks === undefined || input.teaching_weeks === null ? periodWeeks(startsOn, endsOn) : phpIntCast(input.teaching_weeks)
            created = await tx.createPeriod({ code: periodLabel(startsOn, endsOn), startsOn, endsOn, weeks })
          }
          await tx.recordAudit(audit(session, deps, { action: `academico.${entity}.creacion`, resourceType: entity, resourceId: created, metadata: {} }))
          return created
        },
        null,
      ),
    )
    return laravelJson({ message: "Registro institucional creado.", id }, 201)
  })
}

type Dirty = { column: string; before: unknown; after: unknown }

function changedFields(dirty: Dirty[]): string {
  return dirty.map((item) => FIELD_LABELS[item.column] ?? item.column).join(", ")
}

function librariesText(value: unknown): string | null {
  return Array.isArray(value) ? value.map((item) => (item === true ? "1" : item === false || item === null ? "" : String(item))).join(",") : null
}

function decodeLibraries(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function updateMetadata(tx: GovernanceWriteTx, entity: string, dirty: Dirty[]): Promise<Record<string, string | number | boolean | null>> {
  const metadata: Record<string, string | number | boolean | null> = { changed_fields: changedFields(dirty) }
  for (const item of dirty) {
    if (entity === "carrera" && item.column === "facultad_id") {
      const before = String(item.before)
      const after = String(item.after)
      const names = await tx.facultyNames([before, after])
      metadata.before_faculty_id = before
      metadata.after_faculty_id = after
      metadata.before_faculty = names.get(before) ?? null
      metadata.after_faculty = names.get(after) ?? null
      continue
    }
    const key = AUDIT_KEYS[item.column] ?? item.column
    metadata[`before_${key}`] = item.column === "bibliotecas_koha_facultad" ? librariesText(decodeLibraries(item.before as string | null)) : (item.before as string | number | null)
    metadata[`after_${key}`] = item.column === "bibliotecas_koha_facultad" ? librariesText(item.after) : (item.after as string | number | null)
  }
  return metadata
}

function sameLibraries(before: string | null, after: unknown[]): boolean {
  return JSON.stringify(decodeLibraries(before)) === JSON.stringify(after)
}

export async function updateGovernanceRecord(request: Request, entity: string, recordId: string, deps: GovernanceWriteDeps = defaultGovernanceWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!["facultad", "carrera", "periodo"].includes(entity) || !isUuid(recordId)) return deps.bridge.forward(original)
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const session = await careerSession(request.clone(), deps)
  if (session instanceof Response) return session
  const input = await laravelInput(request)
  if (typeof input.catalog_libraries === "string") {
    try {
      const decoded = JSON.parse(input.catalog_libraries) as unknown
      if (decoded !== null && typeof decoded === "object") return deps.bridge.forward(original)
    } catch {}
  }
  let errors: Record<string, string[]>
  try {
    if (entity === "facultad") {
      if (input.logo !== undefined && input.logo !== null) return deps.bridge.forward(original)
      const libraries = input.catalog_libraries
      if (libraries !== undefined && (!isPhpArray(libraries) || Object.keys(libraries).length > 20 || Object.values(libraries).some((item) => typeof item !== "string" || !LIBRARY.test(item)) || new Set(Object.values(libraries)).size !== Object.keys(libraries).length)) {
        return deps.bridge.forward(original)
      }
      errors = labelled(
        await validateInput(input, { nombre: ["required", "string", { max: 180 }], campus: ["required", { in: CAMPUSES }], confirm_purge: ["nullable", "boolean"] }, FACULTY_LABELS),
        FACULTY_LABELS,
      )
    } else if (entity === "carrera") {
      errors = labelled(
        await validateInput(
          input,
          {
            faculty_id: ["required", "uuid", { exists: (value) => deps.facultyExists(String(value)) }],
            modality: ["required", "string", { in: STUDY_MODALITIES }],
            code: ["required", "string", { max: 80 }, { unique: async (value) => !(await deps.careerCodeTaken(String(value), recordId)) }],
            nombre: ["required", "string", { max: 180 }],
            confirm_purge: ["nullable", "boolean"],
          },
          CAREER_LABELS,
          { messages: { "code.unique": "Ya existe una carrera con ese código." } },
        ),
        CAREER_LABELS,
      )
    } else errors = await validatePeriod(input, false)
  } catch (error) {
    if (error instanceof NeedsLaravel) return deps.bridge.forward(original)
    throw error
  }
  if (Object.keys(errors).length > 0) return validationError(errors)
  const confirmed = laravelBoolean(input.confirm_purge)
  return run(original, deps, async () => {
    await deps.transaction(async (tx) => {
      if (entity === "periodo") {
        const period = await tx.lockPeriod(recordId)
        if (period === null) throw new Missing()
        if (await tx.periodRunning(period.id)) throw new Rejected(validationError({ process: [CONVOCATION_LOCK_REASON] }))
        const startsOn = input.starts_on as string
        const endsOn = input.ends_on as string
        const weeks = input.teaching_weeks === undefined || input.teaching_weeks === null ? periodWeeks(startsOn, endsOn) : phpIntCast(input.teaching_weeks)
        const columns: [string, unknown, unknown][] = [
          ["codigo_periodo_academico", period.code, periodLabel(startsOn, endsOn)],
          ["fecha_inicio_periodo", period.startsOn, startsOn],
          ["fecha_fin_periodo", period.endsOn, endsOn],
          ["cantidad_semanas_lectivas", period.weeks, weeks],
        ]
        await tx.replace(
          confirmed,
          () =>
            tx.guard(
              confirmed,
              null,
              async () => {
                const dirty = columns.filter(([, before, after]) => before !== after).map(([column, before, after]) => ({ column, before, after }))
                if (dirty.length === 0) return
                const metadata = await updateMetadata(tx, entity, dirty)
                await tx.updateColumns("periodo", period.id, Object.fromEntries(dirty.map((item) => [item.column, item.after])))
                await tx.recordAudit(audit(session, deps, { action: "academico.periodo.actualizacion", resourceType: "periodo", resourceId: period.id, metadata }))
              },
              period.id,
            ),
          period.id,
        )
        return
      }
      if (entity === "facultad") {
        const faculty = await tx.lockFaculty(recordId)
        if (faculty === null) throw new Missing()
        const careers = await tx.careersOfFaculty(faculty.id)
        await tx.guard(
          confirmed,
          careers,
          async () => {
            const libraries = input.catalog_libraries === undefined ? null : Object.values(input.catalog_libraries as PhpArray)
            const dirty: Dirty[] = []
            if (faculty.name !== input.nombre) dirty.push({ column: "nombre_facultad", before: faculty.name, after: input.nombre })
            if (faculty.campus !== input.campus) dirty.push({ column: "campus_facultad", before: faculty.campus, after: input.campus })
            if (libraries !== null && !sameLibraries(faculty.libraries, libraries)) dirty.push({ column: "bibliotecas_koha_facultad", before: faculty.libraries, after: libraries })
            if (dirty.length === 0) return
            const metadata = await updateMetadata(tx, entity, dirty)
            await tx.updateColumns("facultad", faculty.id, Object.fromEntries(dirty.map((item) => [item.column, item.after])))
            await tx.sync(confirmed, await tx.careersOfFaculty(faculty.id))
            await tx.recordAudit(audit(session, deps, { action: "academico.facultad.actualizacion", resourceType: "facultad", resourceId: faculty.id, metadata }))
          },
          null,
        )
        return
      }
      const career = await tx.lockCareer(recordId)
      if (career === null) throw new Missing()
      await tx.guard(
        confirmed,
        [career.id],
        async () => {
          const facultyId = input.faculty_id as string
          if (career.facultyId !== facultyId && !(await tx.lockActiveFaculty(facultyId))) {
            throw new Rejected(validationError({ faculty_id: ["Seleccione una facultad activa para reasignar la carrera."] }))
          }
          const dirty: Dirty[] = []
          if (career.facultyId !== facultyId) dirty.push({ column: "facultad_id", before: career.facultyId, after: facultyId })
          if (career.code !== input.code) dirty.push({ column: "codigo_carrera", before: career.code, after: input.code })
          if (career.name !== input.nombre) dirty.push({ column: "nombre_carrera", before: career.name, after: input.nombre })
          if (career.modality !== input.modality) dirty.push({ column: "modalidad_carrera", before: career.modality, after: input.modality })
          if (dirty.length === 0) return
          const metadata = await updateMetadata(tx, entity, dirty)
          await tx.updateColumns("carrera", career.id, Object.fromEntries(dirty.map((item) => [item.column, item.after])))
          await tx.sync(confirmed, [career.id])
          await tx.recordAudit(audit(session, deps, { action: "academico.carrera.actualizacion", resourceType: "carrera", resourceId: career.id, metadata }))
        },
        null,
      )
    })
    return laravelJson({ message: "Datos institucionales actualizados y auditados." })
  })
}

export async function setGovernanceStatus(request: Request, entity: string, recordId: string, deps: GovernanceWriteDeps = defaultGovernanceWriteDeps()): Promise<Response> {
  const original = request.clone()
  if (!["facultad", "carrera"].includes(entity) || !isUuid(recordId)) return deps.bridge.forward(original)
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const session = await careerSession(request.clone(), deps)
  if (session instanceof Response) return session
  const input = await laravelInput(request)
  const errors = await validateInput(input, { active: ["required", "boolean"] }, { active: "activo" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const active = laravelBoolean(input.active)
  return run(original, deps, async () => {
    await deps.transaction(async (tx) =>
      tx.replace(
        false,
        async () => {
          const record = entity === "facultad" ? await tx.lockFaculty(recordId) : await tx.lockCareer(recordId)
          if (record === null) throw new Missing()
          if (!active) {
            const blocked =
              entity === "facultad"
                ? (await tx.facultyHasActiveCareers(record.id))
                  ? "Desactive primero las carreras activas de esta facultad."
                  : null
                : (await tx.careerInProgress(record.id))
                  ? "La carrera participa en una convocatoria en curso. Espere a que se cierre."
                  : null
            if (blocked !== null) throw new Rejected(validationError({ record: [blocked] }))
            if (entity === "carrera" && (await tx.careerHasActiveRoles(record.id))) throw new NeedsLaravel()
          }
          await tx.setActive(entity as "facultad" | "carrera", record.id, active)
          await tx.recordAudit(
            audit(session, deps, {
              action: entity === "carrera" ? `academico.carrera.${active ? "reactivacion" : "desactivacion"}` : `academico.${entity}.cambio_estado`,
              resourceType: entity,
              resourceId: record.id,
              metadata: entity === "carrera" && !active ? { active, retired_users: 0 } : { active },
            }),
          )
        },
        null,
      ),
    )
    return laravelJson({ message: active ? "Registro reactivado." : "Registro desactivado sin borrar su historial." })
  })
}
