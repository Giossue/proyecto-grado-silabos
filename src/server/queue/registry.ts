import "server-only"
import { supportDocumentViewJob } from "../academic/supportDocumentViewJob"
import { syllabusExportJob } from "../documents/syllabusExportJob"
import { sendMailJob } from "../mail/sendMailJob"
import type { AnyJobDefinition } from "./job"
import { platformSmokeJob } from "./jobs/platformSmoke"

export const registeredJobs: readonly AnyJobDefinition[] = [platformSmokeJob, sendMailJob, syllabusExportJob, supportDocumentViewJob] as unknown as AnyJobDefinition[]
