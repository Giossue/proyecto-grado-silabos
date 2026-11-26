import { Module } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { createTemplateStore } from "../../server/shared/templateStore"
import { institutionToday } from "../../server/shared/clock"
import { libraryReviewCounts } from "../../server/library/reviewQueries"
import { DashboardController } from "./dashboard.controller"
import { PrismaDashboardRepository } from "./dashboard.repository"
import { DashboardService } from "./dashboard.service"
import { DASHBOARD_TEMPLATES, DASHBOARD_TODAY, LIBRARY_COUNTS } from "./dashboard.tokens"
import { PrismaSetupRepository } from "./setup.repository"

@Module({
  controllers: [DashboardController],
  providers: [
    PrismaDashboardRepository,
    PrismaSetupRepository,
    DashboardService,
    { provide: DASHBOARD_TEMPLATES, useFactory: (prisma: PrismaService) => createTemplateStore(prisma), inject: [PrismaService] },
    { provide: DASHBOARD_TODAY, useValue: institutionToday },
    { provide: LIBRARY_COUNTS, useFactory: (prisma: PrismaService) => () => libraryReviewCounts(prisma), inject: [PrismaService] },
  ],
})
export class DashboardModule {}
