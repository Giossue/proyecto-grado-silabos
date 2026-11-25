import { All, Controller, Req } from "@nestjs/common"
import { ApiExcludeController } from "@nestjs/swagger"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { WebReply } from "../../common/http/web-reply"
import { dispatchLegacy } from "./legacy-router"
import { LEGACY_ROUTES } from "./legacy-routes"

export const LEGACY_ROOT_PATHS = ["api", "api/*path", "logos/*path", "images/*path", "plantilla.schema.json"]

@ApiExcludeController()
@Controller()
export class LegacyApiController {
  @All(["", "*path"])
  async handle(@Req() request: ApiRequest): Promise<WebReply> {
    return new WebReply(await dispatchLegacy(LEGACY_ROUTES, webRequestOf(request)))
  }
}

@ApiExcludeController()
@Controller()
export class LegacyRootController {
  @All(LEGACY_ROOT_PATHS)
  async handle(@Req() request: ApiRequest): Promise<WebReply> {
    return new WebReply(await dispatchLegacy(LEGACY_ROUTES, webRequestOf(request)))
  }
}
