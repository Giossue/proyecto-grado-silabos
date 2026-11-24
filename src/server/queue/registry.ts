import "server-only"
import { supportDocumentViewJob } from "../academic/supportDocumentViewJob"
import { answerTemplateAssistantJob } from "../ai/answerJobDefinition"
import { syllabusExportJob } from "../documents/syllabusExportJob"
import { sendMailJob } from "../mail/sendMailJob"
import type { AnyJobDefinition } from "./job"
import { platformSmokeJob } from "./jobs/platformSmoke"

export const registeredJobs: readonly AnyJobDefinition[] = [platformSmokeJob, sendMailJob, syllabusExportJob, supportDocumentViewJob, answerTemplateAssistantJob] as unknown as AnyJobDefinition[]
