import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common"
import { ModuleRef, Reflector } from "@nestjs/core"
import type { Response as ExpressResponse } from "express"
import { authenticate } from "../../server/auth/requireSession"
import type { BridgeDeps } from "../../server/auth/types"
import { throttle, type RateLimiter } from "../../server/http/throttle"
import { AUTH_BRIDGE, RATE_LIMITER } from "../../modules/auth/auth.tokens"
import { AUTHENTICATED, type AuthenticatedOptions } from "../decorators/authenticated.options"
import { ResponseException } from "../exceptions/response.exception"
import type { SessionRequest } from "../http/session-request"
import { webRequestOf } from "../http/web-request"

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<AuthenticatedOptions | undefined>(AUTHENTICATED, [context.getHandler(), context.getClass()]) ?? {}
    const http = context.switchToHttp()
    const request = http.getRequest<SessionRequest>()
    const response = http.getResponse<ExpressResponse>()
    const web = webRequestOf(request)
    const preloader = options.preload ? this.moduleRef.get(options.preload, { strict: false }) : null
    const { rateLimit } = options
    const hooked = rateLimit !== undefined || preloader !== null
    const { outcome, cookies } = await authenticate(
      web,
      {
        verified: options.verified,
        activeRole: options.activeRole,
        afterAuthentication: hooked
          ? async (user) => {
              if (rateLimit) {
                const gate = throttle(this.limiter, { key: `${rateLimit.name}:${user.id}`, maxAttempts: rateLimit.maxAttempts, decaySeconds: rateLimit.decaySeconds }, this.bridge.now)
                request.rateLimit = gate
                const limited = await gate.hit()
                if (limited) return limited
              }
              return preloader ? preloader.load(web, user, request) : null
            }
          : undefined,
      },
      this.bridge,
    )
    for (const cookie of cookies) response.append("Set-Cookie", cookie)
    if (outcome instanceof Response) throw new ResponseException(outcome)
    request.appSession = outcome
    return true
  }
}
