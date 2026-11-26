import { requestInput, type PhpArray } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { phpShape, type PhpRecord } from "./phpValues"
import { DraftRequest, draftProblems, prepareDraft, toRuntime, validatedSections } from "./templateDraft"
import { boundTemplate, FORBIDDEN, managesTemplates, type TemplateReadDeps } from "./templateReads"
import { PREVIEW_UNAVAILABLE, rehearseImpact, rehearsePreview, type RehearsalStore } from "./templateRehearsal"
import { TemplateValidationError } from "./templateRuntime"
import type { AppSession } from "../auth/types"
import type { SyllabusTemplate } from "./templatePresentation"

export type TemplateDraftDeps = TemplateReadDeps & { rehearsal: RehearsalStore; limiter: RateLimiter }


type Draft = { session: AppSession; template: SyllabusTemplate; input: PhpArray }

async function draftOf(
  request: Request,
  templateId: string,
  deps: TemplateDraftDeps,
  beforeBinding?: Parameters<typeof boundTemplate>[3],
): Promise<Draft | Response> {
  const original = request.clone()
  const input = await requestInput(request)
  const bound = await boundTemplate(original, templateId, deps, beforeBinding)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return { ...bound, input }
}

export async function checkTemplateDraft(request: Request, templateId: string, deps: TemplateDraftDeps): Promise<Response> {
  let gate: Throttle | null = null
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  const draft = await draftOf(request, templateId, deps, (user) => {
    gate = throttle(deps.limiter, { key: `throttle:120,1:${user.id}`, maxAttempts: 120, decaySeconds: 60 }, deps.bridge.now)
    return gate.hit()
  })
  if (draft instanceof Response) return finish(draft)
  return finish(await checkTemplateDraftOf(draft.input, draft.template))
}

export async function checkTemplateDraftOf(input: PhpArray, template: SyllabusTemplate): Promise<Response> {
  return apiJson({ problems: await draftProblems(toRuntime(input) as PhpRecord, template.definition) })
}

async function validDraftOf(input: PhpRecord, template: SyllabusTemplate): Promise<DraftRequest | Response> {
  const validation = new DraftRequest(prepareDraft(input), template.definition)
  const errors = await validation.errors()
  if (Object.keys(errors).length > 0) return validationError(errors)
  return validation
}

async function rendered(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

export async function previewTemplateDraft(request: Request, templateId: string, deps: TemplateDraftDeps): Promise<Response> {
  const draft = await draftOf(request, templateId, deps)
  if (draft instanceof Response) return draft
  return previewTemplateDraftOf(draft.input, draft.template, deps.rehearsal)
}

export async function previewTemplateDraftOf(input: PhpArray, template: SyllabusTemplate, rehearsal: RehearsalStore): Promise<Response> {
  const request = await validDraftOf(toRuntime(input) as PhpRecord, template)
  if (request instanceof Response) return request
  return rendered(async () => {
    const sections = validatedSections(request.input)
    const preview = await rehearsePreview(rehearsal, template.id, sections, request.definition())
    if (preview === null) return validationError({ draft: [PREVIEW_UNAVAILABLE] })
    return apiJson(phpShape(preview))
  })
}

export async function templateDraftImpact(request: Request, templateId: string, deps: TemplateDraftDeps): Promise<Response> {
  const draft = await draftOf(request, templateId, deps)
  if (draft instanceof Response) return draft
  return templateDraftImpactOf(draft.input, draft.template, deps.rehearsal)
}

export async function templateDraftImpactOf(input: PhpArray, template: SyllabusTemplate, rehearsal: RehearsalStore): Promise<Response> {
  const request = await validDraftOf(toRuntime(input) as PhpRecord, template)
  if (request instanceof Response) return request
  return rendered(async () => {
    const sections = validatedSections(request.input)
    return apiJson(await rehearseImpact(rehearsal, template.id, sections, request.definition()))
  })
}
