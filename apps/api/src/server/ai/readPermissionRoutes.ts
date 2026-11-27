import { aiReadPermissionSchema } from "@silabos/shared/schemas/template"
import type { AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { templateFields, type SyllabusTemplate, type TemplateField } from "../configuration/templatePresentation"
import { FORBIDDEN, managesTemplates } from "../configuration/templateReads"
import { phpBoolean } from "../identity/accountRules"
import type { PhpArray } from "../http/input"
import { MODELS } from "../http/models"
import { apiJson, validationError } from "../http/responses"
import { modelNotFound } from "../http/router"
import { validateSchema } from "../http/schemaValidation"
import { aiBlockReason } from "./readableFields"
import type { AiReadPermissionStore } from "./readPermissionStore"

export type AiReadPermissionEntry = { id: string; key: string; readable: boolean; blocked_reason: string | null }

export const AI_READ_ALLOWED = "La IA ya puede leer este campo."
export const AI_READ_DENIED = "La IA ya no lee este campo."

function entryOf(template: SyllabusTemplate, field: TemplateField, allowed: ReadonlySet<string>): AiReadPermissionEntry {
  const reason = aiBlockReason(field, template.definition)
  return { id: field.id, key: field.key, readable: reason === null && allowed.has(field.key), blocked_reason: reason }
}

export async function showAiReadPermissionsOf(session: AppSession, template: SyllabusTemplate, store: AiReadPermissionStore): Promise<Response> {
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  const allowed = await store.allowedKeys(template.id)
  return apiJson({ fields: templateFields(template).map((field) => entryOf(template, field, allowed)) })
}

export async function saveAiReadPermissionOf(session: AppSession, input: PhpArray, template: SyllabusTemplate, fieldId: string, store: AiReadPermissionStore): Promise<Response> {
  if (!managesTemplates(session)) return apiJson({ message: FORBIDDEN }, 403)
  const { errors } = await validateSchema(aiReadPermissionSchema, input)
  if (errors !== null) return validationError(errors)
  const readable = phpBoolean(input.readable)
  const id = fieldId.toLowerCase()
  if (!isUuid(id)) return modelNotFound(MODELS.field, fieldId)
  return store.transaction(async (tx) => {
    const current = await tx.lockTemplate(template.id)
    const field = current === null ? undefined : templateFields(current).find((candidate) => candidate.id === id)
    if (current === null || field === undefined) return modelNotFound(MODELS.field, fieldId)
    const reason = aiBlockReason(field, current.definition)
    if (readable && reason !== null) return validationError({ readable: [reason] })
    await tx.save(current.id, field.key, readable)
    return apiJson({ message: readable ? AI_READ_ALLOWED : AI_READ_DENIED, field: entryOf(current, field, new Set(readable ? [field.key] : [])) })
  })
}
