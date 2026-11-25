import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { SessionRequest } from "../http/session-request"

export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<SessionRequest>().appSession)

export const Preloaded = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<SessionRequest>().preloaded)
