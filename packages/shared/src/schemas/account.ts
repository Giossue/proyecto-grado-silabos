import { z } from "zod"
import { emailShape } from "./email"
import { messages } from "./messages"
import { addIssues, codePointLength, requiredText, requiredValue } from "./rules"

export type UniqueCheck = (value: string) => Promise<boolean>

export function emailField(label: string, options: { max: number; unique?: UniqueCheck; uniqueMessage?: string; required?: string }) {
  return requiredValue(options.required ?? messages.required(label)).superRefine(async (raw, context) => {
    const value = typeof raw === "string" ? raw.trim() : raw
    const failed: string[] = []
    if (typeof value !== "string") failed.push(messages.string(label))
    if (emailShape(value) !== "valid") failed.push(messages.email(label))
    if (codePointLength(String(value)) > options.max) failed.push(messages.max(label, options.max))
    if (failed.length === 0 && options.unique && !(await options.unique(value))) failed.push(options.uniqueMessage ?? messages.unique(label))
    addIssues(context, failed)
  })
}

export function profileSchema(unique?: UniqueCheck) {
  return z.object({
    nombre: requiredText(messages.required("nombre"), messages.string("nombre")).refine((value) => codePointLength(value) <= 255, { message: messages.max("nombre", 255) }),
    correo_electronico: emailField("correo electrónico", { max: 255, unique }),
  })
}

export type ProfileValues = z.input<ReturnType<typeof profileSchema>>
