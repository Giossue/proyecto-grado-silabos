import { Controller, Delete, Get, Inject, Post } from "@nestjs/common"
import { ApiAcceptedResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { Roles } from "../../common/decorators/roles.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { StoredProposal } from "../../server/ai/assistantStore"
import type { AppSession } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import { PhpInput } from "../template/web-request.decorator"
import { AssistantService } from "./assistant.service"
import { ProposalPreloader } from "./proposal.preloader"

const ADMIN = "administrador"
const SESSION = { verified: true, activeRole: "required" } as const
const PROPOSAL = { ...SESSION, preload: ProposalPreloader }
const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const MISSING = { description: "La plantilla o la propuesta no existe.", type: MessageDto }

@ApiTags("Asistente de plantilla")
@Controller("admin/template/assistant")
export class TemplateAssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Get()
  @Authenticated(SESSION)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Conversación vigente con el asistente y su disponibilidad." })
  @ApiNotFoundResponse(MISSING)
  show(@CurrentSession() session: AppSession) {
    return this.assistant.show(session)
  }

  @Delete()
  @Authenticated(SESSION)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Oculta la conversación y empieza un chat nuevo.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  clear(@CurrentSession() session: AppSession) {
    return this.assistant.clear(session)
  }

  @Post("messages")
  @Authenticated(SESSION)
  @Roles(ADMIN)
  @ApiAcceptedResponse({ description: "Registra la pregunta y encola la respuesta en la cola «ia»." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  sendMessage(@PhpInput() input: PhpArray, @CurrentSession() session: AppSession) {
    return this.assistant.sendMessage(input, session)
  }

  @Get("proposals/:proposal")
  @Authenticated(PROPOSAL)
  @Roles(ADMIN)
  @ApiParam({ name: "proposal", format: "uuid" })
  @ApiOkResponse({ description: "Detalle de la propuesta del asistente." })
  @ApiNotFoundResponse(MISSING)
  proposal(@CurrentSession() session: AppSession, @Preloaded() proposal: StoredProposal) {
    return this.assistant.proposal(session, proposal)
  }

  @Post("proposals/:proposal/apply")
  @Authenticated(PROPOSAL)
  @Roles(ADMIN)
  @ApiParam({ name: "proposal", format: "uuid" })
  @ApiOkResponse({ description: "Marca la propuesta como aplicada.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiNotFoundResponse(MISSING)
  apply(@CurrentSession() session: AppSession, @Preloaded() proposal: StoredProposal) {
    return this.assistant.apply(session, proposal)
  }

  @Post("proposals/:proposal/discard")
  @Authenticated(PROPOSAL)
  @Roles(ADMIN)
  @ApiParam({ name: "proposal", format: "uuid" })
  @ApiOkResponse({ description: "Descarta la propuesta.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiNotFoundResponse(MISSING)
  discard(@CurrentSession() session: AppSession, @Preloaded() proposal: StoredProposal) {
    return this.assistant.discard(session, proposal)
  }
}
