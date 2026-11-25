import { dispatchTemplateAssistantAnswer } from "../../server/ai/answerJobDefinition"
import { defaultAssistantIds, type AssistantRouteDeps } from "../../server/ai/assistantRoutes"
import { aiConfig } from "../../server/ai/config"

export const ASSISTANT_RUNTIME = Symbol("ASSISTANT_RUNTIME")

export type AssistantRuntime = Omit<AssistantRouteDeps, "bridge" | "store">

export function defaultAssistantRuntime(): AssistantRuntime {
  return { config: () => aiConfig(), ...defaultAssistantIds(), dispatchAnswer: dispatchTemplateAssistantAnswer }
}
