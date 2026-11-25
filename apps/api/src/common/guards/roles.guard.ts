import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { forbidden } from "../../server/http/responses"
import { ROLES } from "../decorators/roles.decorator"
import { ResponseException } from "../exceptions/response.exception"
import type { SessionRequest } from "../http/session-request"

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, [context.getHandler(), context.getClass()])
    if (!roles || roles.length === 0) return true
    const role = context.switchToHttp().getRequest<SessionRequest>().appSession?.activeRole?.role
    if (role !== undefined && roles.includes(role)) return true
    throw new ResponseException(forbidden())
  }
}
