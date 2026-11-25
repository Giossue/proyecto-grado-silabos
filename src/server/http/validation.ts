import { strIsUrl } from "./strIsUrl"
import { isPhpArray, phpCount, type PhpArray, type PhpValue } from "./input"

export type Rule =
  | "required"
  | "nullable"
  | "sometimes"
  | "present"
  | "string"
  | "integer"
  | "numeric"
  | "array"
  | "uuid"
  | "boolean"
  | "distinct"
  | "prohibited"
  | { in: string[] }
  | { min: number }
  | { max: number }
  | { regex: RegExp }
  | { check: (value: PhpValue) => boolean; message: string }
  | { exists: (value: PhpValue) => Promise<boolean> }
  | { fails: (value: PhpValue, attribute: string) => string[] | Promise<string[]> }
  | { aborts: (value: PhpValue, attribute: string) => Record<string, string[]> | null }
  | { unique: (value: PhpValue) => Promise<boolean> }
  | { compare: "gt" | "gte" | "lt" | "lte"; than: string | number }
  | { excludeUnless: string; equals: string }
  | { required_if: string[] }
  | { required_unless: string[] }
  | { between: [number, number] }
  | { url: string[] }

export type ValidationOptions = { messages?: Record<string, string> }

const MESSAGES = {
  required: "El campo :attribute es obligatorio.",
  present: "El campo :attribute debe estar presente.",
  string: "El campo :attribute debe ser una cadena de texto.",
  integer: "El campo :attribute debe ser un número entero.",
  numeric: "El campo :attribute debe ser un número.",
  array: "El campo :attribute debe ser una lista.",
  uuid: "El campo :attribute debe ser un UUID válido.",
  boolean: "El campo :attribute debe ser verdadero o falso.",
  distinct: "El campo :attribute tiene un valor duplicado.",
  prohibited: "El campo :attribute está prohibido.",
  in: "El valor seleccionado en :attribute no es válido.",
  exists: "El valor seleccionado en :attribute no es válido.",
  unique: "El valor del campo :attribute ya está en uso.",
  regex: "El formato del campo :attribute no es válido.",
  url: "El campo :attribute debe ser una URL válida.",
  required_if: "El campo :attribute es obligatorio cuando :other sea :value.",
  required_unless: "El campo :attribute es obligatorio a menos que :other esté en :values.",
  between: {
    array: "El campo :attribute debe tener entre :min y :max elementos.",
    numeric: "El campo :attribute debe estar entre :min y :max.",
    string: "El campo :attribute debe tener entre :min y :max caracteres.",
  },
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
  gt: {
    array: "El campo :attribute debe tener más de :value elementos.",
    numeric: "El campo :attribute debe ser mayor que :value.",
    string: "El campo :attribute debe tener más de :value caracteres.",
  },
  gte: {
    array: "El campo :attribute debe tener :value elementos o más.",
    numeric: "El campo :attribute debe ser mayor o igual que :value.",
    string: "El campo :attribute debe tener :value caracteres o más.",
  },
  lt: {
    array: "El campo :attribute debe tener menos de :value elementos.",
    numeric: "El campo :attribute debe ser menor que :value.",
    string: "El campo :attribute debe tener menos de :value caracteres.",
  },
  lte: {
    array: "El campo :attribute no debe tener más de :value elementos.",
    numeric: "El campo :attribute debe ser menor o igual que :value.",
    string: "El campo :attribute debe tener :value caracteres o menos.",
  },
}

const UUID = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/
const INT64_MIN = BigInt("-9223372036854775808")
const INT64_MAX = BigInt("9223372036854775807")
const NUMERIC_RULES = ["integer", "numeric"]

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

function looseEquals(left: PhpValue | undefined, right: PhpValue | undefined): boolean {
  if (isPhpArray(left) || isPhpArray(right)) {
    if (!isPhpArray(left) || !isPhpArray(right)) return false
    const keys = Object.keys(left)
    return keys.length === phpCount(right) && keys.every((key) => key in right && looseEquals(left[key], right[key]))
  }
  if (left === null || left === undefined || typeof left === "boolean" || right === null || right === undefined || typeof right === "boolean") {
    const truthy = (value: PhpValue | undefined) => value !== null && value !== undefined && value !== false && value !== 0 && value !== "" && value !== "0"
    return truthy(left) === truthy(right)
  }
  if (phpIsNumeric(left) && phpIsNumeric(right)) return Number(String(left).trim()) === Number(String(right).trim())
  return String(left) === String(right)
}

function ruleName(rule: Rule): string {
  if (typeof rule === "string") return rule
  if ("compare" in rule) return rule.compare
  return Object.keys(rule)[0]
}

function hasRule(rules: Rule[], name: string): boolean {
  return rules.some((rule) => ruleName(rule) === name)
}

function size(value: PhpValue | undefined, rules: Rule[]): number {
  if (NUMERIC_RULES.some((name) => hasRule(rules, name)) && phpIsNumeric(value)) return Number(typeof value === "string" ? value.trim() : value)
  if (isPhpArray(value)) return phpCount(value)
  return [...phpString(value)].length
}

function sizeType(rules: Rule[]): "numeric" | "array" | "string" {
  if (NUMERIC_RULES.some((name) => hasRule(rules, name))) return "numeric"
  return hasRule(rules, "array") ? "array" : "string"
}

function failsRequired(value: PhpValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  return isPhpArray(value) && phpCount(value) === 0
}

function segmentsOf(path: string): string[] {
  return path.split(".")
}

export function dataGet(input: PhpValue | undefined, path: string): PhpValue | undefined {
  let current: PhpValue | undefined = input
  for (const segment of segmentsOf(path)) {
    if (!isPhpArray(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

function expandSegments(segments: string[], target: PhpValue | undefined, prefix: string): string[] {
  if (segments.length === 0) return [prefix]
  const [segment, ...rest] = segments
  const join = (key: string) => (prefix === "" ? key : `${prefix}.${key}`)
  if (segment === "*") {
    if (!isPhpArray(target)) return []
    return Object.entries(target).flatMap(([key, inner]) => expandSegments(rest, inner, join(key)))
  }
  if (rest.length === 0) return [join(segment)]
  const next = isPhpArray(target) && Object.prototype.hasOwnProperty.call(target, segment) ? target[segment] : null
  return expandSegments(rest, next, join(segment))
}

export function expandAttribute(pattern: string, input: PhpArray): string[] {
  if (!pattern.includes("*")) return [pattern]
  return expandSegments(segmentsOf(pattern), input, "")
}

function wildcardMatches(pattern: string, attribute: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^.]+")
  return new RegExp(`^${expression}$`, "u").test(attribute)
}

function leaves(value: PhpValue | undefined, prefix: string, found: Map<string, PhpValue | undefined>): void {
  if (isPhpArray(value) && phpCount(value) > 0) {
    for (const [key, inner] of Object.entries(value)) leaves(inner, prefix === "" ? key : `${prefix}.${key}`, found)
    return
  }
  found.set(prefix, value)
}

function distinctValues(input: PhpArray, pattern: string, attribute: string): (PhpValue | undefined)[] {
  const leading = pattern.split("*")[0].replace(/\.+$/, "")
  const found = new Map<string, PhpValue | undefined>()
  const root = dataGet(input, leading)
  if (root !== undefined) leaves(root, leading, found)
  return [...found.entries()].filter(([key]) => key !== attribute && wildcardMatches(pattern, key)).map(([, value]) => value)
}

type Context = { input: PhpArray; pattern: string; attribute: string; rules: Rule[] }

function sameType(left: PhpValue | undefined, right: PhpValue | undefined): boolean {
  const type = (value: PhpValue | undefined) => (value === undefined || value === null ? "null" : isPhpArray(value) ? "array" : typeof value)
  return type(left) === type(right)
}

function compare(operator: "gt" | "gte" | "lt" | "lte", left: number, right: number): boolean {
  if (operator === "gt") return left > right
  if (operator === "gte") return left >= right
  if (operator === "lt") return left < right
  return left <= right
}

function compares(rule: { compare: "gt" | "gte" | "lt" | "lte"; than: string | number }, value: PhpValue | undefined, context: Context): boolean {
  const { rules } = context
  if (typeof rule.than === "number") return phpIsNumeric(value) && compare(rule.compare, size(value, rules), rule.than)
  const found = dataGet(context.input, rule.than)
  const other = found === undefined ? null : found
  if (NUMERIC_RULES.some((name) => hasRule(rules, name)) && phpIsNumeric(value) && phpIsNumeric(other)) {
    return compare(rule.compare, Number(String(value).trim()), Number(String(other).trim()))
  }
  if (!sameType(value, other)) return false
  return compare(rule.compare, size(value, rules), size(other, rules))
}

async function passes(rule: Rule, value: PhpValue | undefined, context: Context): Promise<boolean | string[]> {
  const { rules } = context
  if (rule === "string") return typeof value === "string"
  if (rule === "integer") return phpFilterInt(value) !== null
  if (rule === "numeric") return phpIsNumeric(value)
  if (rule === "array") return isPhpArray(value)
  if (rule === "uuid") return typeof value === "string" && UUID.test(value)
  if (rule === "boolean") return value === true || value === false || value === 0 || value === 1 || value === "0" || value === "1"
  if (rule === "prohibited") return failsRequired(value)
  if (rule === "distinct") return !distinctValues(context.input, context.pattern, context.attribute).some((other) => looseEquals(value, other))
  if (typeof rule === "object" && "in" in rule) return !isPhpArray(value) && rule.in.some((allowed) => looseEquals(phpString(value), allowed))
  if (typeof rule === "object" && "min" in rule) return size(value, rules) >= rule.min
  if (typeof rule === "object" && "max" in rule) return size(value, rules) <= rule.max
  if (typeof rule === "object" && "check" in rule) return rule.check(value as PhpValue)
  if (typeof rule === "object" && "regex" in rule) return (typeof value === "string" || typeof value === "number") && rule.regex.test(String(value))
  if (typeof rule === "object" && "exists" in rule) return value === undefined ? true : rule.exists(value)
  if (typeof rule === "object" && "unique" in rule) return isPhpArray(value) ? true : rule.unique(value as PhpValue)
  if (typeof rule === "object" && "fails" in rule) {
    const messages = await rule.fails(value as PhpValue, context.attribute)
    return messages.length === 0 ? true : messages
  }
  if (typeof rule === "object" && "compare" in rule) return compares(rule, value, context)
  if (typeof rule === "object" && "between" in rule) return size(value, rules) >= rule.between[0] && size(value, rules) <= rule.between[1]
  if (typeof rule === "object" && "url" in rule) return strIsUrl(value, rule.url)
  return true
}

function dependentValues(values: string[], other: PhpValue | undefined): (PhpValue | undefined)[] {
  if (typeof other === "boolean") return values.map((value) => (value === "true" ? true : value === "false" ? false : value))
  if (other === undefined || other === null) return values.map((value) => (value.toLowerCase() === "null" ? null : value))
  return values
}

function holdsDependency(other: PhpValue | undefined, values: string[]): boolean {
  const strict = other === undefined || other === null || typeof other === "boolean"
  const found = other === undefined ? null : other
  return dependentValues(values, other).some((candidate) => (strict ? candidate === found : looseEquals(found, candidate)))
}

function requiresByDependency(rule: Rule, input: PhpArray): boolean {
  if (typeof rule !== "object") return false
  if ("required_if" in rule) return holdsDependency(dataGet(input, rule.required_if[0]), rule.required_if.slice(1))
  if ("required_unless" in rule) return !holdsDependency(dataGet(input, rule.required_unless[0]), rule.required_unless.slice(1))
  return false
}

function displayableValue(value: PhpValue | undefined): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (value === undefined || value === null) return "empty"
  return phpString(value)
}

function customMessage(options: ValidationOptions, context: Context, name: string): string | undefined {
  const messages = options.messages ?? {}
  const direct = messages[`${context.attribute}.${name}`]
  if (direct !== undefined) return direct
  for (const [key, message] of Object.entries(messages)) {
    if (key.endsWith(`.${name}`) && key.includes("*") && wildcardMatches(key.slice(0, -name.length - 1), context.attribute)) return message
  }
  return undefined
}

function comparedLabel(than: string | number, context: Context, label: (name: string) => string): string {
  if (typeof than === "number") return String(than)
  const other = dataGet(context.input, than)
  return other === undefined || other === null ? label(than) : String(size(other, context.rules))
}

function message(rule: Rule, context: Context, label: (name: string) => string, options: ValidationOptions): string {
  const { rules } = context
  const name = ruleName(rule)
  let template = customMessage(options, context, name)
  if (template === undefined) {
    if (typeof rule === "string") template = MESSAGES[rule as "string"]
    else if ("in" in rule) template = MESSAGES.in
    else if ("exists" in rule) template = MESSAGES.exists
    else if ("unique" in rule) template = MESSAGES.unique
    else if ("regex" in rule) template = MESSAGES.regex
    else if ("check" in rule) template = rule.message
    else if ("min" in rule) template = MESSAGES.min[sizeType(rules)]
    else if ("max" in rule) template = MESSAGES.max[sizeType(rules)]
    else if ("compare" in rule) template = MESSAGES[rule.compare][sizeType(rules)]
    else if ("url" in rule) template = MESSAGES.url
    else if ("between" in rule) template = MESSAGES.between[sizeType(rules)]
    else if ("required_if" in rule) template = MESSAGES.required_if
    else if ("required_unless" in rule) template = MESSAGES.required_unless
    else template = ""
  }
  if (typeof rule === "object" && "between" in rule) template = template.replace(":min", String(rule.between[0])).replace(":max", String(rule.between[1]))
  if (typeof rule === "object" && "required_if" in rule) {
    template = template.replace(":other", label(rule.required_if[0])).replace(":value", displayableValue(dataGet(context.input, rule.required_if[0])))
  }
  if (typeof rule === "object" && "required_unless" in rule) {
    template = template.replace(":other", label(rule.required_unless[0])).replace(":values", rule.required_unless.slice(1).join(", "))
  }
  if (typeof rule === "object" && "min" in rule) template = template.replace(":min", String(rule.min))
  if (typeof rule === "object" && "max" in rule) template = template.replace(":max", String(rule.max))
  if (typeof rule === "object" && "compare" in rule) template = template.replace(":value", comparedLabel(rule.than, context, label))
  return template.replace(":attribute", label(context.attribute))
}

function excluded(rules: Rule[], input: PhpArray, attribute: string, pattern: string): boolean {
  for (const rule of rules) {
    if (typeof rule !== "object" || !("excludeUnless" in rule)) continue
    const base = pattern.split(".")
    const concrete = attribute.split(".")
    const other = rule.excludeUnless
      .split(".")
      .map((segment, index) => (segment === "*" && base[index] === "*" ? concrete[index] : segment))
      .join(".")
    const value = dataGet(input, other)
    if (!looseEquals(value === undefined ? null : value, rule.equals)) return true
  }
  return false
}

export type ValidationResult = { errors: Record<string, string[]>; excluded: Set<string> }

export async function validateAttributes(
  input: PhpArray,
  ruleset: Record<string, Rule[]>,
  attributes: Record<string, string> = {},
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const errors: Record<string, string[]> = {}
  const skipped = new Set<string>()
  const expanded: { attribute: string; pattern: string; rules: Rule[] }[] = []
  const explicit = Object.entries(ruleset).filter(([pattern]) => !pattern.includes("*"))
  const wildcards = Object.entries(ruleset).filter(([pattern]) => pattern.includes("*"))
  for (const [pattern, rules] of explicit) expanded.push({ attribute: pattern, pattern, rules })
  const ordered = Object.keys(ruleset).filter((pattern) => !pattern.includes("*"))
  const byAttribute = new Map(expanded.map((entry) => [entry.attribute, entry]))
  for (const [pattern, rules] of wildcards) {
    for (const attribute of expandAttribute(pattern, input)) {
      const existing = byAttribute.get(attribute)
      if (existing) {
        existing.rules = [...existing.rules, ...rules]
        continue
      }
      const entry = { attribute, pattern, rules }
      byAttribute.set(attribute, entry)
      ordered.push(attribute)
    }
  }
  const label = (name: string): string => {
    if (attributes[name] !== undefined) return attributes[name]
    const entry = byAttribute.get(name)
    if (entry && entry.pattern !== name) return attributes[entry.pattern] ?? name
    return name.replace(/_/g, " ")
  }
  const add = (attribute: string, text: string) => {
    const list = errors[attribute] ?? []
    if (!list.includes(text)) errors[attribute] = [...list, text]
  }
  for (const attribute of ordered) {
    const entry = byAttribute.get(attribute)
    if (!entry) continue
    const { pattern, rules } = entry
    if (excluded(rules, input, attribute, pattern)) {
      skipped.add(attribute)
      continue
    }
    const value = dataGet(input, attribute)
    const present = value !== undefined
    const context: Context = { input, pattern, attribute, rules }
    if (rules.includes("sometimes") && !present) continue
    if (rules.includes("present") && !present) {
      add(attribute, message("present", context, label, options))
      continue
    }
    if (rules.includes("required") && failsRequired(value)) {
      add(attribute, message("required", context, label, options))
      continue
    }
    const unmet = rules.find((rule) => requiresByDependency(rule, input) && failsRequired(value))
    if (unmet !== undefined) {
      add(attribute, message(unmet, context, label, options))
      continue
    }
    if (rules.includes("prohibited") && !failsRequired(value)) {
      add(attribute, message("prohibited", context, label, options))
      continue
    }
    if (!present) continue
    if (value === null && rules.includes("nullable")) continue
    for (const rule of rules) {
      if (["required", "nullable", "sometimes", "present", "prohibited", "required_if", "required_unless"].includes(ruleName(rule))) continue
      if (typeof rule === "object" && "excludeUnless" in rule) continue
      if (typeof rule === "object" && "aborts" in rule) {
        const thrown = rule.aborts(value as PhpValue, attribute)
        if (thrown !== null) return { errors: thrown, excluded: skipped }
        continue
      }
      if (typeof rule === "object" && ("exists" in rule || "unique" in rule) && (errors[attribute]?.length ?? 0) > 0) continue
      const outcome = await passes(rule, value, context)
      if (outcome === true) continue
      if (Array.isArray(outcome)) for (const text of outcome) add(attribute, text.replace(":attribute", label(attribute)))
      else add(attribute, message(rule, context, label, options))
    }
  }
  return { errors, excluded: skipped }
}

export async function validateInput(
  input: PhpArray,
  ruleset: Record<string, Rule[]>,
  attributes: Record<string, string> = {},
  options: ValidationOptions = {},
): Promise<Record<string, string[]>> {
  return (await validateAttributes(input, ruleset, attributes, options)).errors
}

export function mergeErrors(target: Record<string, string[]>, attribute: string, messages: string[]): void {
  for (const text of messages) {
    const list = target[attribute] ?? []
    if (!list.includes(text)) target[attribute] = [...list, text]
  }
}
