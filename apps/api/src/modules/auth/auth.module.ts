import { Global, Module } from "@nestjs/common"
import { defaultBridgeDeps } from "../../server/auth/requireSession"
import { sharedRateLimiter } from "../../server/http/throttle"
import { RolesGuard } from "../../common/guards/roles.guard"
import { SessionGuard } from "../../common/guards/session.guard"
import { AUTH_BRIDGE, RATE_LIMITER } from "./auth.tokens"

@Global()
@Module({
  providers: [
    { provide: AUTH_BRIDGE, useFactory: defaultBridgeDeps },
    { provide: RATE_LIMITER, useFactory: sharedRateLimiter },
    SessionGuard,
    RolesGuard,
  ],
  exports: [AUTH_BRIDGE, RATE_LIMITER, SessionGuard, RolesGuard],
})
export class AuthModule {}
