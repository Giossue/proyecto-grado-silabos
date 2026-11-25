"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, type FieldError, type FieldErrors, type FieldPath, type FieldValues, type Resolver, type UseFormProps, type UseFormReturn, type UseFormSetError } from "react-hook-form"
import type { z } from "zod"
import { ApiError } from "@/api/client"
import { withoutFinalPeriod } from "@/lib/utils"

const isFieldError = (value: unknown): value is FieldError =>
  typeof value === "object" && value !== null && "type" in value && typeof (value as { type: unknown }).type === "string"

function stripPeriods<T extends FieldValues>(errors: FieldErrors<T>): FieldErrors<T> {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit)
    if (typeof node !== "object" || node === null) return node
    if (isFieldError(node)) {
      const types = node.types
        ? Object.fromEntries(
            Object.entries(node.types).map(([key, value]) => [key, Array.isArray(value) ? value.map((text) => withoutFinalPeriod(String(text))) : typeof value === "string" ? withoutFinalPeriod(value) : value]),
          )
        : undefined
      return { ...node, message: node.message === undefined ? undefined : withoutFinalPeriod(node.message), ...(types ? { types } : {}) }
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, visit(value)]))
  }
  return visit(errors) as FieldErrors<T>
}

type SchemaSource<S extends z.ZodType<FieldValues, FieldValues>> = S | ((values: z.input<S>) => S)

export function schemaResolver<S extends z.ZodType<FieldValues, FieldValues>>(source: SchemaSource<S>): Resolver<z.input<S>, unknown, z.output<S>> {
  return async (values, context, options) => {
    const schema = typeof source === "function" ? source(values) : source
    const resolve = zodResolver(schema) as Resolver<z.input<S>, unknown, z.output<S>>
    const result = await resolve(values, context, options)
    if (Object.keys(result.errors).length === 0) return result
    return { values: {}, errors: stripPeriods(result.errors as FieldErrors<z.input<S>>) }
  }
}

export function useSchemaForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: SchemaSource<S>,
  options: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, "resolver"> = {},
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({ criteriaMode: "all", reValidateMode: "onSubmit", ...options, resolver: schemaResolver(schema) })
}

export function errorMessages(error: unknown): string[] | undefined {
  if (!isFieldError(error)) return undefined
  const typed = error.types ? Object.values(error.types).flatMap((value) => (Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [])) : []
  const list = typed.length > 0 ? typed : error.message ? [error.message] : []
  return list.length > 0 ? [...new Set(list)] : undefined
}

export const SERVER_ERROR = "root.server" as const

type ApiErrorOptions = { fallback: string; aliases?: Record<string, string> }

export function applyApiErrors<T extends FieldValues>(setError: UseFormSetError<T>, reason: unknown, { fallback, aliases = {} }: ApiErrorOptions): Record<string, string[]> {
  if (!(reason instanceof ApiError)) {
    setError(SERVER_ERROR, { type: "server", message: fallback })
    return {}
  }
  const entries = Object.entries(reason.errors).filter(([, list]) => list.length > 0)
  for (const [field, list] of entries) {
    setError((aliases[field] ?? field) as FieldPath<T>, {
      type: "server",
      message: list[0],
      types: Object.fromEntries(list.map((text, index) => [`server${index}`, text])),
    })
  }
  if (entries.length === 0) setError(SERVER_ERROR, { type: "server", message: reason.message })
  return reason.errors
}

export function serverMessage<T extends FieldValues>(errors: FieldErrors<T>): string | undefined {
  return (errors.root as Record<string, FieldError | undefined> | undefined)?.server?.message
}

export function fieldMessage<T extends FieldValues>(errors: FieldErrors<T>, name: string): string | undefined {
  const found = name.split(".").reduce<unknown>((node, key) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[key] : undefined), errors)
  return isFieldError(found) ? found.message : undefined
}
