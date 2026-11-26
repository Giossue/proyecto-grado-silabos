import type { PrismaService } from "../../../prisma/prisma.service"
import { defineJob } from "../job"

export function createPlatformSmokeJob(prisma: () => PrismaService) {
  return defineJob<{ key: string }>({
    name: "PlatformSmokeJob",
    queue: "critica",
    tries: 3,
    timeout: 30,
    backoff: [1, 5, 15],
    uniqueId: (data) => data.key,
    runsOnce: true,
    async handle(data) {
      await prisma().$queryRaw`select 1`
      console.info(JSON.stringify({ message: "platform-smoke-ok", key: data.key }))
    },
    failed(_data, error) {
      console.error(error)
    },
  })
}

export function platformSmokeJobOn(prisma: PrismaService) {
  return createPlatformSmokeJob(() => prisma)
}

export const platformSmokeJob = createPlatformSmokeJob(() => {
  throw new Error("PlatformSmokeJob runs only in the worker, built with platformSmokeJobOn.")
})
