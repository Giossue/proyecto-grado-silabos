import type { z } from "zod"

export type FieldErrors = Record<string, string[]>

export function fieldErrors(issues: readonly z.core.$ZodIssue[], order: readonly string[] = []): FieldErrors {
  const errors: FieldErrors = {}
  const rank = (issue: z.core.$ZodIssue) => {
    const explicit = order.indexOf(issue.path.map(String).join("."))
    const index = explicit !== -1 || issue.path.length !== 1 ? explicit : order.indexOf(String(issue.path[0]))
    return index === -1 ? order.length : index
  }
  const sorted = order.length === 0 ? issues : [...issues].sort((left, right) => rank(left) - rank(right))
  for (const issue of sorted) {
    const field = issue.path.map(String).join(".")
    const list = errors[field] ?? []
    if (!list.includes(issue.message)) errors[field] = [...list, issue.message]
  }
  return errors
}

export function shapeOrder(schema: z.ZodType): string[] {
  const declared = schema.meta()?.errorOrder
  if (Array.isArray(declared)) return declared.map(String)
  const shape = (schema as { shape?: Record<string, unknown> }).shape
  return typeof shape === "object" && shape !== null ? Object.keys(shape) : []
}

export async function schemaErrors(schema: z.ZodType, input: unknown): Promise<FieldErrors> {
  const result = await schema.safeParseAsync(input)
  return result.success ? {} : fieldErrors(result.error.issues, shapeOrder(schema))
}
