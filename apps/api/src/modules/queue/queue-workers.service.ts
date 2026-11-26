import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common"
import type { Worker } from "bullmq"
import type { Redis } from "ioredis"
import { runDailyDigest } from "../../server/notifications/dailyDigest"
import { digestDepsOn } from "../../server/notifications/dailyDigestRuntime"
import { createRedis, redisPrefix, redisUrl } from "../../server/redis/connection"
import { maxRunSeconds, QUEUE_NAMES, queuePrefix, retryAfterSeconds } from "../../server/queue/config"
import { PrismaService } from "../../prisma/prisma.service"
import { registeredJobsOn } from "../../server/queue/registry"
import { createWorkers } from "../../server/queue/workers"

@Injectable()
export class QueueWorkersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QueueWorkersService.name)
  private redis: Redis | null = null
  private workers: Worker[] = []
  private digestTimer: NodeJS.Timeout | null = null
  private digestRun: Promise<void> | null = null

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    const retryAfter = retryAfterSeconds()
    const jobs = registeredJobsOn(this.prisma)
    this.redis = createRedis({ maxRetriesPerRequest: null })
    this.workers = createWorkers({ jobs, connectionUrl: redisUrl(), prefix: queuePrefix(), lockPrefix: redisPrefix(), redis: this.redis, retryAfter })
    const digest = digestDepsOn(this.prisma, this.redis)
    this.digestTimer = setInterval(() => {
      this.digestRun ??= runDailyDigest(digest)
        .then((sent) => {
          if (sent > 0) console.info(JSON.stringify({ message: "daily-summary-queued", sent }))
        })
        .catch((error: unknown) => this.logger.error(`Daily summary failed: ${String(error)}`))
        .finally(() => {
          this.digestRun = null
        })
    }, 60_000)
    console.info(JSON.stringify({ message: "worker-started", queues: QUEUE_NAMES, jobs: jobs.map((job) => job.name), retryAfter }))
  }

  maxRunSeconds(): number {
    return maxRunSeconds()
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    console.info(JSON.stringify({ message: "worker-stopping", reason: signal ?? "max-time" }))
    if (this.digestTimer) clearInterval(this.digestTimer)
    // A summary being queued finishes before its connection closes.
    await this.digestRun
    await Promise.all(this.workers.map((worker) => worker.close()))
    await this.redis?.quit()
    this.logger.log("Workers closed")
  }
}
