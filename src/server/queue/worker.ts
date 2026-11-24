import { createRedis, redisPrefix, redisUrl } from "../redis/connection"
import { QUEUE_NAMES, queuePrefix, retryAfterSeconds } from "./config"
import { registeredJobs } from "./registry"
import { createWorkers } from "./workers"

const retryAfter = retryAfterSeconds()
const redis = createRedis({ maxRetriesPerRequest: null })
const workers = createWorkers({ jobs: registeredJobs, connectionUrl: redisUrl(), prefix: queuePrefix(), lockPrefix: redisPrefix(), redis, retryAfter })
const maxTime = Number.parseInt(process.env.QUEUE_MAX_TIME ?? "3600", 10)

console.info(JSON.stringify({ message: "worker-started", queues: QUEUE_NAMES, jobs: registeredJobs.map((job) => job.name), retryAfter }))

let stopping = false

async function stop(reason: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.info(JSON.stringify({ message: "worker-stopping", reason }))
  await Promise.all(workers.map((worker) => worker.close()))
  await redis.quit()
  process.exit(0)
}

process.on("SIGINT", () => void stop("SIGINT"))
process.on("SIGTERM", () => void stop("SIGTERM"))
if (maxTime > 0) setTimeout(() => void stop("max-time"), maxTime * 1000).unref()
