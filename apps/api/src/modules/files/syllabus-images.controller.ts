import { Controller, Get, Inject, Param, Req } from "@nestjs/common"
import { ApiExcludeController } from "@nestjs/swagger"
import type { ApiRequest } from "../../common/http/web-request"
import { respond } from "../syllabus/queued-response"
import { SYLLABUS_IMAGES } from "./files.tokens"

export type SyllabusImages = (request: Request, file: string) => Promise<Response>

@ApiExcludeController()
@Controller("images/silabo")
export class SyllabusImagesController {
  constructor(@Inject(SYLLABUS_IMAGES) private readonly images: SyllabusImages) {}

  @Get(":file")
  image(@Req() request: ApiRequest, @Param("file") file: string) {
    return respond(request, (web) => this.images(web, file))
  }
}
