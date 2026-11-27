import { Controller, Get, Inject, Post, Req } from "@nestjs/common"
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import {
  acceptTeacherProposalFor,
  discardTeacherProposalFor,
  sendTeacherAssistantMessageFor,
  showTeacherAssistantFor,
  type TeacherAssistantRouteDeps,
} from "../../server/ai/teacherAssistantRoutes"
import type { AppSession } from "../../server/auth/types"
import type { DraftSyllabus } from "../../server/syllabus/draftField"
import { LockVersionDto, TeacherAssistantRequestDto } from "./dto/syllabus.dto"
import { respond } from "./queued-response"
import { TeacherAssistantPreloader } from "./syllabus.preloaders"
import { TEACHER_ASSISTANT_DEPS } from "./syllabus.tokens"

const PRELOADED = { verified: true, activeRole: "required", preload: TeacherAssistantPreloader } as const
const MISSING = { description: "El sílabo o la propuesta no existe.", type: MessageDto }
const REFUSED = { description: "El asistente no está disponible o los datos no son válidos.", type: ValidationErrorDto }

@ApiTags("Asistente del docente")
@Controller("teacher/syllabi/:syllabus/assistant")
export class TeacherAssistantController {
  constructor(@Inject(TEACHER_ASSISTANT_DEPS) private readonly deps: TeacherAssistantRouteDeps) {}

  @Get()
  @Authenticated(PRELOADED)
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiOkResponse({ description: "Si el asistente está disponible y, en ese caso, la conversación del docente con sus propuestas y los pedidos que le quedan hoy." })
  @ApiNotFoundResponse(MISSING)
  show(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DraftSyllabus) {
    return respond(request, () => showTeacherAssistantFor({ session, syllabus }, this.deps))
  }

  @Post("messages")
  @Authenticated(PRELOADED)
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiBody({ type: TeacherAssistantRequestDto })
  @ApiAcceptedResponse({ description: "Registra el pedido y encola la respuesta en la cola «ia»." })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse(REFUSED)
  @ApiTooManyRequestsResponse({ description: "Ya hizo los 20 pedidos del día.", type: MessageDto })
  @ApiServiceUnavailableResponse({ description: "La cola no aceptó el pedido.", type: MessageDto })
  send(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DraftSyllabus) {
    return respond(request, (web) => sendTeacherAssistantMessageFor(web, { session, syllabus }, this.deps))
  }

  @Post("proposals/:proposal/accept")
  @Authenticated(PRELOADED)
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiParam({ name: "proposal", format: "uuid" })
  @ApiBody({ type: LockVersionDto })
  @ApiOkResponse({ description: "Devuelve el valor que el cliente coloca en el campo; no guarda ni envía el sílabo." })
  @ApiNotFoundResponse(MISSING)
  @ApiConflictResponse({ description: "El borrador cambió en otra sesión (versión de edición distinta).", type: MessageDto })
  @ApiUnprocessableEntityResponse(REFUSED)
  accept(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DraftSyllabus) {
    return respond(request, (web) => acceptTeacherProposalFor(web, { session, syllabus }, String(request.params.proposal), this.deps))
  }

  @Post("proposals/:proposal/discard")
  @Authenticated(PRELOADED)
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiParam({ name: "proposal", format: "uuid" })
  @ApiOkResponse({ description: "Descarta la propuesta.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse(REFUSED)
  discard(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DraftSyllabus) {
    return respond(request, () => discardTeacherProposalFor({ session, syllabus }, String(request.params.proposal), this.deps))
  }
}
