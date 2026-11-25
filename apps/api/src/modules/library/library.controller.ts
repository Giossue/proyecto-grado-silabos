import { Body, Controller, Get, Inject, Post, Req, UseInterceptors } from "@nestjs/common"
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { LIBRARY_SORTS, SORT_DIRECTIONS } from "@silabos/shared/schemas/listSort"
import { REVIEW_OUTCOMES, REVIEW_STATES } from "@silabos/shared/schemas/library"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { PageContext, type PageLinks } from "../../common/decorators/query-input.decorator"
import { Roles } from "../../common/decorators/roles.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import type { AppSession } from "../../server/auth/types"
import type { BoundRevision } from "../../server/library/reviewDecisions"
import { ROLE_LIBRARIAN } from "../../server/syllabus/policy"
import type { ReviewRevision } from "../../server/syllabus/reviewDetails"
import { LibraryCommentDto } from "./dto/library-comment.dto"
import { LibraryReviewFiltersDto } from "./dto/library-review-filters.dto"
import { LibrarySignatureDto } from "./dto/library-signature.dto"
import { LibraryCommentInterceptor } from "./library-comment.interceptor"
import { LibraryQuery } from "./library-query.decorator"
import { LibraryFiltersInterceptor } from "./library-filters.interceptor"
import { LibraryDecisionPreloader, LibraryRevisionPreloader } from "./library-revision.preloader"
import { LibraryService } from "./library.service"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const NOT_FOUND = { description: "La revisión no existe.", type: MessageDto }
const REVISION = { name: "revision", format: "uuid" }

function FilterQueries() {
  return (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
    ApiQuery({ name: "q", required: false, type: String })(target, key, descriptor)
    ApiQuery({ name: "state", required: false, enum: [...REVIEW_STATES, ...REVIEW_OUTCOMES] })(target, key, descriptor)
    ApiQuery({ name: "faculty", required: false, format: "uuid", type: String })(target, key, descriptor)
    ApiQuery({ name: "sort", required: false, enum: LIBRARY_SORTS })(target, key, descriptor)
    ApiQuery({ name: "dir", required: false, enum: SORT_DIRECTIONS })(target, key, descriptor)
    ApiQuery({ name: "page", required: false, type: Number })(target, key, descriptor)
  }
}

@ApiTags("Biblioteca")
@Controller("library")
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly library: LibraryService) {}

  @Get("reviews")
  @Authenticated({ verified: true, activeRole: "required" })
  @Roles(ROLE_LIBRARIAN)
  @UseInterceptors(LibraryFiltersInterceptor)
  @FilterQueries()
  @ApiOkResponse({ description: "Sílabos del proceso actual enviados a biblioteca, paginados de 20 en 20, con quién los atiende." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  reviews(@LibraryQuery() filters: LibraryReviewFiltersDto, @PageContext() links: PageLinks) {
    return this.library.reviewsList(links, filters)
  }

  @Get("history")
  @Authenticated({ verified: true, activeRole: "required" })
  @Roles(ROLE_LIBRARIAN)
  @UseInterceptors(LibraryFiltersInterceptor)
  @FilterQueries()
  @ApiQuery({ name: "period", required: false, format: "uuid", type: String })
  @ApiQuery({ name: "mine", required: false, type: Boolean })
  @ApiOkResponse({ description: "Revisiones de biblioteca de procesos anteriores, con los períodos disponibles." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  history(@CurrentSession() session: AppSession, @LibraryQuery() filters: LibraryReviewFiltersDto, @PageContext() links: PageLinks) {
    return this.library.history(links, session, filters)
  }

  @Get("reviews/:revision")
  @Authenticated({ verified: true, activeRole: "required", preload: LibraryRevisionPreloader })
  @Roles(ROLE_LIBRARIAN)
  @UseInterceptors(LibraryFiltersInterceptor)
  @ApiParam(REVISION)
  @ApiOkResponse({ description: "Revisión de la bibliografía: secciones de biblioteca, firmas, comentarios y si la puede firmar o devolver." })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse(VALIDATION)
  detail(@LibraryQuery() _filters: LibraryReviewFiltersDto, @Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() revision: ReviewRevision) {
    return this.library.detail(webRequestOf(request), session, revision)
  }

  @Post("reviews/:revision/comments")
  @Authenticated({ verified: true, activeRole: "required", preload: LibraryDecisionPreloader })
  @UseInterceptors(LibraryCommentInterceptor)
  @ApiParam(REVISION)
  @ApiCreatedResponse({ description: "Devuelve el sílabo al docente con los motivos elegidos.", type: MessageDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse(VALIDATION)
  comment(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: BoundRevision, @Body() input: LibraryCommentDto) {
    return this.library.comment(webRequestOf(request), session, bound, input)
  }

  @Post("reviews/:revision/verify")
  @Authenticated({ verified: true, activeRole: "required", preload: LibraryDecisionPreloader })
  @Roles(ROLE_LIBRARIAN)
  @ApiParam(REVISION)
  @ApiCreatedResponse({ description: "Firma la bibliografía con la firma electrónica y la envía a coordinación.", type: MessageDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse(VALIDATION)
  verify(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: BoundRevision, @Body() input: LibrarySignatureDto) {
    return this.library.verify(webRequestOf(request), session, bound, input)
  }
}
