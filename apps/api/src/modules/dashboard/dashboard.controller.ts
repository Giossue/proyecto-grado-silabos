import { Controller, Get, Inject } from "@nestjs/common"
import { ApiConflictResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession } from "../../common/decorators/current-session.decorator"
import { MessageDto } from "../../common/dtos/api-responses.dto"
import type { AppSession } from "../../server/auth/types"
import { DashboardService } from "./dashboard.service"

const ROLE_REQUIRED = { description: "Falta elegir un rol vigente.", type: MessageDto }

@ApiTags("Panel")
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  @Authenticated({ verified: true, activeRole: "required" })
  @ApiOkResponse({ description: "Indicadores, lista de preparación, plazo y periodo académico de coordinación según el rol activo." })
  @ApiConflictResponse(ROLE_REQUIRED)
  summary(@CurrentSession() session: AppSession) {
    return this.dashboard.summary(session)
  }

  @Get("deadline")
  @Authenticated({ verified: true, activeRole: "required" })
  @ApiOkResponse({ description: "Plazo vigente para el rol activo, o null." })
  @ApiConflictResponse(ROLE_REQUIRED)
  deadline(@CurrentSession() session: AppSession) {
    return this.dashboard.deadline(session)
  }
}
