import { getSession } from "@/api/session"
import { createTemplate, getTemplate, getTemplateAiPermissions, getTemplateJson } from "@/api/template"

export const templateKeys = {
  all: ["template"] as const,
  current: () => ["template", "current"] as const,
  json: (templateId: string) => ["template", "json", templateId] as const,
  aiPermissions: (templateId: string) => ["template", "ai-permissions", templateId] as const,
}

export const templateAiPermissionsQuery = (templateId: string) => ({
  queryKey: templateKeys.aiPermissions(templateId),
  queryFn: () => getTemplateAiPermissions(templateId),
  staleTime: 0,
})

export const adminTemplateQuery = () => ({
  queryKey: templateKeys.current(),
  queryFn: async () => {
    const session = await getSession()
    if (session.active_role?.code !== "administrador") return null
    const payload = await getTemplate()
    if (payload.template !== null) return payload
    await createTemplate()

    return getTemplate()
  },
})

export const templateJsonQuery = (templateId: string) => ({
  queryKey: templateKeys.json(templateId),
  queryFn: () => getTemplateJson(templateId),
  staleTime: 0,
})
