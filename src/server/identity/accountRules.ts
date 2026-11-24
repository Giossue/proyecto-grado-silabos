import { randomBytes } from "node:crypto"
import type { PhpArray, PhpValue } from "../laravel/input"
import type { Rule } from "../laravel/validation"

export const ROLE_ADMINISTRATOR = "administrador"
export const ROLE_COORDINATOR = "coordinador"
export const ROLE_TEACHER = "docente"
export const ROLE_LIBRARIAN = "bibliotecario"

export const ROLE_LABELS: Record<string, string> = {
  [ROLE_ADMINISTRATOR]: "Administrador",
  [ROLE_COORDINATOR]: "Coordinador",
  [ROLE_TEACHER]: "Docente",
  [ROLE_LIBRARIAN]: "Bibliotecario",
}

export const hasCareerScope = (role: string) => role === ROLE_COORDINATOR || role === ROLE_TEACHER
const isInstitutional = (role: string) => role === ROLE_ADMINISTRATOR || role === ROLE_LIBRARIAN

export const ROLE_COMBINATION_MESSAGE = "Administración y Biblioteca no pueden tener los roles Docente ni Coordinador."

export function roleCombinationConflicts(incoming: string, current: string[]): boolean {
  return current.some((role) => role in ROLE_LABELS && isInstitutional(incoming) !== isInstitutional(role))
}

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
const PCRE_SPACES = /[\t\n\v\f\r \x85\xa0\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}]+/gu
const NAME_PART = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u

export const NAME_MAX_LENGTH = 90

export function collapseName(value: string): string {
  return value.replace(PHP_TRIM, "").replace(PCRE_SPACES, " ")
}

export function normalizeName(value: string): string {
  return collapseName(value).toUpperCase()
}

export function isValidNamePart(value: string): boolean {
  return NAME_PART.test(collapseName(value))
}

export function isValidFullName(value: string): boolean {
  return isValidNamePart(value) && collapseName(value).split(" ").length >= 2
}

export function fullName(names: string, surnames: string): string {
  return normalizeName(`${names} ${surnames}`)
}

const NAME_SUBJECTS: Record<string, string> = { nombres: "Los nombres", apellidos: "Los apellidos" }

export function nameColumnMessages(): Record<string, string> {
  const messages: Record<string, string> = {}
  for (const [key, subject] of Object.entries(NAME_SUBJECTS)) {
    messages[`${key}.required`] = `${subject} son obligatorios.`
    messages[`${key}.max`] = `${subject} admiten hasta ${NAME_MAX_LENGTH} caracteres.`
    messages[`${key}.regex`] = `${subject} solo admiten letras, espacios, apóstrofo y guion.`
  }
  return messages
}

export function collapseNameColumns(input: PhpArray): PhpArray {
  const result = { ...input }
  for (const key of Object.keys(NAME_SUBJECTS)) {
    const value = result[key]
    if (typeof value === "string") result[key] = collapseName(value)
  }
  return result
}

export const nameColumnRules = (): Rule[] => ["required", "string", { max: NAME_MAX_LENGTH }, { regex: NAME_PART }]

export type EmailShape = "valid" | "invalid" | "unknown"

const SIMPLE_LOCAL = /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*$/
const SIMPLE_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

export function emailShape(value: PhpValue | undefined): EmailShape {
  if (typeof value !== "string") return "invalid"
  const at = value.indexOf("@")
  if (at === -1 || at === 0 || value.endsWith("@")) return "invalid"
  if (value.indexOf("@", at + 1) !== -1) return "unknown"
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (SIMPLE_LOCAL.test(local) && domain.length <= 253 && domain.split(".").every((label) => SIMPLE_LABEL.test(label))) return "valid"
  return "unknown"
}

export const EMAIL_MESSAGE = "El campo :attribute debe ser un correo electrónico válido."

export function emailRule(): Rule {
  return { check: (value) => emailShape(value) === "valid", message: EMAIL_MESSAGE }
}

export const ENUM_MESSAGE = "El valor seleccionado en :attribute no es válido."

export function roleCodeRule(): Rule {
  return { check: (value) => typeof value === "string" && value in ROLE_LABELS, message: ENUM_MESSAGE }
}

export function requiresCareer(roleCode: PhpValue | undefined): boolean {
  return !(typeof roleCode === "string" ? [ROLE_ADMINISTRATOR, ROLE_LIBRARIAN].includes(roleCode) : false)
}

export function phpBoolean(value: PhpValue | undefined): boolean {
  if (value === true) return true
  if (typeof value === "number") return value === 1
  if (typeof value !== "string") return false
  return ["1", "true", "on", "yes"].includes(value.toLowerCase())
}

export function phpCastBool(value: PhpValue | undefined): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== "" && value !== "0" && !(typeof value === "object" && Object.keys(value).length === 0)
}

export function phpLower(value: string): string {
  return value.toLowerCase()
}

const ALPHANUMERIC = /[^A-Za-z0-9]/g

export function randomString(length: number): string {
  let result = ""
  while (result.length < length) result += randomBytes(length * 2).toString("base64").replace(ALPHANUMERIC, "")
  return result.slice(0, length)
}
