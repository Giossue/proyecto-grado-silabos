import type { z } from "zod"
import { fieldErrors, shapeOrder, type FieldErrors } from "@/schemas/issues"

export type SchemaResult<T> = { data: T; errors: null } | { data: null; errors: FieldErrors }

export async function validateSchema<S extends z.ZodType>(schema: S, input: unknown): Promise<SchemaResult<z.output<S>>> {
  const result = await schema.safeParseAsync(Array.isArray(input) ? { ...input } : input)
  return result.success ? { data: result.data, errors: null } : { data: null, errors: fieldErrors(result.error.issues, shapeOrder(schema)) }
}

export function mergeErrors(target: FieldErrors, attribute: string, messages: string[]): void {
  for (const text of messages) {
    const list = target[attribute] ?? []
    if (!list.includes(text)) target[attribute] = [...list, text]
  }
}
