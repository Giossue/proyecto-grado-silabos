import "server-only"
import { defaultBridgeDeps } from "../auth/requireSession"
import { dispatchTemplateAssistantAnswer } from "./answerJobDefinition"
import { applyProposal, clearAssistant, defaultAssistantIds, discardProposal, showAssistant, showProposal, storeAssistantMessage, type AssistantRouteDeps } from "./assistantRoutes"
import { createAssistantStore } from "./assistantStore"
import { aiConfig } from "./config"

function deps(): AssistantRouteDeps {
  return { bridge: defaultBridgeDeps(), store: createAssistantStore(), config: () => aiConfig(), ...defaultAssistantIds(), dispatchAnswer: dispatchTemplateAssistantAnswer }
}

export function templateAssistant(request: Request): Promise<Response> {
  return showAssistant(request, deps())
}

export function templateAssistantMessage(request: Request): Promise<Response> {
  return storeAssistantMessage(request, deps())
}

export function templateAssistantClear(request: Request): Promise<Response> {
  return clearAssistant(request, deps())
}

export function templateAssistantProposal(request: Request, proposalId: string): Promise<Response> {
  return showProposal(request, proposalId, deps())
}

export function templateAssistantApply(request: Request, proposalId: string): Promise<Response> {
  return applyProposal(request, proposalId, deps())
}

export function templateAssistantDiscard(request: Request, proposalId: string): Promise<Response> {
  return discardProposal(request, proposalId, deps())
}
