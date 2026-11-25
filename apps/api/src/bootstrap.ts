import { type INestApplication, RequestMethod } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import cookieParser from "cookie-parser"
import { cleanupOpenApiDoc } from "nestjs-zod"
import { API_PREFIX, webOrigins } from "./config/api.config"
import { ApiExceptionFilter } from "./common/filters/api-exception.filter"
import { ApiResponseInterceptor } from "./common/interceptors/api-response.interceptor"
import { rawBodyMiddleware } from "./common/middleware/raw-body.middleware"
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe"
import { SESSION_COOKIE } from "./common/decorators/authenticated.decorator"
import { UNPREFIXED_PATHS } from "./common/http/root-paths"

export const DOCS_PATH = "api/docs"

export function configureApi(app: NestExpressApplication): NestExpressApplication {
  app.disable("x-powered-by")
  app.set("etag", false)
  app.use(rawBodyMiddleware)
  app.use(cookieParser())
  app.enableCors({ origin: webOrigins(), credentials: true, preflightContinue: true })
  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_PATHS.map((path) => ({ path, method: RequestMethod.ALL })) })
  app.useGlobalPipes(new ZodValidationPipe())
  app.useGlobalFilters(new ApiExceptionFilter())
  app.useGlobalInterceptors(new ApiResponseInterceptor(app.get(Reflector)))
  return app
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Sílabos UEB API")
    .setDescription("API del sistema de sílabos. Las rutas viven bajo /api/v1 y usan la cookie de sesión del ingreso.")
    .setVersion("1.0")
    .addCookieAuth(SESSION_COOKIE)
    .build()
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))
  SwaggerModule.setup(DOCS_PATH, app, document, { jsonDocumentUrl: `${DOCS_PATH}-json` })
}
