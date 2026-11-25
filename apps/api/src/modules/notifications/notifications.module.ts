import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { EmailNoticeScopeInterceptor } from "./email-notice-scope.interceptor"
import { NotificationDestinationsRepository } from "./notification-destinations.repository"
import { NotificationPreloader } from "./notification.preloader"
import { NotificationsController } from "./notifications.controller"
import { NotificationsRepository } from "./notifications.repository"
import { NotificationsService } from "./notifications.service"

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationDestinationsRepository, NotificationsService, NotificationPreloader, EmailNoticeScopeInterceptor],
})
export class NotificationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PhpInputMiddleware).forRoutes(NotificationsController)
  }
}
