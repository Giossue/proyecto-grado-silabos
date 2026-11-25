import { z } from "zod"

function representable(field: z.ZodType): boolean {
  try {
    z.toJSONSchema(field, { io: "input" })
    return true
  } catch {
    return false
  }
}

export function documented(schema: z.ZodType): z.ZodObject {
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodType>) : {}
  return z.object(Object.fromEntries(Object.entries(shape).map(([name, field]) => [name, representable(field) ? field : z.any().optional()])))
}
