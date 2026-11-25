import { defaultBridgeDeps } from "../auth/requireSession"
import { requestInput } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { phpShape, type PhpRecord } from "./phpValues"
import { DraftRequest, draftProblems, prepareDraft, toRuntime, validatedSections } from "./templateDraft"
import { boundTemplate, FORBIDDEN, managesTemplates, type TemplateReadDeps } from "./templateReads"
import { PREVIEW_UNAVAILABLE, rehearseImpact, rehearsePreview, type RehearsalStore } from "./templateRehearsal"
import { createRehearsalStore } from "./templateRehearsalStore"
import { TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { createTemplateStore } from "./templateStore"
import type { AppSession } from "../auth/types"
import type { SyllabusTemplate } from "./templatePresentation"

export type TemplateDraftDeps = TemplateReadDeps & { rehearsal: RehearsalStore; limiter: RateLimiter }

export function defaultTemplateDraftDeps(): TemplateDraftDeps {
  return { bridge: defaultBridgeDeps(), store: createTemplateStore(), rehearsal: createRehearsalStore(), limiter: sharedRateLimiter() }
}

type Draft = { session: AppSession; template: SyllabusTemplate; definition: TemplateDefinition; input: PhpRecord }

async function draftOf(
  request: Request,
  templateId: string,
  deps: TemplateDraftDeps,
  beforeBinding?: Parameters<typeof boundTemplate>[3],
): Promise<Draft | Response> {
  const original = request.clone()
  const input = toRuntime(await requestInput(request)) as PhpRecord
  const bound = await boundTemplate(original, templateId, deps, beforeBinding)
  if (bound instanceof Response) return bound
  const definition = bound.template.definition
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  return { ...bound, definition, input }
}

export async function checkTemplateDraft(request: Request, templateId: string, deps: TemplateDraftDeps = defaultTemplateDraftDeps()): Promise<Response> {
  let gate: Throttle | null = null
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  const draft = await draftOf(request, templateId, deps, (user) => {
    gate = throttle(deps.limiter, { key: `throttle:120,1:${user.id}`, maxAttempts: 120, decaySeconds: 60 }, deps.bridge.now)
    return gate.hit()
  })
  if (draft instanceof Response) return finish(draft)
  return finish(apiJson({ problems: await draftProblems(draft.input, draft.definition) }))
}

async function validDraft(request: Request, templateId: string, deps: TemplateDraftDeps): Promise<(Draft & { request: DraftRequest }) | Response> {
  const draft = await draftOf(request, templateId, deps)
  if (draft instanceof Response) return draft
  const validation = new DraftRequest(prepareDraft(draft.input), draft.definition)
  const errors = await validation.errors()
  if (Object.keys(errors).length > 0) return validationError(errors)
  return { ...draft, request: validation }
}

async function rendered(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

export async function previewTemplateDraft(request: Request, templateId: string, deps: TemplateDraftDeps = defaultTemplateDraftDeps()): Promise<Response> {
  const draft = await validDraft(request, templateId, deps)
  if (draft instanceof Response) return draft
  return rendered(async () => {
    const sections = validatedSections(draft.request.input)
    const preview = await rehearsePreview(deps.rehearsal, draft.template.id, sections, draft.request.definition())
    if (preview === null) return validationError({ draft: [PREVIEW_UNAVAILABLE] })
    return apiJson(phpShape(preview))
  })
}

export async function templateDraftImpact(request: Request, templateId: string, deps: TemplateDraftDeps = defaultTemplateDraftDeps()): Promise<Response> {
  const draft = await validDraft(request, templateId, deps)
  if (draft instanceof Response) return draft
  return rendered(async () => {
    const sections = validatedSections(draft.request.input)
    return apiJson(await rehearseImpact(deps.rehearsal, draft.template.id, sections, draft.request.definition()))
  })
}
