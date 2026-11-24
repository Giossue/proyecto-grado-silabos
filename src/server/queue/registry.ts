import "server-only"
import { syllabusExportJob } from "../documents/syllabusExportJob"
import { sendMailJob } from "../mail/sendMailJob"
import type { AnyJobDefinition } from "./job"
import { platformSmokeJob } from "./jobs/platformSmoke"

export const registeredJobs: readonly AnyJobDefinition[] = [platformSmokeJob, sendMailJob, syllabusExportJob] as unknown as AnyJobDefinition[]
