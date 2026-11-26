import { Body, Controller, Delete, Get, Inject, Post } from "@nestjs/common"
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { Roles } from "../../common/decorators/roles.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { AppSession } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import type { ProcessRow } from "../../server/syllabus/processes"
import { DeadlineExtensionDto, ProcessCreationDto, RedoConfirmationDto } from "./dto/process-bodies.dto"
import { ProcessPreloader } from "./process.preloader"
import { ProcessesService } from "./processes.service"
import { WebRequest } from "./web-input.decorator"

const ADMINISTRATOR = "administrador"
const BOUND = { verified: true, activeRole: "required", preload: ProcessPreloader } as const
const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const MISSING = { description: "El periodo académico no existe.", type: MessageDto }
const ROLE_REQUIRED = { description: "Falta elegir un rol vigente.", type: MessageDto }
const PROCESS = { name: "process", format: "uuid", description: "Periodo académico." }

@ApiTags("Periodos académicos")
@Controller("admin/processes")
export class ProcessesController {
  constructor(@Inject(ProcessesService) private readonly processes: ProcessesService) {}

  @Get()
  @Authenticated({ verified: true, activeRole: "required" })
  @Roles(ADMINISTRATOR)
  @ApiOkResponse({ description: "Periodos académicos con sus prórrogas, la plantilla, los períodos y el periodo académico vigente." })
  @ApiConflictResponse(ROLE_REQUIRED)
  list() {
    return this.processes.list()
  }

  @Post()
  @Authenticated({ verified: true, activeRole: "required" })
  @Roles(ADMINISTRATOR)
  @ApiBody({ type: ProcessCreationDto })
  @ApiCreatedResponse({ description: "Abre el periodo académico.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  create(@CurrentSession() session: AppSession, @Body() input: PhpArray) {
    return this.processes.create(session, input)
  }

  @Delete(":process")
  @Authenticated(BOUND)
  @Roles(ADMINISTRATOR)
  @ApiParam(PROCESS)
  @ApiOkResponse({ description: "Elimina el periodo académico abierto o en pausa con sus sílabos y avisa a docentes, coordinación y biblioteca.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse(VALIDATION)
  remove(@WebRequest() original: Request, @CurrentSession() session: AppSession, @Preloaded() process: ProcessRow) {
    return this.processes.remove(original, session, process)
  }

  @Get(":process/impact")
  @Authenticated(BOUND)
  @Roles(ADMINISTRATOR)
  @ApiParam(PROCESS)
  @ApiOkResponse({ description: "Sílabos del periodo académico por estado y su total." })
  @ApiNotFoundResponse(MISSING)
  impact(@Preloaded() process: ProcessRow) {
    return this.processes.impact(process)
  }

  @Post(":process/deadline")
  @Authenticated(BOUND)
  @Roles(ADMINISTRATOR)
  @ApiParam(PROCESS)
  @ApiBody({ type: DeadlineExtensionDto })
  @ApiOkResponse({ description: "Prorroga el plazo; si el periodo académico estaba cerrado, lo vuelve a abrir.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse({ description: "Errores por campo o confirmación pendiente (code: plantilla_cambiada o cambios_pendientes)." })
  extendDeadline(@WebRequest() original: Request, @CurrentSession() session: AppSession, @Preloaded() process: ProcessRow, @Body() input: PhpArray) {
    return this.processes.extendDeadline(original, session, process, input)
  }

  @Post(":process/pausar")
  @Authenticated(BOUND)
  @Roles(ADMINISTRATOR)
  @ApiParam(PROCESS)
  @ApiBody({ type: RedoConfirmationDto })
  @ApiOkResponse({ description: "Pausa el periodo académico abierto.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse(VALIDATION)
  pause(@CurrentSession() session: AppSession, @Preloaded() process: ProcessRow, @Body() input: PhpArray) {
    return this.processes.pause(session, process, input)
  }

  @Post(":process/reanudar")
  @Authenticated(BOUND)
  @Roles(ADMINISTRATOR)
  @ApiParam(PROCESS)
  @ApiBody({ type: RedoConfirmationDto })
  @ApiOkResponse({ description: "Reanuda el periodo académico en pausa.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse({ description: "Errores por campo o confirmación pendiente (code: plantilla_cambiada)." })
  resume(@WebRequest() original: Request, @CurrentSession() session: AppSession, @Preloaded() process: ProcessRow, @Body() input: PhpArray) {
    return this.processes.resume(original, session, process, input)
  }

  @Post(":process/cerrar")
  @Authenticated(BOUND)
  @Roles(ADMINISTRATOR)
  @ApiParam(PROCESS)
  @ApiBody({ type: RedoConfirmationDto })
  @ApiOkResponse({ description: "Cierra el periodo académico y guarda el documento de los sílabos sin enviar.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  @ApiUnprocessableEntityResponse(VALIDATION)
  close(@CurrentSession() session: AppSession, @Preloaded() process: ProcessRow, @Body() input: PhpArray) {
    return this.processes.close(session, process, input)
  }
}
