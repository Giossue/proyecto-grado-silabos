import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common"
import type { Worker } from "bullmq"
import type { Redis } from "ioredis"
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    const retryAfter = retryAfterSeconds()
    const jobs = registeredJobsOn(this.prisma)
    this.redis = createRedis({ maxRetriesPerRequest: null })
    this.workers = createWorkers({ jobs, connectionUrl: redisUrl(), prefix: queuePrefix(), lockPrefix: redisPrefix(), redis: this.redis, retryAfter })
    console.info(JSON.stringify({ message: "worker-started", queues: QUEUE_NAMES, jobs: jobs.map((job) => job.name), retryAfter }))
  }

  maxRunSeconds(): number {
    return maxRunSeconds()
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    console.info(JSON.stringify({ message: "worker-stopping", reason: signal ?? "max-time" }))
    await Promise.all(this.workers.map((worker) => worker.close()))
    await this.redis?.quit()
    this.logger.log("Workers closed")
  }
}
