import path from "node:path"
import { fromController } from "../auth/controllerResponse"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession, SessionUser } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestRoot } from "../http/request"
import { apiJson, validationError } from "../http/responses"
import { list, phpCount, phpShape, record, type PhpRecord } from "./phpValues"
import { documentLines } from "./documentHtml"
import { defineBlock } from "./blockDefinition"
import { canonicalJson } from "../documents/canonicalJson"
import { toRuntime } from "./templateDraft"
import { defineAnyBlock, shortBlock } from "./templateShortForm"
import { templateInSpanish } from "./templateSpanish"
import { fieldConditions, fieldLimits, limitAllowed, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { IDENTIFICATION_SAMPLE, syllabusSectionPayload, teacherFieldKeys, type SyllabusTemplate } from "./templatePresentation"
import type { TemplateStore } from "../shared/templateStore"
import { binaryFileResponse } from "../files/binaryFileResponse"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export const FORBIDDEN = "No tiene permiso para hacer esto."

export type TemplateReadDeps = { bridge: BridgeDeps; store: TemplateStore }


export function managesTemplates(session: AppSession): boolean {
  return session.user.active && session.activeRole?.role === "administrador"
}

export async function findTemplate(templateId: string, store: TemplateStore): Promise<SyllabusTemplate | null> {
  const found = isUuid(templateId) ? await store.template() : null
  return found !== null && found.id === templateId.toLowerCase() ? found : null
}

export async function boundTemplate(
  request: Request,
  templateId: string,
  deps: TemplateReadDeps,
  beforeBinding: (user: SessionUser) => Promise<Response | null> | Response | null = () => null,
): Promise<{ session: AppSession; template: SyllabusTemplate } | Response> {
  let template: SyllabusTemplate | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        const early = await beforeBinding(user)
        if (early) return early
        template = await findTemplate(templateId, deps.store)
        return template === null ? modelNotFound(MODELS.template, templateId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (template === null) return modelNotFound(MODELS.template, templateId)
  return { session, template }
}

export async function teacherPreview(request: Request, templateId: string, deps: TemplateReadDeps): Promise<Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return teacherPreviewOf(bound.template)
}

export function teacherPreviewOf(template: SyllabusTemplate): Response {
  const definition = template.definition
  try {
    return apiJson(
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
  return `${requestRoot(request)}/plantilla.schema.json`
}

export async function templateSchema(request: Request): Promise<Response> {
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "src", "server", "configuration", "plantilla.schema.json")
  return fromController(await binaryFileResponse(request, file, { "Content-Type": "application/schema+json", "Cache-Control": "public" }))
}

function exportedBlock(kind: string, block: PhpRecord, variables: string[]): PhpRecord {
  const full = {
    label: block.label,
    ...(phpCount(block.props ?? []) !== 0 ? { props: block.props } : {}),
    ...(phpCount(block.value ?? []) !== 0 ? { value: block.value } : {}),
    ...(phpCount(block.rules ?? []) !== 0 ? { rules: block.rules } : {}),
    ...(block.catalog !== undefined && block.catalog !== null ? { catalog: block.catalog } : {}),
    layout: documentLines({ type: "doc", content: block.layout }),
  }
  const short = shortBlock(block)
  return importsAlike(kind, short, full, variables) ? short : full
}

function importsAlike(kind: string, short: PhpRecord, full: PhpRecord, variables: string[]): boolean {
  const asImported = (value: unknown) => toRuntime(JSON.parse(JSON.stringify(phpShape(value))))
  try {
    return canonicalJson(defineAnyBlock(kind, asImported(short), variables)) === canonicalJson(defineBlock(kind, asImported(full), variables))
  } catch (error) {
    if (error instanceof TemplateValidationError) return false
    throw error
  }
}

export async function exportTemplateJson(request: Request, templateId: string, deps: TemplateReadDeps): Promise<Response> {
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return exportTemplateJsonOf(request, bound.template)
}

export function exportTemplateJsonOf(request: Request, template: SyllabusTemplate): Response {
  return apiJson(phpShape(templateExport(request, template, template.definition)))
}

export function templateExport(request: Request, template: SyllabusTemplate, definition: TemplateDefinition): PhpRecord {
  const conditions = fieldConditions(definition)
  const limits = fieldLimits(definition)
  const variables = Object.keys(definition.variables)
  const blocks = Object.fromEntries(Object.entries(definition.blocks).map(([kind, block]) => [kind, exportedBlock(kind, record(block), variables)]))
  return templateInSpanish({
    $schema: schemaUrl(request),
    version: EXPORT_FORMAT_VERSION,
    ...(definition.response_policy === "protected" ? { response_policy: "protected" } : {}),
    document: definition.document,
    variables: definition.variables,
    blocks,
    required_sections: definition.required_sections,
    library_sections: definition.library_sections,
    teacher_fields: teacherFieldKeys(definition),
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
  })
}

function given(value: unknown, key: string): unknown {
  const found = record(value)[key]
  return found === undefined ? null : found
}
