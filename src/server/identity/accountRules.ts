import { randomBytes } from "node:crypto"
import type { PhpArray, PhpValue } from "../http/input"
import { collapseName, NAME_SUBJECTS } from "@/schemas/people"

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

export { collapseName, isValidFullName, isValidNamePart, NAME_MAX_LENGTH } from "@/schemas/people"

export function normalizeName(value: string): string {
  return collapseName(value).toUpperCase()
}

export function fullName(names: string, surnames: string): string {
  return normalizeName(`${names} ${surnames}`)
}

export function collapseNameColumns(input: PhpArray): PhpArray {
  const result = { ...input }
  for (const key of Object.keys(NAME_SUBJECTS)) {
    const value = result[key]
    if (typeof value === "string") result[key] = collapseName(value)
  }
  return result
}

export { emailShape, type EmailShape } from "@/schemas/email"

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
