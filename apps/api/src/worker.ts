import "reflect-metadata"
import "./config/load-env"
import { NestFactory } from "@nestjs/core"
import { QueueWorkersService } from "./modules/queue/queue-workers.service"
import { WorkerModule } from "./worker.module"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn"] })
  app.enableShutdownHooks()
  const maxTime = app.get(QueueWorkersService).maxRunSeconds()
  if (maxTime > 0) setTimeout(() => void app.close(), maxTime * 1000).unref()
}

void bootstrap()
