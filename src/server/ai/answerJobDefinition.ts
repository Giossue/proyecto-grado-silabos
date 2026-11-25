import "server-only"
import { appKey } from "../http/config"
import { uuid7 } from "../http/uuid7"
import { dispatch } from "../queue/dispatch"
import { defineJob } from "../queue/job"
import { answerTemplateAssistant, failTemplateAssistant, type AnswerDeps } from "./answerJob"
import { createAssistantStore } from "./assistantStore"
import { aiConfig } from "./config"
import { gatewayFor } from "./gateway"
import { templateSystemPrompt } from "./knowledge"
import { TemplateAssistant } from "./templateAssistant"

export type AnswerJobData = { messageId: string }

export function defaultAnswerDeps(): AnswerDeps {
  const store = createAssistantStore()
  return {
    store,
    assistant: () => {
      const config = aiConfig()
      return new TemplateAssistant({ gateway: gatewayFor(config), config, system: templateSystemPrompt, processState: () => store.processState() })
    },
    appKey,
    now: () => Math.floor(Date.now() / 1000),
    newProposalId: uuid7,
  }
}

export function createAnswerJob(deps: () => AnswerDeps) {
  return defineJob<AnswerJobData>({
    name: "AnswerTemplateAssistantJob",
    queue: "ia",
    tries: 1,
    timeout: 180,
    uniqueId: (data) => data.messageId,
    runsOnce: true,
    handle: (data) => answerTemplateAssistant(data.messageId, deps()),
    failed: (data) => failTemplateAssistant(data.messageId, deps()),
  })
}

export const answerTemplateAssistantJob = createAnswerJob(defaultAnswerDeps)

export function dispatchTemplateAssistantAnswer(messageId: string): Promise<string> {
  return dispatch(answerTemplateAssistantJob, { messageId })
}
