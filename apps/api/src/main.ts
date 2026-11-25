import "reflect-metadata"
import "./config/load-env"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { AppModule } from "./app.module"
import { configureApi, setupSwagger } from "./bootstrap"
import { apiPort } from "./config/api.config"
import { WebResponseExpressAdapter } from "./common/http/web-response.adapter"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  setupSwagger(app)
  app.enableShutdownHooks()
  await app.listen(apiPort())
  console.info(JSON.stringify({ message: "api-started", port: apiPort() }))
}

void bootstrap()
