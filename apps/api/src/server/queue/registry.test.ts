// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { PrismaService } from "../../prisma/prisma.service"
import { registeredJobsOn } from "./registry"

describe("the jobs the worker processes", () => {
  const jobs = registeredJobsOn({} as PrismaService)

  it("keeps the earlier jobs and adds the answer of the teacher assistant", () => {
    expect(jobs.map((job) => job.name)).toEqual([
      "PlatformSmokeJob",
      "SendQueuedMailable",
      "GenerateSyllabusExportJob",
      "PrepareSupportDocumentViewJob",
      "AnswerTemplateAssistantJob",
      "AnswerTeacherAssistantJob",
    ])
  })

  it("answers a teacher once, on the AI queue", () => {
    const job = jobs.find((candidate) => candidate.name === "AnswerTeacherAssistantJob")!

    expect(job).toMatchObject({ queue: "ia", tries: 1, timeout: 180, runsOnce: true })
    expect(job.uniqueId!({ messageId: "m-1" } as never)).toBe("m-1")
    expect(job.failed).toBeTypeOf("function")
  })
})
