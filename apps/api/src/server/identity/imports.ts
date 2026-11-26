import { requireSession } from "../auth/requireSession"
import type { AppSession } from "../auth/types"
import { importTemplate, type TemplateSelect } from "../excel/importTemplate"
import { importKey, phpLength, PhpMap } from "../excel/importKeys"
import { importRows, importSession, spreadsheetUpload, type CheckedRow, type ImportResult } from "../excel/importRequest"
import type { ImportRow } from "../excel/spreadsheetReader"
import { xlsxDownload } from "../excel/workbook"
import type { PhpArray } from "../http/input"
import { forbidden, apiJson } from "../http/responses"
import { importedTeacherSchema, importedUserSchema, NAME_SUBJECTS, nameColumnMessages } from "@silabos/shared/schemas/people"
import { validateSchema } from "../http/schemaValidation"
import { systemNow } from "../shared/clock"
import {
  collapseName,
  fullName,
  isValidNamePart,
  NAME_MAX_LENGTH,
  ROLE_COORDINATOR,
  ROLE_LABELS,
} from "./accountRules"
import { createCareerTeacher, createManagedUser, teacherBlockedReason } from "./accounts"
import { careerExists, defaultIdentityWriteDeps, isAdministrator, perform, uniqueEmail, type IdentityWriteDeps } from "./accountWrites"
import { createIdentityImportStore } from "./importsStore"

const PERSON_COLUMNS = { nombres: "Nombres", apellidos: "Apellidos" }

export const TEACHER_COLUMNS = { ...PERSON_COLUMNS, correo: "Correo" }

export const USER_COLUMNS = { ...PERSON_COLUMNS, correo: "Correo", rol: "Rol", carrera: "Carrera" }

const PERSON_NOTES = [
  "Una fila por persona; no deje filas vacías entre registros.",
  "Nombres y apellidos son obligatorios: escriba todos los nombres en «Nombres» y todos los apellidos en «Apellidos».",
  "Use solo letras, espacios, apóstrofo o guion, sin abreviaturas.",
]

const TEACHER_NOTES = [
  "Una fila por docente; no deje filas vacías entre registros.",
  "Todas las columnas son obligatorias: nombres, apellidos y correo.",
  "Escriba todos los nombres en «Nombres» y todos los apellidos en «Apellidos», solo con letras, espacios, apóstrofo o guion.",
  "Correo: use el correo institucional; si la cuenta ya existe, se incorpora a su carrera sin cambiar su nombre.",
]

const USER_NOTES = [
  ...PERSON_NOTES,
  "Correo: use el correo institucional; no puede repetirse.",
  "Todas las columnas son obligatorias, salvo Carrera para Administrador y Bibliotecario.",
  "Rol: elija una opción de la lista.",
  "Carrera: elija una de la lista para Coordinador y Docente; déjela vacía para Administrador y Bibliotecario.",
]

export type IdentityImportStore = {
  activeCareers(): Promise<{ id: string; name: string; code: string; label: string }[]>
  templateCareerLabels(): Promise<string[]>
}

export type IdentityImportDeps = IdentityWriteDeps & { store: IdentityImportStore; now: () => number; maxPostSize?: number }

export function defaultIdentityImportDeps(): IdentityImportDeps {
  return { ...defaultIdentityWriteDeps(), store: createIdentityImportStore(), now: systemNow }
}

async function mayAddTeachers(session: AppSession, deps: IdentityImportDeps): Promise<boolean> {
  const role = session.activeRole
  return session.user.active && role?.role === ROLE_COORDINATOR && role.careerId !== null && (await deps.accounts.activeCareer(role.careerId))
}

function compose(values: Record<string, string>): [Record<string, string>, string[]] {
  const errors: string[] = []
  for (const key of Object.keys(PERSON_COLUMNS)) {
    const messages = nameColumnMessages(NAME_SUBJECTS[key as keyof typeof NAME_SUBJECTS])
    const value = collapseName(values[key] ?? "")
    if (value === "") errors.push(messages.required)
    else if (phpLength(value) > NAME_MAX_LENGTH) errors.push(messages.max)
    else if (!isValidNamePart(value)) errors.push(messages.regex)
  }
  const rest = Object.fromEntries(Object.entries(values).filter(([key]) => !(key in PERSON_COLUMNS)))
  return [{ nombre: fullName(values.nombres ?? "", values.apellidos ?? ""), ...rest }, errors]
}

function messagesOf(errors: Record<string, string[]>): string[] {
  return Object.values(errors).flat()
}

function unique(errors: string[]): string[] {
  return [...new Set(errors)]
}

function seenCheck(seen: PhpMap<number>, email: string, line: number, errors: string[]): void {
  if (seen.has(email)) errors.push(`El correo se repite en la fila ${seen.get(email)}.`)
  if (!seen.has(email)) seen.set(email, line)
}

async function templateResponse(headers: string[], selects: TemplateSelect[], notes: string[], filename: string, deps: IdentityImportDeps): Promise<Response> {
  return xlsxDownload(await importTemplate(headers, selects, notes, { now: deps.now() }), filename)
}

export async function teacherImportTemplate(request: Request, deps: IdentityImportDeps = defaultIdentityImportDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!(await mayAddTeachers(session, deps))) return forbidden()
  return templateResponse(Object.values(TEACHER_COLUMNS), [], TEACHER_NOTES, "plantilla-docentes.xlsx", deps)
}

export async function userImportTemplate(request: Request, deps: IdentityImportDeps = defaultIdentityImportDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!isAdministrator(session)) return forbidden()
  const keys = Object.keys(USER_COLUMNS)
  return templateResponse(
    Object.values(USER_COLUMNS),
    [
      { column: keys.indexOf("rol"), options: Object.values(ROLE_LABELS) },
      { column: keys.indexOf("carrera"), options: await deps.store.templateCareerLabels() },
    ],
    USER_NOTES,
    "plantilla-usuarios.xlsx",
    deps,
  )
}

type Checked = { checked: CheckedRow[]; payloads: PhpArray[] }

async function checkTeachers(rows: ImportRow[], deps: IdentityImportDeps): Promise<Checked> {
  const seen = new PhpMap<number>()
  const checked: CheckedRow[] = []
  const payloads: PhpArray[] = []
  for (const row of rows) {
    const [values, nameErrors] = compose(row.values)
    const email = values.correo.toLowerCase()
    const payload: PhpArray = { nombre: values.nombre, correo_electronico: email }
    const validation = (await validateSchema(importedTeacherSchema, payload)).errors ?? {}
    const blocked = await deps.accounts.direct(async (tx) => teacherBlockedReason(tx, await tx.lockAccountByEmail(email)))
    const errors = [...nameErrors, ...messagesOf(validation), ...(blocked === null ? [] : [blocked])]
    seenCheck(seen, email, row.line, errors)
    checked.push({ line: row.line, values, errors: unique(errors) })
    payloads.push(payload)
  }
  return { checked, payloads }
}

async function careerKeys(deps: IdentityImportDeps): Promise<PhpMap<string>> {
  const active = await deps.store.activeCareers()
  const counts = new PhpMap<number>()
  for (const career of active) counts.set(importKey(career.name), (counts.get(importKey(career.name)) ?? 0) + 1)
  const perCareer = active.map((career) => {
    const literal = new PhpMap<string | null>()
    literal.set(importKey(career.label), career.id)
    literal.set(importKey(career.code), career.id)
    literal.set(importKey(career.name), (counts.get(importKey(career.name)) ?? 0) > 1 ? null : career.id)
    const filtered = new PhpMap<string>()
    for (const [key, value] of literal.entries) if (value !== null && value !== "") filtered.entries.set(key, value)
    return filtered
  })
  return PhpMap.merge(...perCareer)
}

async function checkUsers(rows: ImportRow[], deps: IdentityImportDeps): Promise<Checked> {
  const careers = await careerKeys(deps)
  const roles = new PhpMap<string>()
  for (const [code, label] of Object.entries(ROLE_LABELS)) {
    roles.set(importKey(label), code)
    roles.set(importKey(code), code)
  }
  const seen = new PhpMap<number>()
  const checked: CheckedRow[] = []
  const payloads: PhpArray[] = []
  for (const row of rows) {
    const [values, nameErrors] = compose(row.values)
    const email = values.correo.toLowerCase()
    const payload: PhpArray = {
      nombre: values.nombre,
      correo_electronico: email,
      role_code: roles.get(importKey(values.rol)) ?? values.rol,
      career_id: values.carrera === "" ? null : (careers.get(importKey(values.carrera)) ?? values.carrera),
    }
    const schema = importedUserSchema({ roleCode: payload.role_code, unique: uniqueEmail(deps, null), careerExists: careerExists(deps) })
    const validation = (await validateSchema(schema, payload)).errors ?? {}
    const errors = [...nameErrors, ...messagesOf(validation)]
    seenCheck(seen, email, row.line, errors)
    checked.push({ line: row.line, values, errors: unique(errors) })
    payloads.push(payload)
  }
  return { checked, payloads }
}

export async function importTeachers(request: Request, deps: IdentityImportDeps = defaultIdentityImportDeps()): Promise<Response> {
  const ready = await importSession(request, deps, 10)
  if (ready instanceof Response) return ready
  const { session, original, finish } = ready
  const upload = await spreadsheetUpload(request)
  if (upload instanceof Response) return finish(upload)
  if (!(await mayAddTeachers(session, deps))) return finish(forbidden())
  const rows = importRows(upload.file, TEACHER_COLUMNS)
  if (rows instanceof Response) return finish(rows)
  const result = await checkTeachers(rows, deps)
  const { checked, payloads } = result
  const valid = checked.every((row) => row.errors.length === 0)
  if (!upload.confirm || !valid) return finish(apiJson({ rows: checked, valid, created: 0 } satisfies ImportResult))
  const careerId = session.activeRole?.careerId as string
  const outcome = await perform(deps, original, session, async (ctx) => {
    let created = 0
    for (const payload of payloads) {
      await createCareerTeacher(ctx, { name: payload.nombre as string, email: payload.correo_electronico as string }, careerId)
      created++
    }
    return created
  })
  if (outcome instanceof Response) return finish(outcome)
  return finish(apiJson({ rows: checked, valid, created: outcome.value } satisfies ImportResult))
}

export async function importUsers(request: Request, deps: IdentityImportDeps = defaultIdentityImportDeps()): Promise<Response> {
  const ready = await importSession(request, deps, 10)
  if (ready instanceof Response) return ready
  const { session, original, finish } = ready
  const upload = await spreadsheetUpload(request)
  if (upload instanceof Response) return finish(upload)
  if (!isAdministrator(session)) return finish(forbidden())
  const rows = importRows(upload.file, USER_COLUMNS)
  if (rows instanceof Response) return finish(rows)
  const result = await checkUsers(rows, deps)
  const { checked, payloads } = result
  const valid = checked.every((row) => row.errors.length === 0)
  if (!upload.confirm || !valid) return finish(apiJson({ rows: checked, valid, created: 0 } satisfies ImportResult))
  const outcome = await perform(deps, original, session, async (ctx) => {
    let created = 0
    for (const payload of payloads) {
      await createManagedUser(ctx, {
        name: payload.nombre as string,
        email: payload.correo_electronico as string,
        roleCode: payload.role_code as string,
        careerId: payload.career_id === null ? null : (payload.career_id as string),
        replaceCoordinator: false,
      })
      created++
    }
    return created
  })
  if (outcome instanceof Response) return finish(outcome)
  return finish(apiJson({ rows: checked, valid, created: outcome.value } satisfies ImportResult))
}
