import "server-only"
import { sendMailJob } from "../mail/sendMailJob"
import type { AnyJobDefinition } from "./job"
import { platformSmokeJob } from "./jobs/platformSmoke"

export const registeredJobs: readonly AnyJobDefinition[] = [platformSmokeJob, sendMailJob] as unknown as AnyJobDefinition[]
