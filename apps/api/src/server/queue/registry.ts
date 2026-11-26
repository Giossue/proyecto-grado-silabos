import type { PrismaService } from "../../prisma/prisma.service"
import { supportDocumentViewJobOn } from "../academic/supportDocumentViewJob"
import { answerTemplateAssistantJobOn } from "../ai/answerJobDefinition"
import { syllabusExportJobOn } from "../documents/syllabusExportJob"
import { sendMailJob } from "../mail/sendMailJob"
import type { AnyJobDefinition } from "./job"
import { platformSmokeJobOn } from "./jobs/platformSmoke"

export function registeredJobsOn(prisma: PrismaService): readonly AnyJobDefinition[] {
  return [platformSmokeJobOn(prisma), sendMailJob, syllabusExportJobOn(prisma), supportDocumentViewJobOn(prisma), answerTemplateAssistantJobOn(prisma)] as unknown as AnyJobDefinition[]
}
