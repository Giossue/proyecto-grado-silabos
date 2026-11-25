import { z } from "zod"
import { messages } from "./messages"
import { phpFilterInt, phpIsNumeric, phpString } from "./php"

export const UUID_PATTERN = /^[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}$/

export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return typeof value === "object" && Object.keys(value).length === 0
}

const isMissing = (value: unknown): boolean => value === undefined || value === null

export function requiredText(required: string, type: string) {
  return z
    .string({ error: (issue) => (isMissing(issue.input) ? required : type) })
    .refine((value) => value.trim() !== "", { message: required, abort: true })
}

export function anyValue<T>(): z.ZodType<T, T> {
  return z.unknown() as z.ZodType<T, T>
}

export function requiredValue<T = string>(required: string) {
  return anyValue<T>().refine((value) => !isBlank(value), { message: required, abort: true })
}

export function optionalText(type: string) {
  return z.string({ error: type }).nullish()
}

export function requiredUuid(required: string, invalid: string) {
  return requiredText(required, invalid).regex(UUID_PATTERN, invalid)
}

export function requiredBoolean(required: string, invalid: string) {
  return z.union([z.boolean(), z.literal(0), z.literal(1), z.literal("0"), z.literal("1")], {
    error: (issue) => (isMissing(issue.input) ? required : invalid),
  })
}

export function requiredChoice<const T extends readonly [string, ...string[]]>(values: T, required: string, invalid: string) {
  return requiredText(required, invalid).refine((value) => values.includes(value), { message: invalid })
}

export function codePointLength(value: string): number {
  return [...value].length
}

export function maxCharacters(limit: number, message: string) {
  return (value: string) => codePointLength(value) <= limit || message
}

export function addIssues(context: z.RefinementCtx, messages: string[]): void {
  for (const message of messages) context.addIssue({ code: "custom", message })
}

const isObject = (value: unknown): boolean => typeof value === "object" && value !== null

export function nullableText(label: string, options: { max?: number; min?: number } = {}) {
  return anyValue<string | null>()
    .optional()
    .superRefine((value, context) => {
      if (value === undefined || value === null) return
      const failed: string[] = []
      if (typeof value !== "string") failed.push(messages.string(label))
      const length = isObject(value) ? Object.keys(value as unknown as object).length : codePointLength(phpString(value))
      if (options.min !== undefined && length < options.min) failed.push(messages.min(label, options.min))
      if (options.max !== undefined && length > options.max) failed.push(messages.max(label, options.max))
      addIssues(context, failed)
    })
}

export function nullableChoice(label: string, values: readonly string[], message = messages.in(label)) {
  return anyValue<string | null>()
    .optional()
    .refine((value) => value === undefined || value === null || (!isObject(value) && values.includes(phpString(value))), { message })
}

export function nullableInteger(label: string, options: { min?: number; max?: number } = {}) {
  return anyValue<string | number | null>()
    .optional()
    .superRefine((value, context) => {
      if (value === undefined || value === null) return
      const integer = phpFilterInt(value)
      if (integer === null) {
        const failed = [messages.integer(label)]
        if (!phpIsNumeric(value) && options.min !== undefined && codePointLength(phpString(value)) < options.min) failed.push(messages.min(label, options.min, "numeric"))
        return addIssues(context, failed)
      }
      const failed: string[] = []
      if (options.min !== undefined && integer < options.min) failed.push(messages.min(label, options.min, "numeric"))
      if (options.max !== undefined && integer > options.max) failed.push(messages.max(label, options.max, "numeric"))
      addIssues(context, failed)
    })
}
