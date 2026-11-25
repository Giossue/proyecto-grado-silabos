import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { bcryptVerify } from "../../server/auth/bcrypt"
import { createCatalog } from "../../server/library/catalog"
import { catalogSettings } from "../../server/library/catalogHandlers"
import { kohaFetch } from "../../server/library/kohaHttp"
import { SettingsController } from "./settings.controller"
import { SettingsRepository } from "./settings.repository"
import { SettingsService } from "./settings.service"
import { CONNECTION_FETCH, LIBRARY_DIRECTORY, PASSWORD_VERIFIER, SETTINGS_ENVIRONMENT } from "./settings.tokens"

@Module({
  controllers: [SettingsController],
  providers: [
    SettingsRepository,
    SettingsService,
    { provide: SETTINGS_ENVIRONMENT, useValue: () => process.env },
    { provide: PASSWORD_VERIFIER, useValue: bcryptVerify },
    { provide: CONNECTION_FETCH, useValue: (url: string, init: RequestInit) => fetch(url, init) },
    { provide: LIBRARY_DIRECTORY, useValue: async () => createCatalog(await catalogSettings(), kohaFetch).libraries() },
  ],
})
export class SettingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PhpInputMiddleware).forRoutes(SettingsController)
  }
}
