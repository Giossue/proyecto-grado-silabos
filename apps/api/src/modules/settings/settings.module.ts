import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { PrismaService } from "../../prisma/prisma.service"
import { bcryptVerify } from "../../server/auth/bcrypt"
import { createCatalog } from "../../server/library/catalog"
import { catalogSettings } from "../../server/library/catalogHandlers"
import { kohaFetch } from "../../server/library/kohaHttp"
import { SettingsController } from "./settings.controller"
import { SettingsRepository } from "./settings.repository"
import { SettingsService } from "./settings.service"
import { LIBRARY_DIRECTORY, PASSWORD_VERIFIER, SETTINGS_ENVIRONMENT } from "./settings.tokens"

@Module({
  controllers: [SettingsController],
  providers: [
    SettingsRepository,
    SettingsService,
    { provide: SETTINGS_ENVIRONMENT, useValue: () => process.env },
    { provide: PASSWORD_VERIFIER, useValue: bcryptVerify },
    {
      provide: LIBRARY_DIRECTORY,
      useFactory: (prisma: PrismaService) => async () => createCatalog(await catalogSettings(prisma), kohaFetch).libraries(),
      inject: [PrismaService],
    },
  ],
})
export class SettingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PhpInputMiddleware).forRoutes(SettingsController)
  }
}
