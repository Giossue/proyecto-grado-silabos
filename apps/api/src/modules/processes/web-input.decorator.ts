import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { requestInput } from "../../server/http/input"

export const WebRequest = createParamDecorator((_data: unknown, context: ExecutionContext) => webRequestOf(context.switchToHttp().getRequest<ApiRequest>()))

export const WebInput = createParamDecorator((_data: unknown, context: ExecutionContext) => requestInput(webRequestOf(context.switchToHttp().getRequest<ApiRequest>())))
