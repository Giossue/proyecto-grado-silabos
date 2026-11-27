import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { AiModule } from "../ai/ai.module"
import { TemplateAssistantController } from "../ai/template-assistant.controller"
import { AiPermissionsRepository } from "./ai-permissions.repository"
import { LogosRepository } from "./logos.repository"
import { TemplateAssetsController } from "./template-assets.controller"
import { TemplateLocksRepository } from "./template-locks.repository"
import { TemplateLogoLimitMiddleware } from "./template-logo-limit.middleware"
import { TemplateProvisionRepository } from "./template-provision.repository"
import { TemplateRehearsalRepository } from "./template-rehearsal.repository"
import { TemplateStructureRepository } from "./template-structure.repository"
import { TemplateController } from "./template.controller"
import { TemplateFieldPreloader, TemplatePreloader } from "./template.preloader"
import { TemplateRepository } from "./template.repository"
import { TemplateService } from "./template.service"
import { TEMPLATE_TOKEN_PROVIDERS } from "./template.tokens"

@Module({
  imports: [AiModule],
  controllers: [TemplateAssistantController, TemplateController, TemplateAssetsController],
  providers: [
    TemplateRepository,
    TemplateLocksRepository,
    TemplateStructureRepository,
    TemplateProvisionRepository,
    TemplateRehearsalRepository,
    AiPermissionsRepository,
    LogosRepository,
    TemplateService,
    TemplatePreloader,
    TemplateFieldPreloader,
    TemplateLogoLimitMiddleware,
    ...TEMPLATE_TOKEN_PROVIDERS,
  ],
  exports: [TemplateRepository, TemplateLocksRepository, TemplateStructureRepository, TemplateProvisionRepository, TemplateRehearsalRepository, LogosRepository],
})
export class TemplateModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TemplateLogoLimitMiddleware).forRoutes({ path: "admin/template/:template/logo", method: RequestMethod.POST })
    consumer.apply(PhpInputMiddleware).forRoutes(TemplateAssistantController, TemplateController)
  }
}
