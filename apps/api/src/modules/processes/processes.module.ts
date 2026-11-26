import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { PhpInputMiddleware } from "../../common/middleware/php-input.middleware"
import { institutionToday } from "../../server/shared/clock"
import { PrismaService } from "../../prisma/prisma.service"
import { createTemplateStore } from "../../server/shared/templateStore"
import { createClosingDeps } from "../../server/syllabus/processClosingStore"
import { createProcessWriteDeps } from "../../server/syllabus/processWriteStore"
import { ProcessPreloader } from "./process.preloader"
import { ProcessesController } from "./processes.controller"
import { ProcessesRepository } from "./processes.repository"
import { ProcessesService } from "./processes.service"
import { INSTITUTION_TODAY, PROCESS_CLOSING, PROCESS_WRITES, TEMPLATE_STORE } from "./processes.tokens"

@Module({
  controllers: [ProcessesController],
  providers: [
    ProcessesRepository,
    ProcessesService,
    ProcessPreloader,
    { provide: TEMPLATE_STORE, useFactory: (prisma: PrismaService) => createTemplateStore(prisma), inject: [PrismaService] },
    { provide: INSTITUTION_TODAY, useValue: institutionToday },
    { provide: PROCESS_WRITES, useFactory: (prisma: PrismaService) => createProcessWriteDeps(prisma), inject: [PrismaService] },
    { provide: PROCESS_CLOSING, useFactory: (prisma: PrismaService) => createClosingDeps(prisma), inject: [PrismaService] },
  ],
  exports: [ProcessesRepository, TEMPLATE_STORE, INSTITUTION_TODAY],
})
export class ProcessesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PhpInputMiddleware).forRoutes(ProcessesController)
  }
}
