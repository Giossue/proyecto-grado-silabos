import { randomBytes } from "node:crypto"
import type { PhpArray, PhpValue } from "../http/input"
import type { Rule } from "../http/validation"

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

export type EmailShape = "valid" | "invalid"

const ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\-\u0080-\u{10FFFF}]+$/u
const LABEL = /^[A-Za-z0-9\u0080-\u{10FFFF}](?:[A-Za-z0-9\-\u0080-\u{10FFFF}]*[A-Za-z0-9\u0080-\u{10FFFF}])?$/u
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^IPv6:[0-9A-Fa-f:.]+$/

function withoutComments(value: string): string | null {
  let result = ""
  let depth = 0
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === "\\" && (quoted || depth > 0)) {
      if (index + 1 >= value.length) return null
      if (depth === 0) result += character + value[index + 1]
      index += 1
      continue
    }
    if (depth === 0 && character === '"') quoted = !quoted
    if (!quoted && character === "(") {
      depth += 1
      continue
    }
    if (!quoted && character === ")") {
      if (depth === 0) return null
      depth -= 1
      continue
    }
    if (depth === 0) result += character
  }
  return depth === 0 && !quoted ? result : null
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = []
  let current = ""
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quoted && character === "\\") {
      current += character + (value[index + 1] ?? "")
      index += 1
      continue
    }
    if (character === '"') quoted = !quoted
    if (!quoted && character === separator) {
      parts.push(current)
      current = ""
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

function validLocalWord(word: string): boolean {
  if (ATOM.test(word)) return true
  return /^"(?:[^"\\\r\n]|\\[^\r\n])*"$/u.test(word)
}

function validDomain(domain: string): boolean {
  if (domain.startsWith("[") && domain.endsWith("]")) {
    const literal = domain.slice(1, -1)
    return IPV4.test(literal) || IPV6.test(literal)
  }
  if (domain.length > 253) return false
  return domain.split(".").every((label) => [...label].length <= 63 && LABEL.test(label))
}

export function emailShape(value: PhpValue | undefined): EmailShape {
  if (typeof value !== "string" || value === "") return "invalid"
  const stripped = withoutComments(value)
  if (stripped === null) return "invalid"
  const parts = splitOutsideQuotes(stripped, "@")
  if (parts.length !== 2) return "invalid"
  const [local, domain] = parts
  if (local === "" || domain === "") return "invalid"
  if (!splitOutsideQuotes(local, ".").every((word) => word !== "" && validLocalWord(word))) return "invalid"
  return validDomain(domain) ? "valid" : "invalid"
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
