import { isPhpArray, phpCount, type PhpArray, type PhpValue } from "./input"

export type Rule =
  | "required"
  | "nullable"
  | "string"
  | "integer"
  | "uuid"
  | "boolean"
  | { in: string[] }
  | { min: number }
  | { max: number }
  | { regex: RegExp }
  | { check: (value: PhpValue) => boolean; message: string }
  | { exists: (value: PhpValue) => Promise<boolean> }

const MESSAGES = {
  required: "El campo :attribute es obligatorio.",
  string: "El campo :attribute debe ser una cadena de texto.",
  integer: "El campo :attribute debe ser un número entero.",
  uuid: "El campo :attribute debe ser un UUID válido.",
  boolean: "El campo :attribute debe ser verdadero o falso.",
  in: "El valor seleccionado en :attribute no es válido.",
  exists: "El valor seleccionado en :attribute no es válido.",
  regex: "El formato del campo :attribute no es válido.",
  min: {
    array: "El campo :attribute debe tener al menos :min elementos.",
    numeric: "El campo :attribute debe ser al menos :min.",
    string: "El campo :attribute debe tener al menos :min caracteres.",
  },
  max: {
    array: "El campo :attribute no debe tener más de :max elementos.",
    numeric: "El campo :attribute no debe ser mayor que :max.",
    string: "El campo :attribute no debe tener más de :max caracteres.",
  },
}

const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/
const INT64_MIN = BigInt("-9223372036854775808")
const INT64_MAX = BigInt("9223372036854775807")

export function phpIsNumeric(value: PhpValue | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value)
  return typeof value === "string" && /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(value)
}

export function phpFilterInt(value: PhpValue | undefined): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null
  if (typeof value === "boolean") return value ? 1 : null
  if (typeof value !== "string") return null
  const trimmed = value.replace(/^[ \t\n\r\v\0]+|[ \t\n\r\v\0]+$/g, "")
  if (!/^[+-]?(0|[1-9]\d*)$/.test(trimmed)) return null
  const big = BigInt(trimmed)
  return big < INT64_MIN || big > INT64_MAX ? null : Number(big)
}

function phpString(value: PhpValue | undefined): string {
  if (value === true) return "1"
  if (value === false || value === null || value === undefined) return ""
  return String(value)
}

function hasRule(rules: Rule[], name: string): boolean {
  return rules.some((rule) => (typeof rule === "string" ? rule === name : name in rule))
}

function size(value: PhpValue | undefined, rules: Rule[]): number {
  if (hasRule(rules, "integer") && phpIsNumeric(value)) return Number(typeof value === "string" ? value.trim() : value)
  if (isPhpArray(value)) return phpCount(value)
  return [...phpString(value)].length
}

function sizeType(rules: Rule[]): "numeric" | "array" | "string" {
  return hasRule(rules, "integer") ? "numeric" : "string"
}

function failsRequired(value: PhpValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  return isPhpArray(value) && phpCount(value) === 0
}

async function passes(rule: Rule, value: PhpValue | undefined, rules: Rule[]): Promise<boolean> {
  if (rule === "string") return typeof value === "string"
  if (rule === "integer") return phpFilterInt(value) !== null
  if (rule === "uuid") return typeof value === "string" && UUID.test(value)
  if (rule === "boolean") return value === true || value === false || value === 0 || value === 1 || value === "0" || value === "1"
  if (typeof rule === "object" && "in" in rule) return !isPhpArray(value) && rule.in.includes(phpString(value))
  if (typeof rule === "object" && "min" in rule) return size(value, rules) >= rule.min
  if (typeof rule === "object" && "max" in rule) return size(value, rules) <= rule.max
  if (typeof rule === "object" && "check" in rule) return rule.check(value as PhpValue)
  if (typeof rule === "object" && "regex" in rule) return (typeof value === "string" || typeof value === "number") && rule.regex.test(String(value))
  if (typeof rule === "object" && "exists" in rule) return value === undefined ? true : rule.exists(value)
  return true
}

function message(rule: Rule, attribute: string, rules: Rule[]): string {
  let template: string
  if (typeof rule === "string") template = MESSAGES[rule as "string"]
  else if ("in" in rule) template = MESSAGES.in
  else if ("exists" in rule) template = MESSAGES.exists
  else if ("regex" in rule) template = MESSAGES.regex
  else if ("check" in rule) template = rule.message
  else if ("min" in rule) template = MESSAGES.min[sizeType(rules)].replace(":min", String(rule.min))
  else template = MESSAGES.max[sizeType(rules)].replace(":max", String(rule.max))
  return template.replace(":attribute", attribute)
}

export async function validateInput(
  input: PhpArray,
  ruleset: Record<string, Rule[]>,
  attributes: Record<string, string> = {},
): Promise<Record<string, string[]>> {
  const errors: Record<string, string[]> = {}
  for (const [name, rules] of Object.entries(ruleset)) {
    const value = Object.prototype.hasOwnProperty.call(input, name) ? input[name] : undefined
    const label = attributes[name] ?? name.replace(/_/g, " ")
    const add = (rule: Rule) => {
      errors[name] = [...(errors[name] ?? []), message(rule, label, rules)]
    }
    if (rules.includes("required") && failsRequired(value)) {
      add("required")
      continue
    }
    if (value === undefined) continue
    if (value === null && rules.includes("nullable")) continue
    for (const rule of rules) {
      if (rule === "required" || rule === "nullable") continue
      if (!(await passes(rule, value, rules))) add(rule)
    }
  }
  return errors
}
