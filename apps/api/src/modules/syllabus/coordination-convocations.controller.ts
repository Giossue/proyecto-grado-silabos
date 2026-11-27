import { Controller, Get, Inject, Post, Req } from "@nestjs/common"
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { AppSession } from "../../server/auth/types"
import { createConvocationFor, resumeConvocationFor, type ConvocationWriteDeps } from "../../server/syllabus/convocationWrites"
import { convocationDetailFor, convocationsFor, pauseConvocationFor, type ConvocationDeps, type ConvocationRecord } from "../../server/syllabus/convocations"
import { ConvocationDto } from "./dto/syllabus.dto"
import { respond } from "./queued-response"
import { ConvocationPreloader, ResumableConvocationPreloader } from "./syllabus.preloaders"
import { CONVOCATION_DEPS, CONVOCATION_WRITE_DEPS } from "./syllabus.tokens"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const ACTIVE_ROLE = { verified: true, activeRole: "required" } as const

@ApiTags("Coordinación: procesos de sílabos")
@Controller("coordination/convocations")
export class CoordinationConvocationsController {
  constructor(
    @Inject(CONVOCATION_DEPS) private readonly convocations: ConvocationDeps,
    @Inject(CONVOCATION_WRITE_DEPS) private readonly writes: ConvocationWriteDeps,
  ) {}

  @Get()
  @Authenticated(ACTIVE_ROLE)
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "state", required: false, enum: ["all", "sin_iniciar", "preparacion", "abierto", "pausado", "cerrado"] })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiOkResponse({ description: "Procesos institucionales con el proceso de sílabos de la carrera del rol activo, de 20 en 20." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  list(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => convocationsFor(web, session, this.convocations))
  }

  @Post()
  @Authenticated(ACTIVE_ROLE)
  @ApiBody({ type: ConvocationDto })
  @ApiCreatedResponse({ description: "Abre el proceso de sílabos de la carrera y genera un sílabo por paralelo." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  create(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => createConvocationFor(web, session, this.writes))
  }

  @Get(":convocation")
  @Authenticated({ ...ACTIVE_ROLE, preload: ConvocationPreloader })
  @ApiParam({ name: "convocation", format: "uuid" })
  @ApiOkResponse({ description: "Proceso de sílabos con sus sílabos y conteos por estado." })
  @ApiNotFoundResponse({ description: "El proceso de sílabos no existe.", type: MessageDto })
  detail(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() convocation: ConvocationRecord) {
    return respond(request, () => convocationDetailFor(session, convocation, this.convocations))
  }

  @Post(":convocation/pausar")
  @Authenticated({ ...ACTIVE_ROLE, preload: ConvocationPreloader })
  @ApiParam({ name: "convocation", format: "uuid" })
  @ApiOkResponse({ description: "Pausa el proceso de sílabos abierto.", type: MessageDto })
  @ApiForbiddenResponse({ description: "El proceso de sílabos no es de su carrera o no está abierto.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  pause(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() convocation: ConvocationRecord) {
    return respond(request, () => pauseConvocationFor(session, convocation, this.convocations))
  }

  @Post(":convocation/reanudar")
  @Authenticated({ ...ACTIVE_ROLE, preload: ResumableConvocationPreloader })
  @ApiParam({ name: "convocation", format: "uuid" })
  @ApiOkResponse({ description: "Reanuda el proceso de sílabos pausado y genera los sílabos de los paralelos nuevos.", type: MessageDto })
  @ApiConflictResponse({ description: "Sin rol activo vigente." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  resume(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() convocation: ConvocationRecord) {
    return respond(request, (web) => resumeConvocationFor(web, session, convocation, this.writes))
  }
}
