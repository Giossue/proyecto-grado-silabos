import { Controller, Get, Inject } from "@nestjs/common"
import { ApiConflictResponse, ApiOkResponse, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession } from "../../common/decorators/current-session.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { AppSession } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import { WebInput } from "../processes/web-input.decorator"
import { HelpService } from "./help.service"

const ROLE_REQUIRED = { description: "Falta elegir un rol vigente.", type: MessageDto }

@ApiTags("Ayuda")
@Controller("help")
export class HelpController {
  constructor(@Inject(HelpService) private readonly help: HelpService) {}

  @Get()
  @Authenticated({ verified: true, activeRole: "required" })
  @ApiQuery({ name: "screen", required: true, type: String, description: "Ruta de la pantalla, por ejemplo /admin/periodos." })
  @ApiOkResponse({ description: "Ayuda de la pantalla, o null si no tiene." })
  @ApiUnprocessableEntityResponse({ description: "Errores por campo.", type: ValidationErrorDto })
  @ApiConflictResponse(ROLE_REQUIRED)
  async screen(@WebInput() input: Promise<PhpArray>) {
    return this.help.screen(await input)
  }

  @Get("available")
  @Authenticated({ verified: true, activeRole: "required" })
  @ApiOkResponse({ description: "Ayudas de las pantallas del rol activo." })
  @ApiConflictResponse(ROLE_REQUIRED)
  available(@CurrentSession() session: AppSession) {
    return this.help.available(session)
  }
}
