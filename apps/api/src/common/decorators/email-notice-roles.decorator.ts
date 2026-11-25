import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { SessionRequest } from "../http/session-request"

export const EmailNoticeRoles = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<SessionRequest & { emailNoticeRoles?: string[] }>().emailNoticeRoles ?? [])
