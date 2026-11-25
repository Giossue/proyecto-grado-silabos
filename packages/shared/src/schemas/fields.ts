import { z } from "zod"
import { messages, type SizeType } from "./messages"
import { phpFilterInt, phpIsNumeric, phpLooseEquals, phpString } from "./php"
import { passesDateRule } from "../lib/phpDates"
import { codePointLength, isBlank, UUID_PATTERN } from "./rules"
import { strIsUrl } from "./strIsUrl"

export type Message = string | ((label: string) => string)

export type FieldContext = { label: string; size: SizeType; siblings: readonly unknown[]; attribute: string }

export type FieldScope = { siblings?: readonly unknown[]; attribute?: string }

export type Check = {
  kind?: "integer" | "numeric" | "array"
  deferred?: boolean
  test: (value: unknown, context: FieldContext) => string | string[] | null | Promise<string | string[] | null>
}

export type FieldOptions = {
  required?: boolean
  requiredMessage?: Message
  sometimes?: boolean
  nullable?: boolean
  present?: boolean
  prohibited?: boolean
  prohibitedMessage?: Message
}

const text = (message: Message, label: string): string => (typeof message === "function" ? message(label) : message)

const isList = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const failure = (passes: boolean, message: Message, label: string): string | null => (passes ? null : text(message, label))

export function sizeOf(value: unknown, type: SizeType): number {
  if (type === "numeric" && phpIsNumeric(value)) return Number(typeof value === "string" ? value.trim() : value)
  if (isList(value)) return Object.keys(value).length
  return codePointLength(phpString(value))
}

function sizeType(checks: readonly Check[]): SizeType {
  if (checks.some((check) => check.kind === "integer" || check.kind === "numeric")) return "numeric"
  return checks.some((check) => check.kind === "array") ? "array" : "string"
}

export const is = {
  string: (message: Message = messages.string): Check => ({ test: (value, { label }) => failure(typeof value === "string", message, label) }),
  integer: (message: Message = messages.integer): Check => ({ kind: "integer", test: (value, { label }) => failure(phpFilterInt(value) !== null, message, label) }),
  numeric: (message: Message = messages.numeric): Check => ({ kind: "numeric", test: (value, { label }) => failure(phpIsNumeric(value), message, label) }),
  array: (message: Message = messages.array): Check => ({ kind: "array", test: (value, { label }) => failure(isList(value), message, label) }),
  uuid: (message: Message = messages.uuid): Check => ({ test: (value, { label }) => failure(typeof value === "string" && UUID_PATTERN.test(value), message, label) }),
  boolean: (message: Message = messages.boolean): Check => ({
    test: (value, { label }) => failure([true, false, 0, 1, "0", "1"].includes(value as never), message, label),
  }),
  oneOf: (values: readonly string[], message: Message = messages.in): Check => ({
    test: (value, { label }) => failure(!isList(value) && values.some((allowed) => phpLooseEquals(phpString(value), allowed)), message, label),
  }),
  min: (limit: number, message?: Message): Check => ({
    test: (value, { label, size }) => failure(sizeOf(value, size) >= limit, message ?? ((name) => messages.min(name, limit, size)), label),
  }),
  max: (limit: number, message?: Message): Check => ({
    test: (value, { label, size }) => failure(sizeOf(value, size) <= limit, message ?? ((name) => messages.max(name, limit, size)), label),
  }),
  between: (low: number, high: number): Check => ({
    test: (value, { label, size }) => failure(sizeOf(value, size) >= low && sizeOf(value, size) <= high, (name) => messages.between(name, low, high, size), label),
  }),
  matches: (pattern: RegExp, message: Message = messages.regex): Check => ({
    test: (value, { label }) => failure((typeof value === "string" || typeof value === "number") && pattern.test(String(value)), message, label),
  }),
  distinct: (message: Message = messages.distinct): Check => ({
    test: (value, { label, siblings }) => failure(!siblings.some((other) => phpLooseEquals(value, other)), message, label),
  }),
  url: (protocols: string[], message: Message = messages.url): Check => ({ test: (value, { label }) => failure(strIsUrl(value, protocols), message, label) }),
  date: (message: Message = messages.date): Check => ({ test: (value, { label }) => failure(passesDateRule(value), message, label) }),
  satisfying: (passes: (value: unknown) => boolean, message: Message): Check => ({ test: (value, { label }) => failure(passes(value), message, label) }),
  refined: (failures: (value: unknown, attribute: string) => string[] | Promise<string[]>): Check => ({ test: (value, { attribute }) => failures(value, attribute) }),
  existing: (exists: (value: unknown) => Promise<boolean>, message: Message = messages.exists): Check => ({
    deferred: true,
    test: async (value, { label }) => failure(await exists(value), message, label),
  }),
  unique: (available: (value: unknown) => Promise<boolean>, message: Message = messages.unique): Check => ({
    deferred: true,
    test: async (value, { label }) => (isList(value) ? null : failure(await available(value), message, label)),
  }),
}

export async function fieldFailures(value: unknown, label: string, checks: readonly Check[], options: FieldOptions = {}, scope: FieldScope = {}): Promise<string[]> {
  if (options.sometimes && value === undefined) return []
  if (options.present && value === undefined) return [messages.present(label)]
  if (options.required && isBlank(value)) return [text(options.requiredMessage ?? messages.required, label)]
  if (options.prohibited && !isBlank(value)) return [text(options.prohibitedMessage ?? messages.prohibited, label)]
  if (value === undefined) return []
  if (value === null && options.nullable) return []
  const context: FieldContext = { label, size: sizeType(checks), siblings: scope.siblings ?? [], attribute: scope.attribute ?? "" }
  const failed: string[] = []
  for (const check of checks) {
    if (check.deferred && failed.length > 0) continue
    const outcome = await check.test(value, context)
    for (const message of outcome === null ? [] : Array.isArray(outcome) ? outcome : [outcome]) if (!failed.includes(message)) failed.push(message)
  }
  return failed
}

export function field<T = unknown>(label: string, checks: readonly Check[] = [], options: FieldOptions = {}): z.ZodType<T | undefined, T | undefined> {
  return z
    .unknown()
    .optional()
    .pipe(
      z.unknown().superRefine(async (value, context) => {
        for (const message of await fieldFailures(value, label, checks, options)) context.addIssue({ code: "custom", message })
      }),
    ) as z.ZodType<T | undefined, T | undefined>
}

export const requiredField = <T = unknown>(label: string, checks: readonly Check[] = [], options: Omit<FieldOptions, "required"> = {}) => field<T>(label, checks, { ...options, required: true })
export const nullableField = <T = unknown>(label: string, checks: readonly Check[] = [], options: Omit<FieldOptions, "nullable"> = {}) => field<T | null>(label, checks, { ...options, nullable: true })
export const sometimesField = <T = unknown>(label: string, checks: readonly Check[] = [], options: Omit<FieldOptions, "sometimes"> = {}) => field<T>(label, checks, { ...options, sometimes: true })
export const prohibitedField = (label: string, prohibitedMessage?: Message) => field(label, [], { prohibited: true, prohibitedMessage })

export function entriesOf(value: unknown): [string, unknown][] {
  return isList(value) ? Object.entries(value) : []
}

export const attributeName = (attribute: string): string => attribute

export type ItemPath = (string | number)[]

export async function checkItems(
  context: z.RefinementCtx,
  items: readonly [ItemPath, unknown][],
  label: string | ((attribute: string) => string),
  checks: readonly Check[],
  options: FieldOptions = {},
): Promise<void> {
  for (const [index, [path, value]] of items.entries()) {
    const siblings = items.filter(([, other], position) => position !== index && other !== undefined && !(isList(other) && Object.keys(other).length > 0)).map(([, other]) => other)
    const attribute = path.map(String).join(".")
    const name = typeof label === "string" ? label : label(attribute)
    for (const message of await fieldFailures(value, name, checks, options, { siblings, attribute })) context.addIssue({ code: "custom", message, path })
  }
}

export function itemsAt(value: unknown, path: ItemPath): [ItemPath, unknown][] {
  return entriesOf(value).map(([key, item]) => [[...path, key], item])
}

export function valueAt(value: unknown, key: string): unknown {
  return isList(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined
}

export function nestedItems(items: readonly [ItemPath, unknown][], key: string): [ItemPath, unknown][] {
  return items.map(([path, item]) => [[...path, key], valueAt(item, key)])
}

export function childItems(items: readonly [ItemPath, unknown][], key: string): [ItemPath, unknown][] {
  return nestedItems(items, key).flatMap(([path, value]) => itemsAt(value, path))
}

export function addFailures(context: z.RefinementCtx, path: ItemPath, failures: readonly string[]): void {
  for (const message of failures) context.addIssue({ code: "custom", message, path })
}
