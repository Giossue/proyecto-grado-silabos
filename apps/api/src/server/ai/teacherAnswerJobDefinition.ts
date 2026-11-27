import type { PrismaService } from "../../prisma/prisma.service"
import { sessionStoreOn } from "../../modules/auth/repositories/session-store.repository"
import { appKey } from "../http/config"
import { uuid7 } from "../http/uuid7"
import { teacherAssistantEnabledOn } from "../operations/systemSettings"
import { dispatch } from "../queue/dispatch"
import { defineJob } from "../queue/job"
import { institutionToday, systemNow } from "../shared/clock"
import { aiConfig } from "./config"
import { answerTeacherAssistant, failTeacherAssistant, teacherSessionOn, type TeacherAnswerDeps } from "./teacherAnswerJob"
import { createTeacherAssistantStore } from "./teacherAssistantStore"
import { teacherGatewayFor } from "./teacherGateway"

export type TeacherAnswerJobData = { messageId: string }

export function defaultTeacherAnswerDeps(prisma: PrismaService): TeacherAnswerDeps {
  return {
    store: createTeacherAssistantStore(prisma),
    config: () => aiConfig(),
    enabled: () => teacherAssistantEnabledOn(prisma),
    today: institutionToday,
    teacherSession: teacherSessionOn(sessionStoreOn(prisma)),
    gateway: (config) => teacherGatewayFor(config),
    appKey,
    now: systemNow,
    newProposalId: uuid7,
  }
}

export function createTeacherAnswerJob(deps: () => TeacherAnswerDeps) {
  return defineJob<TeacherAnswerJobData>({
    name: "AnswerTeacherAssistantJob",
    queue: "ia",
    tries: 1,
    timeout: 180,
    uniqueId: (data) => data.messageId,
    runsOnce: true,
    handle: (data) => answerTeacherAssistant(data.messageId, deps()),
    failed: (data) => failTeacherAssistant(data.messageId, deps()),
  })
}

export function answerTeacherAssistantJobOn(prisma: PrismaService) {
  return createTeacherAnswerJob(() => defaultTeacherAnswerDeps(prisma))
}

const dispatchedTeacherAnswerJob = createTeacherAnswerJob(() => {
  throw new Error("AnswerTeacherAssistantJob runs only in the worker, built with answerTeacherAssistantJobOn.")
})

export function dispatchTeacherAssistantAnswer(messageId: string): Promise<string> {
  return dispatch(dispatchedTeacherAnswerJob, { messageId })
}
