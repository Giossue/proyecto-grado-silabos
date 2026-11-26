import { Inject, Injectable } from "@nestjs/common"
import type { AppSession } from "../../server/auth/types"
import type { TemplateStore } from "../../server/shared/templateStore"
import { dashboardDeadlineFor, dashboardFor, type DashboardCoreDeps } from "../../server/dashboard/dashboard"
import { PrismaDashboardRepository } from "./dashboard.repository"
import { DASHBOARD_TEMPLATES, DASHBOARD_TODAY } from "./dashboard.tokens"
import { PrismaSetupRepository } from "./setup.repository"

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaDashboardRepository) private readonly dashboard: PrismaDashboardRepository,
    @Inject(PrismaSetupRepository) private readonly setup: PrismaSetupRepository,
    @Inject(DASHBOARD_TEMPLATES) private readonly templates: TemplateStore,
    @Inject(DASHBOARD_TODAY) private readonly today: () => string,
  ) {}

  summary(session: AppSession): Promise<Response> {
    return dashboardFor(session, this.deps())
  }

  deadline(session: AppSession): Promise<Response> {
    return dashboardDeadlineFor(session, this.deps())
  }

  private deps(): DashboardCoreDeps {
    return { dashboard: this.dashboard, setup: this.setup, templates: this.templates, today: this.today }
  }
}
