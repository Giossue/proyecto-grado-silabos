import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { phpQuery } from "../../server/http/input"

export const LibraryQuery = createParamDecorator((_data: unknown, context: ExecutionContext) => phpQuery(new URL(webRequestOf(context.switchToHttp().getRequest<ApiRequest>()).url)))
