import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { laravelJson, validationError } from "../laravel/responses"
import { list, phpCount, phpShape, record, type PhpRecord } from "./phpValues"
import { documentLines } from "./documentHtml"
import { fieldConditions, fieldLimits, limitAllowed, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { IDENTIFICATION_SAMPLE, syllabusSectionPayload, type SyllabusTemplate } from "./templatePresentation"
import { createTemplateStore, type TemplateStore } from "./templateStore"

export const FORBIDDEN = "No tiene permiso para hacer esto."

export type TemplateReadDeps = { bridge: BridgeDeps; store: TemplateStore }

export function defaultTemplateReadDeps(): TemplateReadDeps {
  return { bridge: defaultBridgeDeps(), store: createTemplateStore() }
}

export function managesTemplates(session: LaravelSession): boolean {
  return session.user.active && session.activeRole?.role === "administrador"
}

export async function boundTemplate(
  request: Request,
  templateId: string,
  deps: TemplateReadDeps,
): Promise<{ session: LaravelSession; template: SyllabusTemplate } | Response> {
  if (!isUuid(templateId)) return deps.bridge.forward(request)
  let template: SyllabusTemplate | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async () => {
        const found = await deps.store.template()
        template = found !== null && found.id === templateId.toLowerCase() ? found : null
        return template === null ? deps.bridge.forward(request) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (template === null) return deps.bridge.forward(request)
  return { session, template }
}

export async function teacherPreview(request: Request, templateId: string, deps: TemplateReadDeps = defaultTemplateReadDeps()): Promise<Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return laravelJson({ message: FORBIDDEN }, 403)
  const { template } = bound
  if (template.definition === null) return deps.bridge.forward(request)
  const definition = template.definition
  try {
    return laravelJson(
      phpShape({
        sections: template.sections.map((section) =>
          syllabusSectionPayload(section, (field) => field.content, { identification: IDENTIFICATION_SAMPLE }, definition),
        ),
      }),
    )
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

const EXPORT_FORMAT_VERSION = 2

function schemaUrl(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "")
  return `${scheme}://${host}/plantilla.schema.json`
}

function exportedBlock(block: PhpRecord): PhpRecord {
  return {
    label: block.label,
    ...(phpCount(block.props ?? []) !== 0 ? { props: block.props } : {}),
    ...(phpCount(block.value ?? []) !== 0 ? { value: block.value } : {}),
    ...(phpCount(block.rules ?? []) !== 0 ? { rules: block.rules } : {}),
    ...(block.catalog !== undefined && block.catalog !== null ? { catalog: block.catalog } : {}),
    layout: documentLines({ type: "doc", content: block.layout }),
  }
}

export async function exportTemplateJson(request: Request, templateId: string, deps: TemplateReadDeps = defaultTemplateReadDeps()): Promise<Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return laravelJson({ message: FORBIDDEN }, 403)
  const { template } = bound
  const definition = template.definition
  if (definition === null) return deps.bridge.forward(request)
  return laravelJson(phpShape(templateExport(request, template, definition)))
}

export function templateExport(request: Request, template: SyllabusTemplate, definition: TemplateDefinition): PhpRecord {
  const conditions = fieldConditions(definition)
  const limits = fieldLimits(definition)
  const blocks = Object.fromEntries(Object.entries(definition.blocks).map(([kind, block]) => [kind, exportedBlock(record(block))]))
  return {
    $schema: schemaUrl(request),
    version: EXPORT_FORMAT_VERSION,
    ...(definition.response_policy === "protected" ? { response_policy: "protected" } : {}),
    document: definition.document,
    variables: definition.variables,
    blocks,
    required_sections: definition.required_sections,
    library_sections: definition.library_sections,
    presets: list(definition.presets).map((preset) => ({ key: given(preset, "key"), label: given(preset, "label"), field: given(preset, "field") })),
    sections: template.sections.map((section) => ({
      key: section.key,
      title: section.title,
      orientation: section.orientation,
      fields: section.blocks.flatMap((block) =>
        block.fields.map((field) => ({
          key: field.key,
          label: field.label,
          quien_llena: field.responsible,
          content: documentLines(field.content),
          ...(field.key in conditions ? { show_if: conditions[field.key] } : {}),
          ...(field.key in limits && limitAllowed(field.responsible) ? { max_length: limits[field.key] } : {}),
        })),
      ),
    })),
  }
}

function given(value: unknown, key: string): unknown {
  const found = record(value)[key]
  return found === undefined ? null : found
}
