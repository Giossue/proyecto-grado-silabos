import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import type { PhpArray } from "../../server/http/input"

export const WebRequest = createParamDecorator((_data: unknown, context: ExecutionContext): Request => webRequestOf(context.switchToHttp().getRequest<ApiRequest>()))

export const PhpInput = createParamDecorator((_data: unknown, context: ExecutionContext): PhpArray => (context.switchToHttp().getRequest<ApiRequest>().body as PhpArray | undefined) ?? {})
