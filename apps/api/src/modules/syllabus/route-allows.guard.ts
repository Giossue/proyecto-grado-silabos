import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common"
import { ResponseException } from "../../common/exceptions/response.exception"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { routeAllows, unmatchedRoute } from "../../server/http/router"

@Injectable()
export class RouteAllowsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = webRequestOf(context.switchToHttp().getRequest<ApiRequest>())
    if (routeAllows(request)) return true
    throw new ResponseException(unmatchedRoute(request))
  }
}
