import { All, Controller, Req } from "@nestjs/common"
import { ApiExcludeController } from "@nestjs/swagger"
import { ROOT_PATHS } from "../../common/http/root-paths"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { WebReply } from "../../common/http/web-reply"
import { unmatchedRoute } from "../../server/http/router"

@ApiExcludeController()
@Controller()
export class FallbackApiController {
  @All(["", "*path"])
  handle(@Req() request: ApiRequest): WebReply {
    return new WebReply(unmatchedRoute(webRequestOf(request)))
  }
}

@ApiExcludeController()
@Controller()
export class FallbackRootController {
  @All(ROOT_PATHS)
  handle(@Req() request: ApiRequest): WebReply {
    return new WebReply(unmatchedRoute(webRequestOf(request)))
  }
}
