import { Module } from "@nestjs/common"
import { createTemplateStore } from "../../server/configuration/templateStore"
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
    { provide: DASHBOARD_TEMPLATES, useFactory: createTemplateStore },
    { provide: DASHBOARD_TODAY, useValue: institutionToday },
    { provide: LIBRARY_COUNTS, useValue: libraryReviewCounts },
  ],
})
export class DashboardModule {}
